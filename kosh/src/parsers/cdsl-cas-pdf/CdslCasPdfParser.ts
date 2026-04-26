// Parses CDSL Consolidated Account Statement (CAS) PDFs.
//
// CAS is the standardized PDF that CDSL emails to anyone holding Indian demat
// or mutual fund investments at the end of each statement period (monthly /
// half-yearly / annual). One PDF covers all the holder's:
//   • Equity holdings across all CDSL demat accounts
//   • Bond holdings across all CDSL demat accounts
//   • Mutual fund folios across all AMCs
//
// We extract from the raw-mode text dump (one logical token per line, with
// the PDF's content-stream order preserved). The native iOS PDFKit text
// extractor produces a similar shape; pdftotext -raw matches it for testing.
//
// Layout mode is NOT used — bilingual Hindi+English overlap in this PDF
// destroys column alignment.
//
// What we extract:
//   1. Closing date (`AS ON DD-MM-YYYY` anchor)
//   2. Per-demat equity holdings (one bundle per demat with equity)
//   3. Per-demat bond holdings (one bundle per demat with bonds)
//   4. Consolidated MF table (single bundle, all AMCs)
//
// What we deliberately do NOT extract:
//   • PAN, DOB, mobile, email, address. Schema doesn't have those fields.
//   • Transaction history. v1 stores closing positions only.
//   • TER, unrealised P&L, return %. Out of v1 scope.

import {
  Parser,
  ParserInput,
  ParserResult,
  ExtractedAccountBundle,
  ExtractedHolding,
  ParserWarning,
} from '@/types/parser';

const NAME = 'cdsl-cas-pdf';
const VERSION = '1';

const ISIN_RE = /\bIN[A-Z0-9]{10}\b/;
const EQUITY_ISIN_RE = /^INE[A-Z0-9]{9}$/;
const MF_ISIN_RE = /^INF[A-Z0-9]{9}$/;
// Indian-formatted decimal: matches both 1,00,000.00 and plain 10849899
const NUM_RE = /-?(?:\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)/;
const NUM_RE_GLOBAL = new RegExp(NUM_RE.source, 'g');

