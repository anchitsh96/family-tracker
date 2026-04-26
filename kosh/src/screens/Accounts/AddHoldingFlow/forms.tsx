import React from 'react';
import { Bucket } from '@/types/account';
import { saveHolding, todayISO } from '../saveHolding';
import { FormBuilder, FormField } from './FormBuilder';
import { useActiveProfile } from '@/state/activeProfile';

interface FormProps {
  onSaved: () => void;
}

const num = (s: string | undefined): number => Number((s ?? '0').replace(/,/g, ''));

function useProfileId() {
  const id = useActiveProfile((s) => s.activeProfileId);
  if (!id) throw new Error('No active profile');
  return id;
}

// FD --------------------------------------------------------------------------
const FD_FIELDS: FormField[] = [
  { key: 'bankName', label: 'Bank', placeholder: 'SBI', required: true, kind: 'text' },
  { key: 'principal', label: 'Principal (₹)', required: true, kind: 'currency' },
  { key: 'rate', label: 'Interest rate (%)', required: true, kind: 'number' },
  { key: 'startDate', label: 'Start date', required: true, kind: 'date', hint: 'YYYY-MM-DD' },
  { key: 'maturityDate', label: 'Maturity date', required: true, kind: 'date', hint: 'YYYY-MM-DD' },
  { key: 'payoutType', label: 'Payout', kind: 'enum', options: ['cumulative', 'monthly', 'quarterly'], required: true, defaultValue: 'cumulative' },
  { key: 'currentValue', label: 'Current accrued value (₹)', kind: 'currency', required: true, hint: 'Approximate value as of today' },
];

export function FdForm({ onSaved }: FormProps) {
  const profileId = useProfileId();
  const bump = useActiveProfile((s) => s.bump);
  return (
    <FormBuilder
      title="Fixed Deposit"
      subtitle="A lump-sum deposit at a fixed rate."
      fields={FD_FIELDS}
      onSubmit={async (v) => {
        saveHolding({
          profileId,
          bucket: 'fd',
          provider: v.bankName!,
          accountNickname: `${v.bankName} FD`,
          instrumentName: `${v.bankName} FD ${v.maturityDate}`,
          valueInr: num(v.currentValue),
          asOfDate: todayISO(),
          extras: {
            kind: 'fd',
            bankName: v.bankName!,
            principal: num(v.principal),
            interestRate: num(v.rate),
            startDate: v.startDate!,
            maturityDate: v.maturityDate!,
            payoutType: v.payoutType as 'cumulative' | 'monthly' | 'quarterly',
          },
        });
        bump();
        onSaved();
      }}
    />
  );
}

// RD --------------------------------------------------------------------------
const RD_FIELDS: FormField[] = [
  { key: 'bankName', label: 'Bank', placeholder: 'SBI', required: true, kind: 'text' },
  { key: 'monthlyInstallment', label: 'Monthly installment (₹)', required: true, kind: 'currency' },
  { key: 'rate', label: 'Interest rate (%)', required: true, kind: 'number' },
  { key: 'startDate', label: 'Start date', required: true, kind: 'date', hint: 'YYYY-MM-DD' },
  { key: 'maturityDate', label: 'Maturity date', required: true, kind: 'date', hint: 'YYYY-MM-DD' },
  { key: 'installmentsPaid', label: 'Installments paid so far', kind: 'number', hint: 'Optional' },
  { key: 'currentValue', label: 'Current accrued value (₹)', kind: 'currency', required: true, hint: 'Approximate value as of today' },
];

