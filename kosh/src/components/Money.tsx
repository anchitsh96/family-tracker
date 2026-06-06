import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { usePrivacy } from '@/state/privacy';

export function formatINR(
  value: number,
  opts: { compact?: boolean; decimals?: number } = {}
): string {
  const { compact = false, decimals = 0 } = opts;
  if (!isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (compact) {
    if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)}Cr`;
    if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)}L`;
    if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  }

  // Indian numbering format: 12,34,56,789
  const fixed = abs.toFixed(decimals);
  const [whole, frac] = fixed.split('.');
  const safeWhole = whole ?? '0';
  const lastThree = safeWhole.slice(-3);
  const rest = safeWhole.slice(0, -3);
  const grouped = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
    : lastThree;
  return `${sign}₹${grouped}${frac ? '.' + frac : ''}`;
}

// USD formatting. Same shape as formatINR but with US thousands grouping
// (1,234.56 not 1,23,456) and a "$" prefix. Used in spots where we show
// dollar values natively: the US Equity allocation row's secondary line
// and the INDmoney account-detail view.
export function formatUSD(
  value: number,
  opts: { compact?: boolean; decimals?: number } = {}
): string {
  const { compact = false, decimals = 2 } = opts;
  if (!isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (compact) {
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  }

  const fixed = abs.toFixed(decimals);
  const [whole, frac] = fixed.split('.');
  const safeWhole = whole ?? '0';
  // US grouping: every 3 digits from the right.
  const grouped = safeWhole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${grouped}${frac ? '.' + frac : ''}`;
}

// Standard Braille number cells (1-9, 0 -> a-j patterns). Each digit gets
// a distinct dot pattern, so a masked figure reads as a number-shaped
// Braille pattern — unreadable to a normal onlooker but still clearly
// "a number is here".
const BRAILLE_DIGIT: Record<string, string> = {
  '0': '⠚',
  '1': '⠁',
  '2': '⠃',
  '3': '⠉',
  '4': '⠙',
  '5': '⠑',
  '6': '⠋',
  '7': '⠛',
  '8': '⠓',
  '9': '⠊',
};

// Privacy mask: replace every digit with its Braille cell and strip ALL
// other decoration — ₹, commas, decimals, %, L/Cr/K suffixes, arrows —
// leaving just the Braille pattern. Spaces between distinct number groups
// (e.g. in the delta line) are kept so the groups stay visually separate.
export function maskDigits(text: string): string {
  return text
    .replace(/[0-9]/g, (d) => BRAILLE_DIGIT[d] ?? d)
    // Keep only Braille cells (U+2800–U+28FF) and spaces.
    .replace(/[^⠀-⣿ ]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

interface MoneyProps {
  value: number;
  compact?: boolean;
  decimals?: number;
  signed?: boolean;
  style?: StyleProp<TextStyle>;
}

export function Money({ value, compact, decimals, signed, style }: MoneyProps) {
  const hidden = usePrivacy((s) => s.hidden);
  const raw = formatINR(value, { compact, decimals });
  const text = hidden ? maskDigits(raw) : raw;
  const color =
    signed && value > 0
      ? colors.positive
      : signed && value < 0
        ? colors.negative
        : undefined;
  return (
    <Text style={[typography.numeric, color ? { color } : null, style]}>
      {text}
    </Text>
  );
}

// USD-denominated counterpart of <Money/>. Same privacy behaviour (the
// Braille mask is currency-agnostic). Used where we deliberately want to
// surface the native dollar amount alongside the INR figure.
interface MoneyUsdProps {
  value: number;
  compact?: boolean;
  decimals?: number;
  style?: StyleProp<TextStyle>;
}

export function MoneyUsd({ value, compact, decimals = 2, style }: MoneyUsdProps) {
  const hidden = usePrivacy((s) => s.hidden);
  const raw = formatUSD(value, { compact, decimals });
  const text = hidden ? maskDigits(raw) : raw;
  return (
    <Text style={[typography.numeric, style]}>{text}</Text>
  );
}