const DETECT_ANCHORS = [
  'CONSOLIDATED ACCOUNT STATEMENT',
  'Depository Services',
  'CDSL',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseIndianNumber(s: string): number {
  const cleaned = s.replace(/,/g, '').replace(/[`₹]/g, '').trim();
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

function findAllNumbersOnLine(line: string): number[] {
  const matches = line.match(NUM_RE_GLOBAL);
  if (!matches) return [];
  return matches.map(parseIndianNumber);
}

function ddMmYyyyToIso(s: string): string | null {
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function bytesToText(input: ParserInput): string {
  if (input.textPreview && input.textPreview.length > 0) return input.textPreview;
  return new TextDecoder('utf-8', { fatal: false }).decode(input.bytes);
}

// `LARSEN&TOUBROLIMITED-` → `LARSEN & TOUBRO LIMITED -`
// PDFKit-style raw output strips spaces between adjacent glyph runs;
// reinsert them at lowercase→uppercase or letter→symbol boundaries.
function unsmushName(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/-+/g, ' - ')
    .replace(/&/g, ' & ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDataNumericLine(line: string): boolean {
  // A row of numbers separated by spaces, possibly with `--` placeholders.
  // E.g. "7.000 -- -- -- 7.000 3504.300 24,530.10"
  const t = line.trim();
  if (t.length === 0) return false;
  if (ISIN_RE.test(t)) return false;
  // Reject pure scheme name continuations (mostly letters)
  const numTokens = t.match(NUM_RE_GLOBAL);
  if (!numTokens || numTokens.length < 3) return false;
  // Every space-separated token must be either a number or a "--" placeholder
  const tokens = t.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    if (tok === '--' || tok === '–' || tok === '-') continue;
    if (NUM_RE.test(tok) && tok.match(NUM_RE)?.[0] === tok) continue;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Section finders
// ---------------------------------------------------------------------------

function extractClosingDate(text: string): string | null {
  const m = text.match(/AS ON (\d{2}-\d{2}-\d{4})/i);
  if (m && m[1]) return ddMmYyyyToIso(m[1]);
  const m2 = text.match(/as on (\d{2}-\d{2}-\d{4})/);
  if (m2 && m2[1]) return ddMmYyyyToIso(m2[1]);
  return null;
}

function extractGrandTotal(text: string): number | null {
  // The MF section ends with "GrandTotal 35,00,000.00 31,42,398.51".
  // The cover page also has "Grand Total 66,67,242.61" for the across-everything total.
  const lines = text.split('\n');
  let best: number | null = null;
  for (const line of lines) {
    if (!/Grand\s*Total/i.test(line)) continue;
    const nums = findAllNumbersOnLine(line);
    for (const n of nums) {
      if (best === null || n > best) best = n;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Equity extraction (per demat)
// ---------------------------------------------------------------------------
//
// Raw-mode equity block looks like (real fixture):
//
//   INE018A01030
//   LARSEN&TOUBROLIMITED-
//   EQUITYSHARESOFRS.2/-EACH
//   7.000 -- -- -- 7.000 3504.300 24,530.10
//   INE694A01020
//   UNITECHLIMITED-NEW
//   EQUITYSHARESOFRE.2/-
//   AFTERSPLIT
//   100.000 -- -- -- 100.000 3.140 314.00
//   Portfolio Value ` 24,844.10 as on 31-03-2026
//
// Strategy: find the "Portfolio Value ` <amount> as on <date>" terminator,
// walk backward to find each ISIN-only line and its trailing numeric data
// line (the line of mostly numbers that ends each row).

interface EquityRow {
  isin: string;
  name: string;
  quantity: number;
  unitPrice: number;
  valueInr: number;
}

interface EquityBlock {
  rows: EquityRow[];
  portfolioValue: number;
  // We approximate the demat name by walking backward from the block to the
  // most recent occurrence of "DP Name : ...". When that fails, we use a
  // generic label.
  dematLabel: string;
}

function extractEquityBlocks(lines: string[]): EquityBlock[] {
  const blocks: EquityBlock[] = [];

  // Find "Portfolio Value ` <n> as on <date>" lines that are NOT bond ones.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = line.match(
      /^Portfolio Value\s+[`₹]\s*([\d,]+(?:\.\d+)?)\s+as on/i
    );
    if (!m) continue;
    if (/for\s+Bond/i.test(line)) continue;
    const portfolioValue = parseIndianNumber(m[1] ?? '0');

    // Walk backward until we find a section header anchor (HOLDING STATEMENT
    // AS ON, or the previous Portfolio Value line, or top of file).
    let blockStart = 0;
    for (let j = i - 1; j >= Math.max(0, i - 100); j--) {
      const lj = lines[j] ?? '';
      if (/HOLDING STATEMENT AS ON/i.test(lj)) {
        blockStart = j;
        break;
      }
      if (/^Portfolio Value\b/.test(lj.trim())) {
        blockStart = j + 1;
        break;
      }
    }

    // Find the most recent "DP Name : ..." preceding this block for label.
    let dematLabel = 'CDSL Demat';
    for (let j = i - 1; j >= 0; j--) {
      const lj = lines[j] ?? '';
      const dp = lj.match(/DP\s*Name\s*[: ]\s*(.+?)(?:\s+(?:DP\s*ID|BO\s*ID).*)?$/i);
      if (dp && dp[1]) {
        dematLabel = unsmushName(dp[1].trim()).replace(/\s+/g, ' ');
        break;
      }
    }

    const rows = parseEquityRows(lines, blockStart, i - 1);
    if (rows.length > 0) {
      blocks.push({ rows, portfolioValue, dematLabel });
    }
  }
  return blocks;
}

function parseEquityRows(
  lines: string[],
  from: number,
  to: number
): EquityRow[] {
  const out: EquityRow[] = [];
  let pendingIsin: string | null = null;
  let pendingNameParts: string[] = [];
  for (let i = from; i <= to; i++) {
    const raw = (lines[i] ?? '').trim();
    if (!raw) continue;
    // Equity ISIN match (line is just the ISIN, optionally with trailing junk)
    const isinMatch = raw.match(EQUITY_ISIN_RE) || raw.match(/^(INE[A-Z0-9]{9})/);
    if (isinMatch && isinMatch[0].startsWith('INE') && isinMatch[0].length === 12) {
      // If we already had a pending ISIN with no data row, drop it.
      pendingIsin = isinMatch[0];
      pendingNameParts = [];
      continue;
    }
    if (!pendingIsin) continue;
    if (isDataNumericLine(raw)) {
      const nums = findAllNumbersOnLine(raw);
      // Trailing 3 are: free balance (== quantity), market price, value
      const valueInr = nums[nums.length - 1] ?? 0;
      const unitPrice = nums[nums.length - 2] ?? 0;
      const quantity = nums[nums.length - 3] ?? 0;
      if (valueInr > 0 && quantity > 0) {
        const name = unsmushName(pendingNameParts.join(' '));
        out.push({
          isin: pendingIsin,
          name: name || pendingIsin,
          quantity,
          unitPrice,
          valueInr,
        });
      }
      pendingIsin = null;
      pendingNameParts = [];
      continue;
    }
    // Otherwise, treat as a name continuation fragment
    pendingNameParts.push(raw);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bond extraction
// ---------------------------------------------------------------------------
//
// Raw-mode bond block:
//
//   HOLDING STATEMENT OF BONDS AS ON 31-03-2026
//   ...header lines...
//   INE918K07QM2 NWFLNIFTY50310335 0.00 31032035 35.00 1,00,000.00 1,00,000.00 35,00,000.00
//   Portfolio Value for Bond ` 35,00,000.00 as on 31-03-2026
//
// Each bond row is on a single line: ISIN + name + 6 numeric columns.

interface BondRow {
  isin: string;
  name: string;
  quantity: number;
  faceValue: number;
  marketValue: number;
  valueInr: number;
  maturityDate: string | undefined;
  couponRate: number | undefined;
}

function extractBondBlocks(
  lines: string[]
): { rows: BondRow[]; dematLabel: string }[] {
  const blocks: { rows: BondRow[]; dematLabel: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/HOLDING STATEMENT OF BONDS/i.test(lines[i] ?? '')) continue;
    let endLine = i + 1;
    for (let j = i + 1; j < Math.min(i + 100, lines.length); j++) {
      if (/^Portfolio Value for Bond/i.test((lines[j] ?? '').trim())) {
        endLine = j;
        break;
      }
    }
    const rows = parseBondRows(lines, i + 1, endLine);
    let dematLabel = 'CDSL Demat';
    for (let j = i - 1; j >= 0; j--) {
      const lj = lines[j] ?? '';
      const dp = lj.match(/DP\s*Name\s*[: ]\s*(.+?)(?:\s+(?:DP\s*ID|BO\s*ID).*)?$/i);
      if (dp && dp[1]) {
        dematLabel = unsmushName(dp[1].trim());
        break;
      }
    }
    if (rows.length > 0) blocks.push({ rows, dematLabel });
    i = endLine;
  }
  return blocks;
}

function parseBondRows(lines: string[], from: number, to: number): BondRow[] {
  const out: BondRow[] = [];
  for (let i = from; i <= to; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line) continue;
    const isinMatch = line.match(/^(INE[A-Z0-9]{9})\b/);
    if (!isinMatch) continue;
    const isin = isinMatch[1] ?? '';
    const rest = line.substring(isin.length).trim();
    const nums = findAllNumbersOnLine(rest);
    if (nums.length < 4) continue;
    const valueInr = nums[nums.length - 1] ?? 0;
    const marketValue = nums[nums.length - 2] ?? 0;
    const faceValue = nums[nums.length - 3] ?? 0;
    const quantity = nums[nums.length - 4] ?? 0;
    if (valueInr <= 0) continue;
    let maturityDate: string | undefined;
    let couponRate: number | undefined;
    if (nums.length >= 6) {
      const matRaw = String(nums[nums.length - 5]);
      // Maturity is encoded as DDMMYYYY without separators (e.g. 31032035).
      if (/^\d{8}$/.test(matRaw)) {
        const dd = matRaw.slice(0, 2);
        const mm = matRaw.slice(2, 4);
        const yyyy = matRaw.slice(4);
        maturityDate = `${yyyy}-${mm}-${dd}`;
      }
      couponRate = nums[nums.length - 6];
    }
    // Bond name = text between ISIN and the first numeric column
    const numStart = rest.search(/\s-?\d/);
    const namePart = numStart > 0 ? rest.substring(0, numStart) : rest;
    out.push({
      isin,
      name: unsmushName(namePart) || isin,
      quantity,
      faceValue,
      marketValue,
      valueInr,
      maturityDate,
      couponRate,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mutual fund consolidated table
// ---------------------------------------------------------------------------
//
// Raw-mode MF block (sample):
//
//   MFGP-CanaraRobeco
//   MultiCapFund-
//   RegularGrowthPlan
//   INF760K01KR2
//   177726340-
//   63/0 ARN-111569 13521.974 13.11 2,00,000.00 1,77,273.08 1.83 0 150 -22,726.92 -11.36
//   66-DSPLarge&Mid
//   CapFund-Regular-
//   Growth
//   INF740K01094 10849899/11 ARN-111569 637.427 558.413 4,00,000.00 3,55,947.52 1.67 0 203.94 -44,052.48 -11.01
//   ...
//   GrandTotal 35,00,000.00 31,42,398.51
//
// Strategy: every MF data row contains "ARN-<digits>" — that's our anchor.
// On the data line, after ARN-XXXXXX we expect 9 numeric columns: units,
// NAV, invested, valuation, TER_R, TER_D, commission, P/L abs, P/L %.
// The ISIN may be on the same line (before the folio) OR on a previous line.

interface MfRow {
  isin: string;
  schemeName: string;
  folioNo: string;
  amc: string | undefined;
  closingUnits: number;
  nav: number;
  cumulativeInvested: number;
  valueInr: number;
}

function extractMfRows(lines: string[]): MfRow[] {
  // Bound the search to the MF consolidated section to avoid pulling rows
  // from the per-folio transaction tables (which also have ARN- markers).
  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/MUTUAL FUND UNITS HELD AS ON/i.test(lines[i] ?? '')) {
      sectionStart = i;
      break;
    }
  }
  if (sectionStart < 0) return [];
  for (let j = sectionStart + 1; j < lines.length; j++) {
    if (/^Grand\s*Total\b/i.test((lines[j] ?? '').trim())) {
      sectionEnd = j;
      break;
    }
  }

  const out: MfRow[] = [];
  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line.includes('ARN-')) continue;

    // Tokenize the data line.
    const tokens = line.split(/\s+/).filter(Boolean);
    const arnIdx = tokens.findIndex((t) => /^ARN-/.test(t));
    if (arnIdx < 0) continue;
    // After ARN there should be at least 9 numeric tokens (units, NAV,
    // invested, valuation, TER_R, TER_D, commission, P/L, P/L%).
    const numericTail = tokens
      .slice(arnIdx + 1)
      .filter((t) => NUM_RE.test(t) && t.match(NUM_RE)?.[0] === t);
    if (numericTail.length < 4) continue;
    const closingUnits = parseIndianNumber(numericTail[0] ?? '0');
    const nav = parseIndianNumber(numericTail[1] ?? '0');
    const cumulativeInvested = parseIndianNumber(numericTail[2] ?? '0');
    const valueInr = parseIndianNumber(numericTail[3] ?? '0');
    if (valueInr <= 0) continue;

    // ISIN: same line (token before folio) OR previous line.
    let isin = '';
    let folioNo = '';
    // Tokens before ARN: one of [<ISIN> <folio>] or [<folio>] (multi-line).
    const preArn = tokens.slice(0, arnIdx);
    const isinTok = preArn.find((t) => MF_ISIN_RE.test(t));
    if (isinTok) {
      isin = isinTok;
      const rest = preArn.filter((t) => t !== isinTok);
      folioNo = rest.join('').replace(/­/g, '');
    } else {
      // ISIN is on a preceding line.
      for (let k = i - 1; k >= Math.max(sectionStart, i - 5); k--) {
        const lkTokens = (lines[k] ?? '').trim().split(/\s+/).filter(Boolean);
        const found = lkTokens.find((t) => MF_ISIN_RE.test(t));
        if (found) {
          isin = found;
          // The folio may be on a line between the ISIN and the data line.
          if (k < i - 1) {
            const folioFragments: string[] = [];
            for (let m = k + 1; m < i; m++) {
              const lm = (lines[m] ?? '').trim();
              if (lm) folioFragments.push(lm.replace(/­/g, ''));
            }
            folioNo = folioFragments.join('');
          }
          // Anything before ARN on the data line is the folio tail.
          if (preArn.length > 0) {
            folioNo += preArn.join('').replace(/­/g, '');
          }
          break;
        }
      }
    }
    if (!isin) continue;

    // Scheme name = non-numeric, non-ISIN, non-folio lines preceding the
    // ISIN, going up until we hit the previous row's data line, the section
    // header, or a recognizable column-header keyword.
    const nameParts: string[] = [];
    const stopRe = /MUTUAL FUND UNITS|Scheme Name|Closing|NAV|Cumulative|Valuation|Average Total|Gross|Regular|Direct|Commission|Profit|Loss|Folio No|ARN Code/i;
    // Find the line where this row's "block" begins: the line after the
    // previous ARN data line.
    let blockStart = sectionStart + 1;
    for (let k = i - 1; k > sectionStart; k--) {
      const lk = (lines[k] ?? '').trim();
      if (!lk) continue;
      if (lk.includes('ARN-') && /\d/.test(lk) && k !== i) {
        blockStart = k + 1;
        break;
      }
    }
    for (let k = blockStart; k < i; k++) {
      const lk = (lines[k] ?? '').trim();
      if (!lk) continue;
      if (ISIN_RE.test(lk)) continue;
      if (stopRe.test(lk)) continue;
      if (/^[\d,./%-]+$/.test(lk)) continue;
      // Folio fragments are pure-digits-with-slash-or-soft-hyphen
      if (/^[\d/­-]+$/.test(lk)) continue;
      if (lk.length < 2) continue;
      nameParts.push(lk);
    }
    const schemeName = unsmushName(nameParts.join(' '));

    // AMC: try to recover from scheme name prefix or a known list.
    let amc: string | undefined;
    const amcKnown = [
      'Canara Robeco',
      'DSP',
      'HDFC',
      'ICICI Prudential',
      'Kotak',
      'SBI',
      'Axis',
      'Aditya Birla',
      'Nippon India',
      'UTI',
      'Tata',
      'Franklin',
      'Mirae',
      'Quant',
      'PPFAS',
    ];
    for (const a of amcKnown) {
      if (schemeName.toUpperCase().includes(a.toUpperCase())) {
        amc = a;
        break;
      }
    }

    out.push({
      isin,
      schemeName: schemeName || isin,
      folioNo: folioNo || '',
      amc,
      closingUnits,
      nav,
      cumulativeInvested,
      valueInr,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export const CdslCasPdfParser: Parser = {
  name: NAME,
  version: VERSION,
  inputType: 'pdf',

  async detect(input: ParserInput): Promise<number> {
    if (input.type !== 'pdf') return 0;
    const text = bytesToText(input);
    if (!text || text.length < 100) return 0;
    let hits = 0;
    for (const a of DETECT_ANCHORS) {
      if (text.includes(a)) hits += 1;
    }
    if (hits === 0) return 0;
    if (
      hits >= 2 &&
      (text.includes('MUTUAL FUND UNITS HELD AS ON') ||
        text.includes('HOLDING STATEMENT OF BONDS') ||
        text.includes('CONSOLIDATED ACCOUNT STATEMENT'))
    ) {
      return 0.95;
    }
    return 0.5 + hits * 0.1;
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

    const closingDateIso =
      extractClosingDate(text) ?? new Date().toISOString().slice(0, 10);
    const grandTotal = extractGrandTotal(text);
    const lines = text.split('\n');

    const bundles: ExtractedAccountBundle[] = [];

    // Equity holdings, per demat
    const equityBlocks = extractEquityBlocks(lines);
    for (const block of equityBlocks) {
      const holdings: ExtractedHolding[] = block.rows.map((r) => ({
        instrumentName: r.name,
        isin: r.isin,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        valueInr: Math.round(r.valueInr * 100) / 100,
        asOfDate: closingDateIso,
        rowMeta: { marketPrice: r.unitPrice },
      }));
      const sumValue = holdings.reduce((s, h) => s + h.valueInr, 0);
      if (
        block.portfolioValue > 0 &&
        Math.abs(sumValue - block.portfolioValue) / block.portfolioValue > 0.02
      ) {
        warnings.push({
          level: 'warn',
          code: 'EQUITY_TOTAL_MISMATCH',
          message: `Sum of equity holdings ${sumValue.toFixed(
            2
          )} differs from stated portfolio value ${block.portfolioValue.toFixed(
            2
          )} for ${block.dematLabel}`,
        });
      }
      bundles.push({
        account: {
          bucket: 'equity_india',
          provider: 'cdsl_cas',
          nickname: `${block.dematLabel} (Demat)`,
          currency: 'INR',
        },
        holdings,
        totals: { presentValueInr: block.portfolioValue || sumValue },
      });
    }

    // Bonds
    const bondBlocks = extractBondBlocks(lines);
    for (const block of bondBlocks) {
      const holdings: ExtractedHolding[] = block.rows.map((r) => ({
        instrumentName: r.name,
        isin: r.isin,
        quantity: r.quantity,
        valueInr: Math.round(r.valueInr * 100) / 100,
        asOfDate: closingDateIso,
        rowMeta: {
          faceValue: r.faceValue,
          marketValue: r.marketValue,
          maturityDate: r.maturityDate ?? '',
          couponRate: r.couponRate ?? 0,
        },
      }));
      bundles.push({
        account: {
          bucket: 'bonds',
          provider: 'cdsl_cas',
          nickname: `${block.dematLabel} Bonds`,
          currency: 'INR',
        },
        holdings,
      });
    }

    // Consolidated MF
    const mfRows = extractMfRows(lines);
    if (mfRows.length > 0) {
      const holdings: ExtractedHolding[] = mfRows.map((r) => ({
        instrumentName: r.schemeName,
        isin: r.isin,
        quantity: r.closingUnits,
        unitPrice: r.nav,
        valueInr: Math.round(r.valueInr * 100) / 100,
        asOfDate: closingDateIso,
        rowMeta: {
          folio: r.folioNo,
          amc: r.amc ?? '',
          invested: r.cumulativeInvested,
        },
      }));
      const sumValue = holdings.reduce((s, h) => s + h.valueInr, 0);
      bundles.push({
        account: {
          bucket: 'mutual_funds',
          provider: 'cdsl_cas_mf',
          nickname: 'Mutual Fund Folios (CAS)',
          currency: 'INR',
        },
        holdings,
        totals: {
          presentValueInr: sumValue,
          investedValueInr: holdings.reduce(
            (s, h) => s + Number(h.rowMeta?.invested ?? 0),
            0
          ),
        },
      });
    }

    if (bundles.length === 0) {
      return {
        ok: false,
        parser: { name: NAME, version: VERSION },
        code: 'NO_HOLDINGS_FOUND',
        message:
          'PDF was identified as CDSL CAS but no equity, bond, or MF holdings could be extracted. The layout may have changed.',
        warnings,
      };
    }

    if (grandTotal !== null) {
      const computed = bundles.reduce(
        (s, b) => s + b.holdings.reduce((s2, h) => s2 + h.valueInr, 0),
        0
      );
      if (Math.abs(computed - grandTotal) / grandTotal > 0.02) {
        warnings.push({
          level: 'warn',
          code: 'GRAND_TOTAL_MISMATCH',
          message: `Sum of extracted holdings ${computed.toFixed(
            2
          )} differs from stated grand total ${grandTotal.toFixed(2)} by more than 2%`,
        });
      }
    }

    return {
      ok: true,
      parser: { name: NAME, version: VERSION },
      bundles,
      warnings,
    };
  },
};

// Test-only export
export const __TEST__ = {
  parseIndianNumber,
  unsmushName,
  isDataNumericLine,
  extractClosingDate,
  extractGrandTotal,
  extractEquityBlocks,
  extractBondBlocks,
  extractMfRows,
};
