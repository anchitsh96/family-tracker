// Parses the Fisdom Custom Edge PMS Investor Report PDF.
//
// Fisdom is the PMS provider operated under the "W by Groww" parent brand
// (the spec calls it "W by Groww PMS"). Every monthly statement carries
// the header "PMS INVESTOR REPORT" + "Fisdom Custom Edge".
//
// We extract from the closing-state table `(iii) Holding Report as of …`.
//
// Two different PDF text-extraction backends produce different layouts of
// this table, and the parser handles both:
//
//   1. pdftotext -raw  (used in dev fixtures): each row is a single line —
//      <name> <qty> <avg> <rate> <total> (then market value + % on a
//      separate row). Subtotals are 3-number lines.
//
//   2. iOS PDFKit .string (production runtime): the table is read in
//      "PDF reading order" which on this template comes out column-major
//      and irregular — for some rows name + 4-num + 2-num are smushed
//      into one line, for others the L data, R data, and name fragments
//      land on separate lines. We treat L-data (4 trailing nums) and
//      R-data (2 trailing nums) as two ordered streams, pair them by
//      index, and pull names from whichever line they appear on.
//
// Deliberately NOT extracted: PAN, address, phone, email, transaction
// log, performance metrics. The whole PMS bundles into a single
// equity_pms holding bundle (v1 keeps it simple — one number for "my PMS").

import {
  Parser,
  ParserInput,
  ParserResult,
  ExtractedAccountBundle,
  ExtractedHolding,
  ParserWarning,
} from '@/types/parser';

const NAME = 'fisdom-pms-pdf';
const VERSION = '2';

const DETECT_ANCHORS = ['PMS INVESTOR REPORT', 'Fisdom Custom Edge'];

const NUM_TOKEN = /-?(?:\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)/;

