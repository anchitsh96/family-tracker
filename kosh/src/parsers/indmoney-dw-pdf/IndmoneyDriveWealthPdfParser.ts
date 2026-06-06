// Parses the INDmoney Global (IFSC) / DriveWealth US-stock account
// statement PDF.
//
// INDmoney is the Indian broker; DriveWealth is the US clearing partner
// that actually custodies the shares. Every monthly statement is laid out
// the same: a 1-page summary up top, the HOLDINGS table buried on the
// last page (typically page 7). We pull the HOLDINGS table only.
//
// The table has two sub-sections:
//   - "Equity" — actual US stocks (AAPL, NVDA, etc.)
//   - "MoneyMarket funds" — the cash sweep (DWBDS), shown as a fund row.
//
// Columns: Description, Symbol, Quantity, Unit Cost, Total Cost,
//          Market Price, Market Value, Gain/(Loss), A/C Type
//
// Every monetary number on this statement is in USD. The parser records
// the USD market value on each holding as `valueNative` + `nativeCurrency
// = 'USD'`. We do NOT convert to INR here — the conversion happens at
// display time so the dashboard reflects the live FX rate (see
// state/fx.ts). We seed `valueInr = 0` and let the dashboard recompute.

import {
  Parser,
  ParserInput,
  ParserResult,
  ExtractedAccountBundle,
  ExtractedHolding,
  ParserWarning,
} from '@/types/parser';

const NAME = 'indmoney-dw-pdf';
const VERSION = '1';

// Detection anchors. We require at least one of the INDmoney/DriveWealth
// brand markers AND the HOLDINGS table header, so we don't falsely
// claim any random "Account Statement" PDF.
const BRAND_ANCHORS = [
  'INDmoney Global',
  'DriveWealth',
  'DRIVEWEALTH',
];
const STRUCTURE_ANCHORS = [
  'HOLDINGS',
  'Market Value',
  'Symbol',
];

// Matches a USD-style number: optional minus, optional thousands commas,
// optional decimal. e.g. "1,234.56" or "0.0789" or "-12.34".
const USD_NUM = /-?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytesToText(input: ParserInput): string {
  if (input.textPreview && input.textPreview.length > 0) return input.textPreview;
  return new TextDecoder('utf-8', { fatal: false }).decode(input.bytes);
}