export function RdForm({ onSaved }: FormProps) {
  const profileId = useProfileId();
  const bump = useActiveProfile((s) => s.bump);
  return (
    <FormBuilder
      title="Recurring Deposit"
      subtitle="A fixed monthly deposit at a fixed rate."
      fields={RD_FIELDS}
      onSubmit={async (v) => {
        const installmentsPaidRaw = v.installmentsPaid ? num(v.installmentsPaid) : undefined;
        saveHolding({
          profileId,
          bucket: 'rd',
          provider: v.bankName!,
          accountNickname: `${v.bankName} RD`,
          instrumentName: `${v.bankName} RD ${v.maturityDate}`,
          valueInr: num(v.currentValue),
          asOfDate: todayISO(),
          extras: {
            kind: 'rd',
            bankName: v.bankName!,
            monthlyInstallment: num(v.monthlyInstallment),
            interestRate: num(v.rate),
            startDate: v.startDate!,
            maturityDate: v.maturityDate!,
            installmentsPaid: installmentsPaidRaw,
          },
        });
        bump();
        onSaved();
      }}
    />
  );
}

// PPF -------------------------------------------------------------------------
const PPF_FIELDS: FormField[] = [
  { key: 'institution', label: 'Institution', defaultValue: 'SBI', required: true, kind: 'text' },
  { key: 'openingDate', label: 'Account opening date', required: true, kind: 'date', hint: 'YYYY-MM-DD' },
  { key: 'currentBalance', label: 'Current balance (₹)', required: true, kind: 'currency' },
];

export function PpfForm({ onSaved }: FormProps) {
  const profileId = useProfileId();
  const bump = useActiveProfile((s) => s.bump);
  return (
    <FormBuilder
      title="PPF"
      subtitle="Public Provident Fund balance"
      fields={PPF_FIELDS}
      onSubmit={async (v) => {
        saveHolding({
          profileId,
          bucket: 'ppf',
          provider: v.institution!,
          accountNickname: `${v.institution} PPF`,
          instrumentName: `${v.institution} PPF`,
          valueInr: num(v.currentBalance),
          asOfDate: todayISO(),
          extras: {
            kind: 'ppf',
            institution: v.institution!,
            openingDate: v.openingDate!,
            yearlyDeposits: [],
          },
        });
        bump();
        onSaved();
      }}
    />
  );
}

// Real Estate -----------------------------------------------------------------
const RE_FIELDS: FormField[] = [
  { key: 'address', label: 'Address / project', required: true, kind: 'text' },
  { key: 'builder', label: 'Builder', kind: 'text' },
  { key: 'totalCost', label: 'Total cost (₹)', required: true, kind: 'currency' },
  { key: 'paid', label: 'Paid by owner so far (₹)', required: true, kind: 'currency' },
  { key: 'loanOutstanding', label: 'Loan outstanding (₹)', required: true, kind: 'currency', defaultValue: '0' },
  { key: 'loanProvider', label: 'Loan provider', kind: 'text' },
  { key: 'emi', label: 'EMI (₹)', kind: 'currency' },
  { key: 'possessionDate', label: 'Possession date', kind: 'date', hint: 'YYYY-MM-DD' },
  { key: 'estMarket', label: 'Estimated market value (₹)', kind: 'currency', hint: 'Use this if known; otherwise paid-by-owner is used' },
];

export function RealEstateForm({ onSaved }: FormProps) {
  const profileId = useProfileId();
  const bump = useActiveProfile((s) => s.bump);
  return (
    <FormBuilder
      title="Real Estate"
      subtitle="A property under construction or held."
      fields={RE_FIELDS}
      onSubmit={async (v) => {
        const value = v.estMarket ? num(v.estMarket) : num(v.paid);
        saveHolding({
          profileId,
          bucket: 'real_estate',
          provider: v.builder ?? 'manual',
          accountNickname: v.address!.slice(0, 60),
          instrumentName: v.address!.slice(0, 80),
          valueInr: value,
          asOfDate: todayISO(),
          extras: {
            kind: 'real_estate',
            address: v.address!,
            builder: v.builder || undefined,
            totalCost: num(v.totalCost),
            paidByOwner: num(v.paid),
            loanOutstanding: num(v.loanOutstanding),
            loanProvider: v.loanProvider || undefined,
            emiAmount: v.emi ? num(v.emi) : undefined,
            possessionDate: v.possessionDate || undefined,
            estimatedMarketValue: v.estMarket ? num(v.estMarket) : undefined,
          },
        });
        bump();
        onSaved();
      }}
    />
  );
}