const PAGE_HEADER_PATTERNS = [
  /^PMS INVESTOR REPORT/i,
  /^Account\s*:/i,
  /^Fisdom Custom Edge/i,
  /^From\s+\d{2}\/\d{2}\/\d{4}/i,
  /^\(iii\)\s*Holding Report as of/i,
  /^Security Name\b/i,
  /^Market Value\s*%\s*to Portfolio/i,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseIndianNumber(s: string): number {
  const cleaned = s.replace(/,/g, '').trim();
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

function ddMmYyyyToIso(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function bytesToText(input: ParserInput): string {
  if (input.textPreview && input.textPreview.length > 0) return input.textPreview;
  return new TextDecoder('utf-8', { fatal: false }).decode(input.bytes);
}

function isPageHeader(line: string): boolean {
  for (const re of PAGE_HEADER_PATTERNS) if (re.test(line)) return true;
  return false;
}

function stripTrailingPageHeader(line: string): string {
  return line.replace(/PMS\s*INVESTOR\s*REPORT.*$/i, '').trimEnd();
}

// PDFKit sometimes concatenates two adjacent currency tokens with no
// separator: "497,328.22184,739.72". Indian-formatted decimals end with
// exactly 2 digits after the period; anything more is a smush.
//
// Repeatedly split off "<n>,<nnn>.<dd>" from the front of the string.
function splitSmushedNumberToken(token: string): string[] {
  const out: string[] = [];
  let rest = token;
  while (rest.length > 0) {
    // Try Indian-formatted with exactly 2 decimals followed by digits.
    let m = rest.match(/^(-?\d{1,3}(?:,\d{2,3})+\.\d{2})(\d.*)$/);
    if (m) {
      out.push(m[1]!);
      rest = m[2]!;
      continue;
    }
    // Try plain integer + decimal (no thousands separators) followed by digits.
    m = rest.match(/^(-?\d+\.\d{2})(\d.*)$/);
    if (m) {
      out.push(m[1]!);
      rest = m[2]!;
      continue;
    }
    out.push(rest);
    break;
  }
  return out;
}

function tokenize(line: string): string[] {
  // Whitespace-split, then split smushed numeric tokens.
  const raw = line.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const t of raw) {
    if (NUM_TOKEN.test(t)) {
      out.push(...splitSmushedNumberToken(t));
    } else {
      out.push(t);
    }
  }
  return out;
}

function isNumericToken(t: string): boolean {
  const m = t.match(NUM_TOKEN);
  return m !== null && m[0] === t;
}

// Count trailing numeric tokens (right side of a line). Returns the
// number of consecutive numeric tokens at the end.
function trailingNumericCount(tokens: string[]): number {
  let n = 0;
  for (let j = tokens.length - 1; j >= 0; j--) {
    if (isNumericToken(tokens[j]!)) n += 1;
    else break;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Section finders
// ---------------------------------------------------------------------------

function extractClosingDate(text: string): string | null {
  const m = text.match(/\(iii\)\s*Holding Report as of\s+(\d{2}\/\d{2}\/\d{4})/);
  if (m && m[1]) return ddMmYyyyToIso(m[1]);
  const m2 = text.match(/to\s+(\d{2}\/\d{2}\/\d{4})/);
  if (m2 && m2[1]) return ddMmYyyyToIso(m2[1]);
  return null;
}

interface AllocationSummary {
  shares: { purchase: number; market: number; pct: number } | null;
  mutualFunds: { purchase: number; market: number; pct: number } | null;
  cash: { purchase: number; market: number; pct: number } | null;
  total: { purchase: number; market: number; pct: number } | null;
}

// The page-1 "Portfolio Allocation" summary gives us the headline numbers,
// which we cross-check against our row-by-row sum.
function extractAllocationSummary(lines: string[]): AllocationSummary {
  const out: AllocationSummary = {
    shares: null,
    mutualFunds: null,
    cash: null,
    total: null,
  };
  for (const line of lines) {
    const trimmed = line.trim();
    const sm = trimmed.match(/^Shares\s+([\d,.]+)\s+([\d,.]+)\s+([\d.]+)%/);
    if (sm) {
      out.shares = {
        purchase: parseIndianNumber(sm[1]!),
        market: parseIndianNumber(sm[2]!),
        pct: parseIndianNumber(sm[3]!),
      };
      continue;
    }
    const mfm = trimmed.match(
      /^Mutual\s+Funds\s+([\d,.]+)\s+([\d,.]+)\s+([\d.]+)%/i
    );
    if (mfm) {
      out.mutualFunds = {
        purchase: parseIndianNumber(mfm[1]!),
        market: parseIndianNumber(mfm[2]!),
        pct: parseIndianNumber(mfm[3]!),
      };
      continue;
    }
    const cm = trimmed.match(
      /^Cash\s*\/\s*Bank\s+([\d,.]+)\s+([\d,.]+)\s+([\d.]+)%/i
    );
    if (cm) {
      out.cash = {
        purchase: parseIndianNumber(cm[1]!),
        market: parseIndianNumber(cm[2]!),
        pct: parseIndianNumber(cm[3]!),
      };
      continue;
    }
    // Cover-page Total bleeds into next-page header on raw-mode extraction:
    //   "5,132,493.05 5,175,058.94 98.92% TotalPMS INVESTOR REPORT"
    // PDFKit-mode it appears within the holding section as
    //   "Total 5,132,493.05 5,175,058.94 98.92"
    const tm =
      trimmed.match(/^([\d,.]+)\s+([\d,.]+)\s+([\d.]+)%\s*Total/) ||
      trimmed.match(/^Total\s+([\d,.]+)\s+([\d,.]+)\s+([\d.]+)/);
    if (tm) {
      out.total = {
        purchase: parseIndianNumber(tm[1]!),
        market: parseIndianNumber(tm[2]!),
        pct: parseIndianNumber(tm[3]!),
      };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Holding row parsing
// ---------------------------------------------------------------------------

type AssetClass = 'shares' | 'mutual_funds' | 'cash';

interface ParsedHolding {
  name: string;
  quantity: number;
  averageCost: number;
  marketRate: number;
  totalCost: number;
  marketValue: number;
  pctPortfolio: number;
  assetClass: AssetClass;
}

interface LRow {
  // Optional name (before numerics on the same line); could be empty
  namePrefix: string;
  qty: number;
  avg: number;
  rate: number;
  total: number;
}

interface RRow {
  // Optional name fragment that appeared with this R-data
  namePrefix: string;
  market: number;
  pct: number;
}

function findHoldingRows(lines: string[]): ParsedHolding[] {
  // Locate section: from "(iii) Holding Report" to "Investments in
  // securities of associates" or grand "Total <n> <n> <n>".
  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/\(iii\)\s*Holding Report as of/i.test(lines[i] ?? '')) {
      sectionStart = i;
      break;
    }
  }
  if (sectionStart < 0) return [];
  for (let j = sectionStart + 1; j < lines.length; j++) {
    const lj = (lines[j] ?? '').trim();
    if (
      /^Investments\s+in\s+the\s+securities/i.test(lj) ||
      /^Total\s+[\d,.]+\s+[\d,.]+\s+[\d.]+/i.test(lj)
    ) {
      sectionEnd = j;
      break;
    }
  }

  // Walk the section and bucket each line into:
  //   - L-stream entry (4 trailing nums)
  //   - R-stream entry (2 trailing nums)
  //   - subtotal (3 trailing nums, no name)
  //   - name-only (no numbers, has alpha)
  //   - skip (page header / column header / etc)
  //
  // Names are also classified as "loose" — they accumulate into a
  // pendingName buffer and attach to the next L-stream entry that has
  // no name of its own.

  const lStream: LRow[] = [];
  const rStream: RRow[] = [];
  // For each L-stream entry, where did it come in the section? (We use
  // this to associate subtotals with asset class boundaries.)
  const lIndexOfNthSubtotal: number[] = [];
  let pendingName = '';

  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    const raw = (lines[i] ?? '').trim();
    if (!raw) continue;
    const cleaned = stripTrailingPageHeader(raw);
    if (!cleaned) continue;
    if (isPageHeader(cleaned)) continue;

    const tokens = tokenize(cleaned);
    if (tokens.length === 0) continue;
    const trailing = trailingNumericCount(tokens);
    const namePart = tokens.slice(0, tokens.length - trailing).join(' ').trim();
    const trailingValues = tokens
      .slice(tokens.length - trailing)
      .map((t) => parseIndianNumber(t));

    if (trailing === 0) {
      // Pure name fragment line. Add to pending name buffer.
      if (/[A-Za-z]/.test(cleaned)) {
        pendingName = pendingName ? `${pendingName} ${cleaned}` : cleaned;
      }
      continue;
    }

    if (trailing === 3 && namePart.length === 0) {
      // Subtotal: <total cost> <market value> <% portfolio>
      lIndexOfNthSubtotal.push(lStream.length);
      pendingName = '';
      continue;
    }

    if (trailing === 6) {
      // Combined name + L + R on one line (rare; e.g. HDFC Flexi Cap
      // smush after splitSmushedNumberToken normalizes the data).
      const [qty, avg, rate, total, market, pct] = trailingValues as [
        number, number, number, number, number, number,
      ];
      const fullName = [pendingName, namePart].filter(Boolean).join(' ').trim();
      lStream.push({ namePrefix: fullName, qty, avg, rate, total });
      rStream.push({ namePrefix: '', market, pct });
      pendingName = '';
      continue;
    }

    if (trailing === 4) {
      const [qty, avg, rate, total] = trailingValues as [
        number, number, number, number,
      ];
      const fullName = [pendingName, namePart].filter(Boolean).join(' ').trim();
      lStream.push({ namePrefix: fullName, qty, avg, rate, total });
      pendingName = '';
      continue;
    }

    if (trailing === 2) {
      const [market, pct] = trailingValues as [number, number];
      // namePart could be a NEW name (Axis Arbitrage), a continuation
      // ("GROWTH", "Direct-G"), or "Cash". We just record it; the
      // assembly step decides where to attach it.
      rStream.push({ namePrefix: namePart, market, pct });
      pendingName = '';
      continue;
    }

    // 1 or 5 numbers — unusual. Treat as a name fragment if it has
    // alphabetic content.
    if (/[A-Za-z]/.test(cleaned)) {
      pendingName = pendingName ? `${pendingName} ${cleaned}` : cleaned;
    }
  }

  // Special-case: the Cash row in PDFKit output emits R first
  // ("Cash 1,245.03 0.02") then L ("1,245.03 1.00 0.00 1,245.03"). The L
  // gets pushed into lStream with empty namePrefix. The R gets pushed
  // into rStream with namePrefix "Cash". Pair them by index — they end
  // up at the same position in both streams.

  // Pair L[i] with R[i]. For names: prefer L's namePrefix; if empty,
  // fall back to R's namePrefix. If R has a long name like
  // "Axis Arbitrage Direct-G" and L has none, use R's name.
  //
  // Names that look like just a continuation fragment ("GROWTH",
  // "Direct-G") should ATTACH to the L-name from the same index, not
  // replace it.

  const out: ParsedHolding[] = [];
  const pairs = Math.min(lStream.length, rStream.length);
  // Determine asset class by L-stream index relative to subtotal positions.
  const subtotalsAfter = lIndexOfNthSubtotal; // L-index where each subtotal "fired"
  const classOfL = (lIdx: number): AssetClass => {
    // count subtotals that appeared at or before lIdx
    let count = 0;
    for (const s of subtotalsAfter) {
      if (s <= lIdx) count += 1;
    }
    if (count === 0) return 'shares';
    if (count === 1) return 'mutual_funds';
    return 'cash';
  };

  for (let i = 0; i < pairs; i++) {
    const l = lStream[i]!;
    const r = rStream[i]!;
    let name = l.namePrefix.trim();
    const rPrefix = r.namePrefix.trim();
    if (rPrefix && rPrefix.toLowerCase() === 'cash') {
      // Cash row: name is just "Cash"
      name = 'Cash';
    } else if (rPrefix) {
      // R has a name-prefix.
      // - If L has no name, R's prefix IS the row's name.
      // - If both have names, R's prefix is a continuation ("GROWTH",
      //   "Direct-G"). Glue it on the end of L's name.
      if (!name) name = rPrefix;
      else name = `${name} ${rPrefix}`;
    }
    // Some rows accumulate a multi-name L prefix (e.g. "HDFC Mid Cap …
    // ICICI Pru … Kotak Equity …") because PDFKit lumped 3 names into
    // one line. Only the LAST name applies to this row's data; the
    // earlier names belong to the NEXT rows that lack names.
    const split = splitMultiNamesToHoldings(name);
    if (split.extraNames.length > 0) {
      // Push the extra names back into the L-stream's namePrefix slots
      // for subsequent rows that have empty namePrefix.
      let cursor = 0;
      for (let j = i + 1; j < pairs && cursor < split.extraNames.length; j++) {
        if (!lStream[j]!.namePrefix) {
          lStream[j]!.namePrefix = split.extraNames[cursor]!;
          cursor += 1;
        }
      }
    }
    name = split.head;

    const ac = classOfL(i);
    out.push({
      name: name || 'Unknown',
      quantity: l.qty,
      averageCost: l.avg,
      marketRate: l.rate,
      totalCost: l.total,
      marketValue: r.market,
      pctPortfolio: r.pct,
      assetClass: ac,
    });
  }

  return out;
}

// "HDFC Mid Cap Direct-G ICICI Pru Technology Direct-G Kotak Equity Savings Direct-G"
// → head = "HDFC Mid Cap Direct-G", extras = ["ICICI Pru Technology Direct-G", "Kotak Equity Savings Direct-G"]
//
// We split on " Direct-G " boundaries (Fisdom uses this suffix on every
// MF — direct plan, growth option). The split keeps each "Direct-G"
// glued to the preceding fund name.
function splitMultiNamesToHoldings(name: string): {
  head: string;
  extraNames: string[];
} {
  const trimmed = name.trim();
  if (!trimmed) return { head: '', extraNames: [] };
  const parts = trimmed.split(/(?<=Direct-G)\s+/);
  if (parts.length <= 1) return { head: trimmed, extraNames: [] };
  return { head: parts[0]!, extraNames: parts.slice(1).filter(Boolean) };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export const FisdomPmsPdfParser: Parser = {
  name: NAME,
  version: VERSION,
  inputType: 'pdf',

  async detect(input: ParserInput): Promise<number> {
    if (input.type !== 'pdf') return 0;
    const text = bytesToText(input);
    if (!text || text.length < 100) return 0;
    let hits = 0;
    for (const a of DETECT_ANCHORS) if (text.includes(a)) hits += 1;
    if (hits === 0) return 0;
    if (hits >= 2 && /\(iii\)\s*Holding Report as of/.test(text)) return 0.97;
    return 0.55 + hits * 0.1;
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
    const closingDateIso =
      extractClosingDate(text) ?? new Date().toISOString().slice(0, 10);
    const allocation = extractAllocationSummary(lines);
    const rows = findHoldingRows(lines);

    if (rows.length === 0) {
      return {
        ok: false,
        parser: { name: NAME, version: VERSION },
        code: 'NO_HOLDINGS_FOUND',
        message:
          'PDF was identified as Fisdom PMS but no holdings could be extracted. Layout may have changed.',
        warnings,
      };
    }

    const holdings: ExtractedHolding[] = rows.map((r) => ({
      instrumentName: r.name,
      quantity: r.quantity,
      unitPrice: r.marketRate,
      valueInr: Math.round(r.marketValue * 100) / 100,
      asOfDate: closingDateIso,
      rowMeta: {
        assetClass: r.assetClass,
        averageCost: r.averageCost,
        totalCost: r.totalCost,
        pctPortfolio: r.pctPortfolio,
      },
    }));

    const sumMarket = holdings.reduce((s, h) => s + h.valueInr, 0);
    if (allocation.total) {
      const stated = allocation.total.market;
      if (stated > 0 && Math.abs(sumMarket - stated) / stated > 0.02) {
        warnings.push({
          level: 'warn',
          code: 'TOTAL_MARKET_MISMATCH',
          message: `Sum of holdings ${sumMarket.toFixed(
            2
          )} differs from stated total ${stated.toFixed(2)} by more than 2%`,
        });
      }
    }

    const bundle: ExtractedAccountBundle = {
      account: {
        bucket: 'equity_pms',
        provider: 'fisdom',
        nickname: 'Fisdom PMS (W by Groww)',
        currency: 'INR',
      },
      holdings,
      totals: {
        presentValueInr: allocation.total?.market ?? sumMarket,
        investedValueInr: allocation.total?.purchase,
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
  parseIndianNumber,
  splitSmushedNumberToken,
  tokenize,
  trailingNumericCount,
  extractClosingDate,
  extractAllocationSummary,
  findHoldingRows,
  splitMultiNamesToHoldings,
};