function parseUsdNumber(s: string): number {
  const cleaned = s.replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function isNumericToken(t: string): boolean {
  const m = t.match(USD_NUM);
  return m !== null && m[0] === t;
}

function trailingNumericCount(tokens: string[]): number {
  let n = 0;
  for (let j = tokens.length - 1; j >= 0; j--) {
    if (isNumericToken(tokens[j]!)) n += 1;
    else break;
  }
  return n;
}

// Tickers on this statement are uppercase A-Z, 1-5 chars. The cash sweep
// shows as "DWBDS" so allow up to 5.
function looksLikeTicker(t: string): boolean {
  return /^[A-Z]{1,5}$/.test(t);
}

// Statement period header gives us the closing date for the as-of:
//   "Statement Period: May 01, 2026 - May 31, 2026"
// We want the END of the range (the holdings are "as of" close of period).
const MONTHS: Record<string, string> = {
  January: '01', February: '02', March: '03', April: '04',
  May: '05', June: '06', July: '07', August: '08',
  September: '09', October: '10', November: '11', December: '12',
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', Jun: '06', Jul: '07',
  Aug: '08', Sep: '09', Sept: '09', Oct: '10', Nov: '11', Dec: '12',
};

function extractStatementEndDate(text: string): string | null {
  // Tolerate both "May 01, 2026 - May 31, 2026" and the same with an
  // en-dash or "to" between the dates.
  const re =
    /Statement\s*Period[:\s]*[A-Za-z]+\s+\d{1,2},?\s*\d{4}\s*(?:-|–|to)\s*([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/i;
  const m = text.match(re);
  if (!m) {
    // Fallback: any "to <Month> <DD>, <YYYY>" pattern near the top.
    const m2 = text.match(/(?:-|–|to)\s+([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
    if (!m2) return null;
    return monthDayYearToIso(m2[1]!, m2[2]!, m2[3]!);
  }
  return monthDayYearToIso(m[1]!, m[2]!, m[3]!);
}

function monthDayYearToIso(monthName: string, day: string, year: string): string | null {
  const mm = MONTHS[monthName];
  if (!mm) return null;
  const dd = day.padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// HOLDINGS table extraction
// ---------------------------------------------------------------------------

interface RawHoldingRow {
  description: string;
  symbol: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  marketPrice: number;
  marketValue: number;
  gainLoss: number;
  acType?: string;
  subSection: 'Equity' | 'MoneyMarket';
}

// Find the line index where "HOLDINGS" appears (case-insensitive, on its
// own — not the word "holdings" appearing inside body text).
function findHoldingsStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const t = (lines[i] ?? '').trim();
    if (/^HOLDINGS$/i.test(t)) return i;
    // Some renders concatenate "HOLDINGS" with the next header on the
    // same line. Match a leading anchor too.
    if (/^HOLDINGS\b/i.test(t) && t.length < 80) return i;
  }
  return -1;
}

// Find the next "totals" / footer line that ends the HOLDINGS section.
// Statement totals row looks like "Total $X.XX". After it, the doc
// continues into disclosures.
function findHoldingsEnd(lines: string[], start: number): number {
  for (let j = start + 1; j < lines.length; j++) {
    const t = (lines[j] ?? '').trim();
    if (/^Total\b.*\$/.test(t)) return j;
    if (/^(Disclosures?|Disclaimer|Notice|Note)\b/i.test(t)) return j;
    if (/^TRANSACTION\s+DETAILS/i.test(t)) return j;
  }
  return lines.length;
}

function parseHoldingsSection(lines: string[]): RawHoldingRow[] {
  const start = findHoldingsStart(lines);
  if (start < 0) return [];
  const end = findHoldingsEnd(lines, start);

  const out: RawHoldingRow[] = [];
  let subSection: 'Equity' | 'MoneyMarket' = 'Equity';

  // PDFKit on this statement renders each holding row on one line:
  //   "APPLE INC AAPL 0.0789 186.42 14.71 201.57 15.90 1.19 CASH"
  // The trailing token can be A/C type (CASH / MARGIN / IRA) or absent.
  // The first non-ticker tokens form the description; the rest are
  // 7 numbers (or 6 if the doc compressed) followed by an optional code.

  for (let i = start + 1; i < end; i++) {
    const raw = (lines[i] ?? '').trim();
    if (!raw) continue;

    // Sub-section headers.
    if (/^Equity\s*$/i.test(raw)) {
      subSection = 'Equity';
      continue;
    }
    if (/^Money\s*Market\s*funds?\b/i.test(raw)) {
      subSection = 'MoneyMarket';
      continue;
    }
    // Column header row.
    if (/^Description\b/i.test(raw) && /Symbol/i.test(raw)) continue;
    // Page header / footer noise.
    if (/^Page\s+\d+/i.test(raw)) continue;
    if (/^Account\s+Statement$/i.test(raw)) continue;
    if (/^Account\s+Number/i.test(raw)) continue;

    // Tokenise. The A/C type column is the only non-numeric trailing
    // token in this format — always alphabetic, e.g. CASH / MARGIN /
    // IRA. Peel it off if present so the numeric counter sees a clean
    // tail. We deliberately allow short alphabetic codes like "CASH"
    // (4 chars) even though they'd otherwise look like a ticker — the
    // ticker on a row is never at the end, it's mid-row right before
    // the numeric block.
    let tokens = raw.split(/\s+/).filter(Boolean);
    if (tokens.length < 8) continue;

    let acType: string | undefined;
    const last = tokens[tokens.length - 1]!;
    if (!isNumericToken(last) && /^[A-Z]{2,8}$/.test(last)) {
      acType = last;
      tokens = tokens.slice(0, -1);
    }

    const trailing = trailingNumericCount(tokens);
    if (trailing < 6) continue; // not a holding row

    // The 7 numerics are: Quantity, Unit Cost, Total Cost, Market Price,
    // Market Value, Gain/(Loss). DriveWealth sometimes drops Gain/(Loss)
    // if it's exactly 0 — handle both 6 and 7.
    let numericTokens = tokens.slice(tokens.length - trailing);
    let headTokens = tokens.slice(0, tokens.length - trailing);

    if (headTokens.length === 0) continue;

    // The last head token should be the ticker symbol. If not, push
    // the leading numerics back as description (rare).
    let symbol = headTokens[headTokens.length - 1]!;
    if (!looksLikeTicker(symbol)) {
      // Maybe smushed: "INC AAPL". Look at last 2.
      // If the prior token has a stretched form we can't split, skip.
      continue;
    }
    const description = headTokens.slice(0, -1).join(' ').trim();
    if (!description) continue;

    // Use the LAST 6 numbers as the data block (Quantity..Gain/Loss).
    // If we have 7, the first is something we don't model (some statements
    // include Cost Basis duplicated) — but in our format the 6 are exactly:
    //   Quantity, Unit Cost, Total Cost, Market Price, Market Value, Gain/(Loss)
    // The Gain/(Loss) column is the 6th. If trailing == 5, statement
    // omitted Gain/(Loss); pad with 0.
    let nums = numericTokens.map(parseUsdNumber);
    if (nums.length === 5) nums = [...nums, 0];
    if (nums.length > 6) nums = nums.slice(0, 6);
    if (nums.length < 6) continue;

    const [quantity, unitCost, totalCost, marketPrice, marketValue, gainLoss] = nums as [
      number, number, number, number, number, number,
    ];

    out.push({
      description,
      symbol,
      quantity,
      unitCost,
      totalCost,
      marketPrice,
      marketValue,
      gainLoss,
      acType,
      subSection,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Valuation Summary (for cross-check + totals)
// ---------------------------------------------------------------------------

interface ValuationSummary {
  endingValue: number | null;
}

function extractValuationSummary(text: string): ValuationSummary {
  // "Ending Portfolio Value $136.25" or "Ending Value $136.25"
  const m = text.match(/Ending\s+(?:Portfolio\s+)?Value[^\n$]*\$\s*([\d,]+\.\d{2})/i);
  if (m) return { endingValue: parseUsdNumber(m[1]!) };
  return { endingValue: null };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export const IndmoneyDriveWealthPdfParser: Parser = {
  name: NAME,
  version: VERSION,
  inputType: 'pdf',

  async detect(input: ParserInput): Promise<number> {
    if (input.type !== 'pdf') return 0;
    const text = bytesToText(input);
    if (!text || text.length < 100) return 0;
    let brandHits = 0;
    for (const a of BRAND_ANCHORS) if (text.includes(a)) brandHits += 1;
    if (brandHits === 0) return 0;
    let structHits = 0;
    for (const a of STRUCTURE_ANCHORS) if (text.includes(a)) structHits += 1;
    if (structHits < 2) return 0.3 + brandHits * 0.1;
    return 0.97;
  },

  async parse(input: ParserInput): Promise<ParserResult> {
    const warnings: ParserWarning[] = [];
    const text = bytesToText(input);
    if (!text || text.length < 200) {
      return {
        ok: false,
        parser: { name: NAME, version: VERSION },
        code: 'NO_TEXT',
        message:
          'PDF text was not provided. The upload pipeline must call the PDF text extractor before invoking the parser.',
        warnings,
      };
    }

    const lines = text.split('\n');
    const asOfDate =
      extractStatementEndDate(text) ?? new Date().toISOString().slice(0, 10);
    const valuation = extractValuationSummary(text);
    const rows = parseHoldingsSection(lines);

    if (rows.length === 0) {
      return {
        ok: false,
        parser: { name: NAME, version: VERSION },
        code: 'NO_HOLDINGS_FOUND',
        message:
          'PDF was identified as INDmoney/DriveWealth but no holdings could be extracted. Layout may have changed.',
        warnings,
      };
    }

    // Holdings: every row keeps USD as the native currency. We leave
    // `valueInr` at 0 here — the dashboard recomputes INR live from
    // valueNative × current FX so the displayed rupee total tracks the
    // moving rate. (If `valueInr` were a non-zero stale parse-time
    // number, places that haven't yet been wired to use the FX store
    // would show drift.)
    const holdings: ExtractedHolding[] = rows.map((r) => ({
      instrumentName: r.description,
      isin: undefined, // US tickers don't carry an ISIN on this statement
      quantity: r.quantity,
      unitPrice: r.marketPrice,
      valueInr: 0,
      valueNative: Math.round(r.marketValue * 100) / 100,
      nativeCurrency: 'USD',
      asOfDate,
      rowMeta: {
        symbol: r.symbol,
        subSection: r.subSection,
        unitCost: r.unitCost,
        totalCost: r.totalCost,
        gainLoss: r.gainLoss,
        ...(r.acType ? { acType: r.acType } : {}),
      },
    }));

    // Sanity cross-check: sum of market values should be within ~2% of
    // the page-1 "Ending Portfolio Value". Tiny variance is expected
    // because the summary includes cash plus shares; ours does too.
    const sumUsd = rows.reduce((s, r) => s + r.marketValue, 0);
    if (valuation.endingValue !== null && valuation.endingValue > 0) {
      const stated = valuation.endingValue;
      if (Math.abs(sumUsd - stated) / stated > 0.02) {
        warnings.push({
          level: 'warn',
          code: 'TOTAL_USD_MISMATCH',
          message: `Sum of holdings $${sumUsd.toFixed(
            2
          )} differs from stated ending value $${stated.toFixed(2)} by more than 2%`,
        });
      }
    }

    const bundle: ExtractedAccountBundle = {
      account: {
        bucket: 'equity_us',
        provider: 'indmoney_dw',
        nickname: 'INDmoney US Stocks',
        currency: 'USD',
      },
      holdings,
      totals: {
        // Bundle-level totals are still typed as INR in v1. We leave
        // them undefined for USD bundles so no one mis-interprets a
        // dollar number as a rupee number.
      },
    };

    return {
      ok: true,
      parser: { name: NAME, version: VERSION },
      bundles: [bundle],
      warnings,
    };
  },
};

export const __TEST__ = {
  parseUsdNumber,
  trailingNumericCount,
  extractStatementEndDate,
  extractValuationSummary,
  parseHoldingsSection,
  looksLikeTicker,
};
