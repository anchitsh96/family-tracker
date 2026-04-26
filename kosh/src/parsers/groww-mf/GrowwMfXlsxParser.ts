// Parses the "User Profile Mutual Funds <date>.xlsx" export from Groww.
// One sheet ("Holdings"). Header row contains:
//   Scheme Name | AMC | Category | Sub-category | Folio No. | Source | Units |
//   Invested Value | Current Value | Returns | XIRR

import * as XLSX from 'xlsx';
import {
  Parser,
  ParserInput,
  ParserResult,
  ExtractedAccountBundle,
  ExtractedHolding,
  ParserWarning,
} from '@/types/parser';

const NAME = 'groww-mf-xlsx';
const VERSION = '1';

type Row = (string | number | null | undefined)[];

function readWorkbook(input: ParserInput) {
  return XLSX.read(input.bytes, { type: 'array' });
}

function findHeaderRowIdx(rows: Row[]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const cells = row.map((c) => String(c ?? '').trim().toLowerCase());
    if (
      cells.includes('scheme name') &&
      cells.includes('current value') &&
      cells.includes('units')
    )
      return i;
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

export const GrowwMfXlsxParser: Parser = {
  name: NAME,
  version: VERSION,
  inputType: 'xlsx',

  async detect(input) {
    if (input.type !== 'xlsx') return 0;
    try {
      const wb = readWorkbook(input);
      const sheetNames = wb.SheetNames.map((s) => s.toLowerCase());
      // Groww file is single sheet 'Holdings' with Personal Details + HOLDING SUMMARY blocks
      if (!sheetNames.includes('holdings') || sheetNames.length !== 1) return 0;
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]!]!, {
        header: 1,
        raw: true,
      }) as Row[];
      const flat = rows.flat().map((c) => String(c ?? '').toLowerCase());
      const isGroww =
        flat.some((c) => /personal details/.test(c)) &&
        flat.some((c) => /holding summary/.test(c)) &&
        flat.some((c) => /scheme name/.test(c));
      return isGroww ? 0.97 : 0;
    } catch {
      return 0;
    }
  },

  async parse(input) {
    const warnings: ParserWarning[] = [];
    try {
      const wb = readWorkbook(input);
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      if (!sheet) {
        return {
          ok: false,
          parser: { name: NAME, version: VERSION },
          code: 'NO_SHEET',
          message: 'No sheets in workbook',
          warnings,
        };
      }
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as Row[];
      const headerIdx = findHeaderRowIdx(rows);
      if (headerIdx < 0) {
        return {
          ok: false,
          parser: { name: NAME, version: VERSION },
          code: 'NO_HEADER',
          message: 'Header row not found',
          warnings,
        };
      }
      const header = rows[headerIdx]!;
      const cName = colIdx(header, 'Scheme Name');
      const cAmc = colIdx(header, 'AMC');
      const cUnits = colIdx(header, 'Units');
      const cCurrent = colIdx(header, 'Current Value');
      const cInvested = colIdx(header, 'Invested Value');
      const cFolio = colIdx(header, 'Folio No.');
      const cSource = colIdx(header, 'Source');

      const asOfDate = findAsOfDate(rows) ?? new Date().toISOString().slice(0, 10);
      const holdings: ExtractedHolding[] = [];

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r] ?? [];
        const name = strip(row[cName]);
        const cv = num(row[cCurrent]);
        if (!name || cv <= 0) continue;
        holdings.push({
          instrumentName: name,
          quantity: num(row[cUnits]),
          unitPrice: num(row[cUnits]) > 0 ? cv / num(row[cUnits]) : undefined,
          valueInr: Math.round(cv * 100) / 100,
          asOfDate,
          rowMeta: {
            amc: strip(row[cAmc]),
            folio: strip(row[cFolio]),
            source: strip(row[cSource]),
            invested: num(row[cInvested]),
          },
        });
      }

      if (holdings.length === 0) {
        return {
          ok: false,
          parser: { name: NAME, version: VERSION },
          code: 'EMPTY_HOLDINGS',
          message: 'No mutual fund holdings found',
          warnings,
        };
      }

      const totalCurrent = holdings.reduce((s, h) => s + h.valueInr, 0);
      const totalInvested = holdings.reduce(
        (s, h) => s + Number(h.rowMeta?.invested ?? 0),
        0
      );

      const bundle: ExtractedAccountBundle = {
        account: {
          bucket: 'mutual_funds',
          provider: 'groww',
          nickname: 'Groww Mutual Funds',
          currency: 'INR',
        },
        holdings,
        totals: { investedValueInr: totalInvested, presentValueInr: totalCurrent },
      };

      return {
        ok: true,
        parser: { name: NAME, version: VERSION },
        bundles: [bundle],
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