// Angel investment / Startup equity --------------------------------------------
const ANGEL_FIELDS: FormField[] = [
  { key: 'company', label: 'Company name', required: true, kind: 'text' },
  { key: 'shares', label: 'Number of shares', required: true, kind: 'number' },
  { key: 'cost', label: 'Cost basis (₹)', required: true, kind: 'currency' },
  { key: 'lastValuation', label: 'Last valuation total (₹)', required: true, kind: 'currency', hint: "Your stake's value at last round" },
  { key: 'lastDate', label: 'Last valuation date', required: true, kind: 'date', hint: 'YYYY-MM-DD' },
  { key: 'notes', label: 'Notes', kind: 'text' },
];

export function AngelInvestmentForm({ onSaved }: FormProps) {
  const profileId = useProfileId();
  const bump = useActiveProfile((s) => s.bump);
  return (
    <FormBuilder
      title="Startup / Angel"
      subtitle="A private company holding."
      fields={ANGEL_FIELDS}
      onSubmit={async (v) => {
        saveHolding({
          profileId,
          bucket: 'startup_equity',
          provider: 'manual',
          accountNickname: `${v.company} cap table`,
          instrumentName: `${v.company} shares`,
          valueInr: num(v.lastValuation),
          quantity: num(v.shares),
          asOfDate: v.lastDate!,
          extras: {
            kind: 'startup_equity',
            companyName: v.company!,
            shareCount: num(v.shares),
            costBasis: num(v.cost),
            lastValuation: num(v.lastValuation),
            lastValuationDate: v.lastDate!,
            notes: v.notes || undefined,
          },
        });
        bump();
        onSaved();
      }}
    />
  );
}

// NPS -------------------------------------------------------------------------
const NPS_FIELDS: FormField[] = [
  { key: 'pranLast4', label: 'PRAN (last 4 digits)', required: true, kind: 'text' },
  { key: 'scheme', label: 'Scheme', defaultValue: 'NPS All Citizen Tier 1', required: true, kind: 'text' },
  { key: 'totalContrib', label: 'Total contributions (₹)', required: true, kind: 'currency' },
  { key: 'currentValue', label: 'Current corpus value (₹)', required: true, kind: 'currency' },
  { key: 'asOf', label: 'As-of statement date', required: true, kind: 'date', hint: 'YYYY-MM-DD' },
];

export function NpsForm({ onSaved }: FormProps) {
  const profileId = useProfileId();
  const bump = useActiveProfile((s) => s.bump);
  return (
    <FormBuilder
      title="NPS"
      subtitle="National Pension System balance"
      fields={NPS_FIELDS}
      onSubmit={async (v) => {
        saveHolding({
          profileId,
          bucket: 'nps',
          provider: 'nsdl_nps',
          accountNickname: `NPS ****${v.pranLast4}`,
          instrumentName: v.scheme!,
          valueInr: num(v.currentValue),
          asOfDate: v.asOf!,
          extras: {
            kind: 'nps',
            pranNumberLast4: v.pranLast4!,
            scheme: v.scheme!,
            totalContributions: num(v.totalContrib),
            asOfStatementDate: v.asOf!,
          },
        });
        bump();
        onSaved();
      }}
    />
  );
}

// EPF -------------------------------------------------------------------------
const EPF_FIELDS: FormField[] = [
  { key: 'uanLast4', label: 'UAN (last 4 digits)', required: true, kind: 'text' },
  { key: 'employer', label: 'Employer', required: true, kind: 'text' },
  { key: 'employeeShare', label: 'Employee share (₹)', required: true, kind: 'currency' },
  { key: 'employerShare', label: 'Employer share (₹)', required: true, kind: 'currency' },
  { key: 'pensionShare', label: 'Pension share (₹)', required: true, kind: 'currency', defaultValue: '0' },
];

