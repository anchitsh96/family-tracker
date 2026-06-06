// Parses the INDmoney "Holdings Report" .xls (the IND-HOLDINGS_REPORT…
// file you can pull on-demand from the app — strictly better than the
// month-end PDF for portfolio-tracking purposes: it's pure tabular data,
// every share is one row, no OCR noise).
//
// Sheet layout (single sheet "HOLDINGS_BOOK"):
//
//   Row 0 : Account Details
//   Row 1 : Broker Name           DriveWealth
//   Row 2 : Broker Account        WRCQ000095
//   Row 3 : Holdings as on        2026-06-07
//   Row 7 : Stock Symbol | Holding Since | Quantity | Avg. Price ($) | Total Value ($)
//   Row 8+: data rows (until first blank row)
//   later : Disclaimer block (ignored)
//
// Every monetary number is in USD. We emit `valueNative` = Total Value
// in dollars + `nativeCurrency: 'USD'`; `valueInr = 0` (the dashboard
// re-converts at the live rate at display time, never reads the stored
// rupee number for USD holdings). Bucket is `equity_us`.

import * as XLSX from 'xlsx';
import {
  Parser,
  ParserInput,
  ParserResult,
  ExtractedAccountBundle,
  ExtractedHolding,
  ParserWarning,
} from '@/types/parser';

const NAME = 'indmoney-holdings-xls';
const VERSION = '1';

// Header cells we expect in the data-table header row. Lowercased on
// match. All three must appear for detect to succeed.
const HEADER_TOKENS = ['stock symbol', 'quantity', 'total value ($)'];

// Top-of-sheet tokens we use both to detect and to read account meta.
const META_BROKER_LABEL = /broker\s*name/i;
const META_ACCOUNT_LABEL = /broker\s*account/i;
const META_ASOF_LABEL = /holdings\s*as\s*on/i;

type Row = (string | number | null | undefined)[];

function readWorkbook(input: ParserInput) {
  return XLSX.read(input.bytes, { type: 'array' });
}

function strip(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// Locate the data-table header row by content (we don't rely on row 7
// being the header — that's the layout today but if INDmoney shifts a
// blank row in we want to keep working).
function findHeaderRowIdx(rows: Row[]): number {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const cells = r.map((c) => strip(c).toLowerCase());
    if (HEADER_TOKENS.every((tok) => cells.includes(tok))) return i;
  }
  return -1;
}

// Column index of `name` in the header row.
function colIdx(header: Row, name: string): number {
  for (let i = 0; i < header.length; i++) {
    if (strip(header[i]).toLowerCase() === name.toLowerCase()) return i;
  }
  return -1;
}

// Pull the value next to a label in the top metadata block. e.g.
// findLabelValue(rows, /broker\s*name/i) → "DriveWealth"
function findLabelValue(rows: Row[], label: RegExp, maxRow = 10): string | null {
  for (let i = 0; i < Math.min(rows.length, maxRow); i++) {
    const r = rows[i] ?? [];
    for (let j = 0; j < r.length; j++) {
      if (label.test(strip(r[j]))) {
        // Value is the next non-empty cell on the same row.
        for (let k = j + 1; k < r.length; k++) {
          const v = strip(r[k]);
          if (v) return v;
        }
      }
    }
  }
  return null;
}

