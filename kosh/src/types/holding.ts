import { z } from 'zod';
import { CurrencySchema } from './account';

const FdExtras = z.object({
  kind: z.literal('fd'),
  bankName: z.string(),
  principal: z.number(),
  interestRate: z.number(),
  startDate: z.string(),
  maturityDate: z.string(),
  payoutType: z.enum(['cumulative', 'monthly', 'quarterly']),
});

const RdExtras = z.object({
  kind: z.literal('rd'),
  bankName: z.string(),
  monthlyInstallment: z.number(),
  interestRate: z.number(),
  startDate: z.string(),
  maturityDate: z.string(),
  installmentsPaid: z.number().optional(),
});

const PpfExtras = z.object({
  kind: z.literal('ppf'),
  institution: z.string(),
  openingDate: z.string(),
  yearlyDeposits: z
    .array(z.object({ financialYear: z.string(), amount: z.number() }))
    .default([]),
});

const RealEstateExtras = z.object({
  kind: z.literal('real_estate'),
  address: z.string(),
  builder: z.string().optional(),
  totalCost: z.number(),
  paidByOwner: z.number(),
  loanOutstanding: z.number(),
  loanProvider: z.string().optional(),
  emiAmount: z.number().optional(),
  possessionDate: z.string().optional(),
  estimatedMarketValue: z.number().optional(),
});

const InsuranceExtras = z.object({
  kind: z.literal('insurance'),
  policyType: z.enum(['term', 'ulip', 'endowment', 'health']),
  insurer: z.string(),
  policyNumber: z.string(),
  sumAssured: z.number(),
  annualPremium: z.number(),
  premiumDueDate: z.string(),
  nominee: z.string(),
  premiumPaidTill: z.string(),
});

const StartupEquityExtras = z.object({
  kind: z.literal('startup_equity'),
  companyName: z.string(),
  shareCount: z.number(),
  costBasis: z.number(),
  lastValuation: z.number(),
  lastValuationDate: z.string(),
  notes: z.string().optional(),
});

const NpsExtras = z.object({
  kind: z.literal('nps'),
  pranNumberLast4: z.string(),
  scheme: z.string(),
  totalContributions: z.number(),
  asOfStatementDate: z.string(),
});

const EpfExtras = z.object({
  kind: z.literal('epf'),
  uanLast4: z.string(),
  employerName: z.string(),
  employeeShare: z.number(),
  employerShare: z.number(),
  pensionShare: z.number(),
});

const BondExtras = z.object({
  kind: z.literal('bond'),
  issuer: z.string(),
  faceValue: z.number(),
  couponRate: z.number().optional(),
  maturityDate: z.string().optional(),
  ytm: z.number().optional(),
});

export const HoldingExtrasSchema = z.discriminatedUnion('kind', [
  FdExtras,
  RdExtras,
  PpfExtras,
  RealEstateExtras,
  InsuranceExtras,
  StartupEquityExtras,
  NpsExtras,
  EpfExtras,
  BondExtras,
]);

export type HoldingExtras = z.infer<typeof HoldingExtrasSchema>;

export const HoldingSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  instrumentName: z.string().min(1),
  isin: z.string().optional(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  valueInr: z.number(),
  valueNative: z.number().optional(),
  nativeCurrency: CurrencySchema.optional(),
  asOfDate: z.string(),
  extras: HoldingExtrasSchema.optional(),
  parserName: z.string().optional(),
  parserVersion: z.string().optional(),
  sourceDocumentId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Holding = z.infer<typeof HoldingSchema>;
