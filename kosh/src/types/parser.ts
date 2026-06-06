import { Bucket } from './account';

export type ParserInputType = 'csv' | 'pdf' | 'xlsx';

export interface ParserInput {
  type: ParserInputType;
  filename: string;
  bytes: Uint8Array;
  textPreview?: string;
}

export interface ExtractedAccount {
  bucket: Bucket;
  provider: string;
  nickname: string;
  currency: 'INR' | 'USD';
  accountNumberLast4?: string;
}

export interface ExtractedHolding {
  instrumentName: string;
  isin?: string;
  quantity?: number;
  unitPrice?: number;
  valueInr: number;
  // For non-INR holdings (US stocks via INDmoney/DriveWealth), the parser
  // populates the native amount + currency. `valueInr` is the converted
  // value at the time the parser ran; downstream code recomputes the live
  // INR value from `valueNative` * current FX so a moving exchange rate
  // refreshes the dashboard.
  valueNative?: number;
  nativeCurrency?: 'USD';
  asOfDate: string;
  rowMeta?: Record<string, string | number>;
}

export interface ExtractedAccountBundle {
  account: ExtractedAccount;
  holdings: ExtractedHolding[];
  totals?: { investedValueInr?: number; presentValueInr?: number };
}

export interface ParserWarning {
  level: 'warn' | 'error';
  code: string;
  message: string;
  row?: number;
}

export interface ParserSuccess {
  ok: true;
  parser: { name: string; version: string };
  bundles: ExtractedAccountBundle[];
  warnings: ParserWarning[];
}

export interface ParserFailure {
  ok: false;
  parser: { name: string; version: string };
  code: string;
  message: string;
  warnings: ParserWarning[];
}

export type ParserResult = ParserSuccess | ParserFailure;

export interface Parser {
  readonly name: string;
  readonly version: string;
  readonly inputType: ParserInputType;
  detect(input: ParserInput): Promise<number>;
  parse(input: ParserInput): Promise<ParserResult>;
}