// INDmoney writes asOf as ISO ("2026-06-07") on this report. Be tolerant
// in case they switch to a friendlier display format later.
function normalizeAsOfDate(raw: string | null): string | null {
  if (!raw) return null;
  // Already ISO?
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // "07 Jun 2026"
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const m = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const mm = months[(m[2] ?? '').slice(0, 3).toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${(m[1] ?? '').padStart(2, '0')}`;
  }
  return null;
}

// Trim last-4-digits-of-account-style hint for the account nickname.
// "WRCQ000095" → "0095". Falls back to the full string if it's short.
function lastFour(s: string | null): string | undefined {
  if (!s) return undefined;
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(-4);
  return undefined;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export const IndmoneyHoldingsXlsParser: Parser = {
  name: NAME,
  version: VERSION,
  inputType: 'xlsx',

  async detect(input: ParserInput): Promise<number> {
    if (input.type !== 'xlsx') return 0;
    let wb: XLSX.WorkBook;
    try {
      wb = readWorkbook(input);
    } catch {
      return 0;
    }
    // Sheet name on this report is "HOLDINGS_BOOK" but match loosely so
    // a future rename doesn't break detection.
    const sheetName =
      wb.SheetNames.find((n) => /holdings/i.test(n)) ?? wb.SheetNames[0];
    if (!sheetName) return 0;
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return 0;
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    const broker = findLabelValue(rows, META_BROKER_LABEL);
    const headerIdx = findHeaderRowIdx(rows);
    if (headerIdx < 0) return 0;
    // Strong signal: DriveWealth broker + Total Value ($) header.
    if (broker && /drivewealth/i.test(broker)) return 0.98;
    return 0.6;
  },

  async parse(input: ParserInput): Promise<ParserResult> {
    const warnings: ParserWarning[] = [];
    let wb: XLSX.WorkBook;
    try {
      wb = readWorkbook(input);
    } catch (e: any) {
      return {
        ok: false,
        parser: { name: NAME, version: VERSION },
        code: 'XLSX_READ_FAILED',
        message: `Could not read workbook: ${e?.message ?? 'unknown error'}`,
        warnings,
      };
    }

    const sheetName =
      wb.SheetNames.find((n) => /holdings/i.test(n)) ?? wb.SheetNames[0];
    if (!sheetName || !wb.Sheets[sheetName]) {
      return {
        ok: false,
        parser: { name: NAME, version: VERSION },
        code: 'NO_SHEET',
        message: 'Workbook had no HOLDINGS_BOOK sheet.',
        warnings,
      };
    }
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });

    const broker = findLabelValue(rows, META_BROKER_LABEL);
    const account = findLabelValue(rows, META_ACCOUNT_LABEL);
    const asOfRaw = findLabelValue(rows, META_ASOF_LABEL);
    const asOfDate =
      normalizeAsOfDate(asOfRaw) ?? new Date().toISOString().slice(0, 10);

    const headerIdx = findHeaderRowIdx(rows);
    if (headerIdx < 0) {
      return {
        ok: false,
        parser: { name: NAME, version: VERSION },
        code: 'NO_HEADER',
        message:
          'Identified the file as an INDmoney holdings report but could not locate the holdings table header.',
        warnings,
      };
    }
    const header = rows[headerIdx] ?? [];
    const cSymbol = colIdx(header, 'Stock Symbol');
    const cSince = colIdx(header, 'Holding Since');
    const cQty = colIdx(header, 'Quantity');
    const cAvg = colIdx(header, 'Avg. Price ($)');
    const cVal = colIdx(header, 'Total Value ($)');
    if (cSymbol < 0 || cQty < 0 || cVal < 0) {
      return {
        ok: false,
        parser: { name: NAME, version: VERSION },
        code: 'MISSING_COLUMN',
        message:
          'Holdings table is missing one of: Stock Symbol, Quantity, Total Value ($).',
        warnings,
      };
    }

    const holdings: ExtractedHolding[] = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const sym = strip(r[cSymbol]);
      // Blank symbol = end of table (the disclaimer block starts after a
      // gap of empty rows). Break instead of skipping so we don't try to
      // parse the disclaimer paragraphs as data.
      if (!sym) {
        // Allow one blank row mid-table — but two in a row = end.
        const next = strip((rows[i + 1] ?? [])[cSymbol]);
        if (!next) break;
        continue;
      }
      // Defensive: if the disclaimer paragraph happens to have a value in
      // col 0, it'll be a long sentence — skip anything that's clearly
      // not a ticker (letters + digits, ≤6 chars).
      if (!/^[A-Z0-9.\-]{1,6}$/.test(sym)) break;

      const qty = num(r[cQty]);
      const avg = cAvg >= 0 ? num(r[cAvg]) : 0;
      const value = num(r[cVal]);

      holdings.push({
        // Symbol is our best available instrument name (INDmoney doesn't
        // include the friendly company name in this report).
        instrumentName: sym,
        quantity: qty,
        unitPrice: avg,
        valueInr: 0,
        valueNative: Math.round(value * 10000) / 10000,
        nativeCurrency: 'USD',
        asOfDate,
        rowMeta: {
          symbol: sym,
          ...(cSince >= 0 && r[cSince] ? { holdingSince: strip(r[cSince]) } : {}),
        },
      });
    }

    if (holdings.length === 0) {
      return {
        ok: false,
        parser: { name: NAME, version: VERSION },
        code: 'NO_HOLDINGS_FOUND',
        message:
          'INDmoney holdings report had no rows under the header. Sheet may be empty or layout changed.',
        warnings,
      };
    }

    const bundle: ExtractedAccountBundle = {
      account: {
        bucket: 'equity_us',
        provider: 'indmoney_dw',
        nickname: 'INDmoney US Stocks',
        currency: 'USD',
        accountNumberLast4: lastFour(account),
      },
      holdings,
      totals: {
        // Bundle totals stay typed as INR; leave undefined for a USD
        // bundle so nothing mistakes a dollar number for rupees.
      },
    };

    if (broker && !/drivewealth/i.test(broker)) {
      warnings.push({
        level: 'warn',
        code: 'UNEXPECTED_BROKER',
        message: `Broker label was "${broker}" — expected DriveWealth.`,
      });
    }

    return {
      ok: true,
      parser: { name: NAME, version: VERSION },
      bundles: [bundle],
      warnings,
    };
  },
};

export const __TEST__ = {
  findHeaderRowIdx,
  findLabelValue,
  normalizeAsOfDate,
  lastFour,
};