export function EpfForm({ onSaved }: FormProps) {
  const profileId = useProfileId();
  const bump = useActiveProfile((s) => s.bump);
  return (
    <FormBuilder
      title="EPF"
      subtitle="Employee Provident Fund balance"
      fields={EPF_FIELDS}
      onSubmit={async (v) => {
        const total = num(v.employeeShare) + num(v.employerShare) + num(v.pensionShare);
        saveHolding({
          profileId,
          bucket: 'epf',
          provider: 'epfo',
          accountNickname: `EPF ****${v.uanLast4}`,
          instrumentName: `EPF — ${v.employer}`,
          valueInr: total,
          asOfDate: todayISO(),
          extras: {
            kind: 'epf',
            uanLast4: v.uanLast4!,
            employerName: v.employer!,
            employeeShare: num(v.employeeShare),
            employerShare: num(v.employerShare),
            pensionShare: num(v.pensionShare),
          },
        });
        bump();
        onSaved();
      }}
    />
  );
}

// Bond ------------------------------------------------------------------------
const BOND_FIELDS: FormField[] = [
  { key: 'issuer', label: 'Issuer', required: true, kind: 'text' },
  { key: 'name', label: 'Bond name / ISIN', required: true, kind: 'text' },
  { key: 'faceValue', label: 'Face value (₹)', required: true, kind: 'currency' },
  { key: 'coupon', label: 'Coupon rate (%)', kind: 'number' },
  { key: 'maturity', label: 'Maturity date', kind: 'date', hint: 'YYYY-MM-DD' },
  { key: 'currentValue', label: 'Current value (₹)', required: true, kind: 'currency' },
  { key: 'platform', label: 'Platform', kind: 'text', defaultValue: 'Wint Wealth' },
];

export function BondForm({ onSaved }: FormProps) {
  const profileId = useProfileId();
  const bump = useActiveProfile((s) => s.bump);
  return (
    <FormBuilder
      title="Bond"
      subtitle="Corporate or sovereign bond."
      fields={BOND_FIELDS}
      onSubmit={async (v) => {
        saveHolding({
          profileId,
          bucket: 'bonds',
          provider: v.platform || 'manual',
          accountNickname: `${v.platform} bonds`,
          instrumentName: v.name!,
          valueInr: num(v.currentValue),
          asOfDate: todayISO(),
          extras: {
            kind: 'bond',
            issuer: v.issuer!,
            faceValue: num(v.faceValue),
            couponRate: v.coupon ? num(v.coupon) : undefined,
            maturityDate: v.maturity || undefined,
          },
        });
        bump();
        onSaved();
      }}
    />
  );
}

// US Stock (manual) -----------------------------------------------------------
const US_FIELDS: FormField[] = [
  { key: 'instrument', label: 'Instrument', required: true, kind: 'text', placeholder: 'Apple Inc.' },
  { key: 'ticker', label: 'Ticker', required: true, kind: 'text', placeholder: 'AAPL' },
  { key: 'qty', label: 'Quantity', required: true, kind: 'number' },
  { key: 'inrValue', label: 'Value in INR today (₹)', required: true, kind: 'currency', hint: 'No FX math in v1 — enter the INR equivalent today.' },
];

export function UsStockManualForm({ onSaved }: FormProps) {
  const profileId = useProfileId();
  const bump = useActiveProfile((s) => s.bump);
  return (
    <FormBuilder
      title="US Stock"
      subtitle="Enter INR value as of today."
      fields={US_FIELDS}
      onSubmit={async (v) => {
        saveHolding({
          profileId,
          bucket: 'equity_us',
          provider: 'indmoney',
          accountNickname: 'US holdings',
          instrumentName: `${v.instrument} (${v.ticker})`,
          valueInr: num(v.inrValue),
          quantity: num(v.qty),
          asOfDate: todayISO(),
        });
        bump();
        onSaved();
      }}
    />
  );
}

