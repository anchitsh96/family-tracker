// Parses the "Holdings ME####.xlsx" export from Zerodha Console.
// Sheets: Equity, Mutual Funds, Combined.
// Header row is at index 22 (R23 in 1-indexed Excel). Below it is the holdings table.
// We ignore the Combined sheet because its rows duplicate Equity + Mutual Funds.

import * as XLSX from 'xlsx';
import {
  Parser,
  ParserInput,
  ParserResult,
  ExtractedAccountBundle,
  ExtractedHolding,
  ParserWarning,
} from '@/types/parser';

const NAME = 'zerodha-holdings-xlsx';
const VERSION = '1';

type Row = (string | number | null | undefined)[];

function readWorkbook(input: ParserInput) {
  return XLSX.read(input.bytes, { type: 'array' });
}

function findHeaderRowIdx(rows: Row[], expectedTokens: string[]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const cells = row.map((c) => (c == null ? '' : String(c).toLowerCase().trim()));
    const matches = expectedTokens.every((tok) =>
      cells.some((c) => c === tok.toLowerCase()),
    );
    if (matches) return i;
  }
  return -1;
}

function findAsOfDate(rows: Row[]): string | null {
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell === 'string') {
        const m = cell.match(/(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1] ?? null;
      }
    }
  }
  return null;
}

function colIdx(header: Row, name: string): number {
  for (let i = 0; i < header.length; i++) {
    const c = header[i];
    if (typeof c === 'string' && c.trim().toLowerCase() === name.toLowerCase()) return i;
  }
  return -1;
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function strip(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

interface SheetParseInput {
  rows: Row[];
  bucket: 'equity_india' | 'mutual_funds';
  provider: string;
  nickname: string;
  asOfDate: string;
  warnings: ParserWarning[];
}

function parseHoldingsSheet(p: SheetParseInput): ExtractedAccountBundle | null {
  const headerIdx = findHeaderRowIdx(p.rows, ['Symbol', 'ISIN', 'Quantity Available']);
  if (headerIdx < 0) {
    p.warnings.push({
      level: 'warn',
      code: 'NO_HEADER',
      message: `${p.bucket === 'equity_india' ? 'Equity' : 'Mutual Funds'} sheet has no recognizable header row`,
    });
    return null;
  }
  const header = p.rows[headerIdx] ?? [];
  const cSymbol = colIdx(header, 'Symbol');
  const cIsin = colIdx(header, 'ISIN');
  const cQty = colIdx(header, 'Quantity Available');
  const cAvg = colIdx(header, 'Average Price');
  const cLtp = colIdx(header, 'Previous Closing Price');

  const holdings: ExtractedHolding[] = [];
  for (let r = headerIdx + 1; r < p.rows.length; r++) {
    const row = p.rows[r] ?? [];
    if (!row.length) continue;
    const symbol = strip(row[cSymbol]);
    const isin = strip(row[cIsin]);
    if (!symbol && !isin) continue;
    const qty = num(row[cQty]);
    const ltp = num(row[cLtp]);
    const avg = num(row[cAvg]);
    if (qty === 0) continue;
    const value = qty * (ltp || avg);
    holdings.push({
      instrumentName: symbol || isin,
      isin: isin || undefined,
      quantity: qty,
      unitPrice: ltp || avg || undefined,
      valueInr: Math.round(value * 100) / 100,
      asOfDate: p.asOfDate,
    });
  }

  if (holdings.length === 0) return null;

  const presentValue = holdings.reduce((s, h) => s + h.valueInr, 0);
  return {
    account: {
      bucket: p.bucket,
      provider: p.provider,
      nickname: p.nickname,
      currency: 'INR',
    },
    holdings,
    totals: { presentValueInr: presentValue },
  };
}

export const ZerodhaHoldingsXlsxParser: Parser = {
  name: NAME,
  version: VERSION,
  inputType: 'xlsx',

  async detect(input) {
    if (input.type !== 'xlsx') return 0;
    try {
      const wb = readWorkbook(input);
      const sheetSet = new Set(wb.SheetNames.map((s) => s.toLowerCase()));
      const looksLikeZerodha =
        sheetSet.has('equity') &&
        (sheetSet.has('mutual funds') || sheetSet.has('mutualfunds'));
      if (!looksLikeZerodha) return 0;
      // Look for "Client ID" anchor in the first sheet
      const firstSheet = wb.Sheets[wb.SheetNames[0]!];
      const rows = XLSX.utils.sheet_to_json(firstSheet!, { header: 1, raw: true }) as Row[];
      const hasClient = rows
        .slice(0, 15)
        .some((row) => row?.some((c) => typeof c === 'string' && /client id/i.test(c)));
      return hasClient ? 0.97 : 0.7;
    } catch {
      return 0;
    }
  },

  async parse(input) {
    const warnings: ParserWarning[] = [];
    try {
      const wb = readWorkbook(input);
      const equitySheet = wb.Sheets['Equity'];
      const mfSheet = wb.Sheets['Mutual Funds'] || wb.Sheets['Mutual funds'];

      let asOfDate = new Date().toISOString().slice(0, 10);
      const bundles: ExtractedAccountBundle[] = [];

      if (equitySheet) {
        const rows = XLSX.utils.sheet_to_json(equitySheet, { header: 1, raw: true }) as Row[];
        asOfDate = findAsOfDate(rows) ?? asOfDate;
        const bundle = parseHoldingsSheet({
          rows,
          bucket: 'equity_india',
          provider: 'zerodha',
          nickname: 'Zerodha Equity',
          asOfDate,
          warnings,
        });
        if (bundle) bundles.push(bundle);
      }

      if (mfSheet) {
        const rows = XLSX.utils.sheet_to_json(mfSheet, { header: 1, raw: true }) as Row[];
        const mfDate = findAsOfDate(rows);
        const bundle = parseHoldingsSheet({
          rows,
          bucket: 'mutual_funds',
          provider: 'zerodha',
          nickname: 'Zerodha Coin (MF)',
          asOfDate: mfDate ?? asOfDate,
          warnings,
        });
        if (bundle) bundles.push(bundle);
      }

      if (bundles.length === 0) {
        return {
          ok: false,
          parser: { name: NAME, version: VERSION },
          code: 'EMPTY_HOLDINGS',
          message: 'No holdings found in Equity or Mutual Funds sheets',
          warnings,
        };
      }

      return {
        ok: true,
        parser: { name: NAME, version: VERSION },
        bundles,
        warnings,
      };
    } catch (err) {
      return {
        ok: false,
        parser: { name: NAME, version: VERSION },
        code: 'PARSE_ERROR',
        message: (err as Error).message,
        warnings,
      };
    }
  },
};
