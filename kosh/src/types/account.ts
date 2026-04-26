import { z } from 'zod';

export const BUCKETS = [
  'equity_india',
  'equity_pms',
  'equity_us',
  'mutual_funds',
  'bonds',
  'nps',
  'ppf',
  'epf',
  'fd',
  'startup_equity',
  'real_estate',
  'insurance',
  'other',
] as const;

export const BucketSchema = z.enum(BUCKETS);
export type Bucket = z.infer<typeof BucketSchema>;

export const CurrencySchema = z.enum(['INR', 'USD']);
export type Currency = z.infer<typeof CurrencySchema>;

export const AccountStatusSchema = z.enum(['active', 'closed', 'matured']);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const AccountSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  bucket: BucketSchema,
  provider: z.string(),
  nickname: z.string().min(1),
  accountNumberLast4: z.string().optional(),
  currency: CurrencySchema.default('INR'),
  status: AccountStatusSchema.default('active'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Account = z.infer<typeof AccountSchema>;

export const BUCKET_LABELS: Record<Bucket, string> = {
  equity_india: 'Indian Equity',
  equity_pms: 'PMS',
  equity_us: 'US Equity',
  mutual_funds: 'Mutual Funds',
  bonds: 'Bonds',
  nps: 'NPS',
  ppf: 'PPF',
  epf: 'EPF',
  fd: 'Fixed Deposits',
  startup_equity: 'Startup Equity',
  real_estate: 'Real Estate',
  insurance: 'Insurance',
  other: 'Other',
};

export const BUCKET_ICONS: Record<Bucket, string> = {
  equity_india: '📈',
  equity_pms: '🏦',
  equity_us: '🇺🇸',
  mutual_funds: '📊',
  bonds: '📜',
  nps: '👴',
  ppf: '🪙',
  epf: '💼',
  fd: '🏛️',
  startup_equity: '🚀',
  real_estate: '🏠',
  insurance: '🛡️',
  other: '📦',
};