// Insurance -------------------------------------------------------------------
const INS_FIELDS: FormField[] = [
  { key: 'policyType', label: 'Policy type', kind: 'enum', options: ['term', 'ulip', 'endowment', 'health'], required: true, defaultValue: 'term' },
  { key: 'insurer', label: 'Insurer', required: true, kind: 'text' },
  { key: 'policyNumber', label: 'Policy number', required: true, kind: 'text' },
  { key: 'sumAssured', label: 'Sum assured (₹)', required: true, kind: 'currency' },
  { key: 'annualPremium', label: 'Annual premium (₹)', required: true, kind: 'currency' },
  { key: 'premiumDueDate', label: 'Next premium date', required: true, kind: 'date', hint: 'YYYY-MM-DD' },
  { key: 'nominee', label: 'Nominee', required: true, kind: 'text' },
  { key: 'paidTill', label: 'Premium paid till', required: true, kind: 'date', hint: 'YYYY-MM-DD' },
];

export function InsuranceForm({ onSaved }: FormProps) {
  const profileId = useProfileId();
  const bump = useActiveProfile((s) => s.bump);
  return (
    <FormBuilder
      title="Insurance"
      subtitle="Term policies have a sum-assured but contribute ₹0 to net worth."
      fields={INS_FIELDS}
      onSubmit={async (v) => {
        const policyType = v.policyType as 'term' | 'ulip' | 'endowment' | 'health';
        // Term insurance is not an asset — value 0. ULIP/endowment have surrender value.
        const valueInr = policyType === 'term' || policyType === 'health' ? 0 : num(v.sumAssured);
        saveHolding({
          profileId,
          bucket: 'insurance',
          provider: v.insurer!,
          accountNickname: `${v.insurer} ${policyType}`,
          instrumentName: `${v.insurer} policy ${v.policyNumber}`,
          valueInr,
          asOfDate: todayISO(),
          extras: {
            kind: 'insurance',
            policyType,
            insurer: v.insurer!,
            policyNumber: v.policyNumber!,
            sumAssured: num(v.sumAssured),
            annualPremium: num(v.annualPremium),
            premiumDueDate: v.premiumDueDate!,
            nominee: v.nominee!,
            premiumPaidTill: v.paidTill!,
          },
        });
        bump();
        onSaved();
      }}
    />
  );
}

// Generic ---------------------------------------------------------------------
const GEN_FIELDS: FormField[] = [
  { key: 'name', label: 'Instrument', required: true, kind: 'text' },
  { key: 'provider', label: 'Provider / platform', defaultValue: 'manual', kind: 'text' },
  { key: 'value', label: 'Current value (₹)', required: true, kind: 'currency' },
  { key: 'qty', label: 'Quantity', kind: 'number' },
];

export function GenericHoldingForm({ bucket, onSaved }: { bucket: Bucket; onSaved: () => void }) {
  const profileId = useProfileId();
  const bump = useActiveProfile((s) => s.bump);
  return (
    <FormBuilder
      title="Add holding"
      subtitle="Free-form entry."
      fields={GEN_FIELDS}
      onSubmit={async (v) => {
        saveHolding({
          profileId,
          bucket,
          provider: v.provider || 'manual',
          accountNickname: v.provider || 'Manual entry',
          instrumentName: v.name!,
          valueInr: num(v.value),
          quantity: v.qty ? num(v.qty) : undefined,
          asOfDate: todayISO(),
        });
        bump();
        onSaved();
      }}
    />
  );
}

// Mutual Funds (manual) --------------------------------------------------------
const MF_FIELDS: FormField[] = [
  { key: 'fundName', label: 'Scheme name', required: true, kind: 'text' },
  { key: 'amc', label: 'AMC', required: true, kind: 'text' },
  { key: 'units', label: 'Units', required: true, kind: 'number' },
  { key: 'currentValue', label: 'Current value (₹)', required: true, kind: 'currency' },
  { key: 'platform', label: 'Platform', defaultValue: 'Groww', kind: 'text' },
];

export function MutualFundForm({ onSaved }: FormProps) {
  const profileId = useProfileId();
  const bump = useActiveProfile((s) => s.bump);
  return (
    <FormBuilder
      title="Mutual Fund"
      fields={MF_FIELDS}
      onSubmit={async (v) => {
        saveHolding({
          profileId,
          bucket: 'mutual_funds',
          provider: v.platform || 'manual',
          accountNickname: `${v.platform} MF`,
          instrumentName: v.fundName!,
          valueInr: num(v.currentValue),
          quantity: num(v.units),
          asOfDate: todayISO(),
        });
        bump();
        onSaved();
      }}
    />
  );
}

// Equity (India / PMS) manual --------------------------------------------------
const EQ_FIELDS: FormField[] = [
  { key: 'instrument', label: 'Instrument / symbol', required: true, kind: 'text' },
  { key: 'platform', label: 'Broker / platform', defaultValue: 'Zerodha', kind: 'text' },
  { key: 'qty', label: 'Quantity', required: true, kind: 'number' },
  { key: 'currentValue', label: 'Current value (₹)', required: true, kind: 'currency' },
];

export function EquityIndiaForm({ onSaved }: FormProps) {
  const profileId = useProfileId();
  const bump = useActiveProfile((s) => s.bump);
  return (
    <FormBuilder
      title="Indian Equity"
      fields={EQ_FIELDS}
      onSubmit={async (v) => {
        saveHolding({
          profileId,
          bucket: 'equity_india',
          provider: v.platform!,
          accountNickname: `${v.platform} equity`,
          instrumentName: v.instrument!,
          valueInr: num(v.currentValue),
          quantity: num(v.qty),
          asOfDate: todayISO(),
        });
        bump();
        onSaved();
      }}
    />
  );
}

export function PmsForm({ onSaved }: FormProps) {
  const profileId = useProfileId();
  const bump = useActiveProfile((s) => s.bump);
  return (
    <FormBuilder
      title="PMS"
      subtitle="Portfolio Management Service holding"
      fields={[
        { key: 'platform', label: 'PMS', defaultValue: 'W by Groww', required: true, kind: 'text' },
        { key: 'currentValue', label: 'Current NAV (₹)', required: true, kind: 'currency' },
      ]}
      onSubmit={async (v) => {
        saveHolding({
          profileId,
          bucket: 'equity_pms',
          provider: v.platform!,
          accountNickname: `${v.platform} PMS`,
          instrumentName: `${v.platform} PMS NAV`,
          valueInr: num(v.currentValue),
          asOfDate: todayISO(),
        });
        bump();
        onSaved();
      }}
    />
  );
}

export function pickFormFor(bucket: Bucket): React.ComponentType<FormProps> {
  switch (bucket) {
    case 'fd': return FdForm;
    case 'rd': return RdForm;
    case 'ppf': return PpfForm;
    case 'real_estate': return RealEstateForm;
    case 'startup_equity': return AngelInvestmentForm;
    case 'nps': return NpsForm;
    case 'epf': return EpfForm;
    case 'bonds': return BondForm;
    case 'equity_us': return UsStockManualForm;
    case 'insurance': return InsuranceForm;
    case 'mutual_funds': return MutualFundForm;
    case 'equity_india': return EquityIndiaForm;
    case 'equity_pms': return PmsForm;
    default: return ({ onSaved }) => <GenericHoldingForm bucket={bucket} onSaved={onSaved} />;
  }
}
