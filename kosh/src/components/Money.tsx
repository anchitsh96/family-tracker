import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { colors } from '@/theme/colors';

export function formatINR(value: number, opts: { compact?: boolean; decimals?: number } = {}): string {
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
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree : lastThree;
  return `${sign}₹${grouped}${frac ? '.' + frac : ''}`;
}

interface MoneyProps {
  value: number;
  compact?: boolean;
  decimals?: number;
  signed?: boolean;
  style?: StyleProp<TextStyle>;
}

export function Money({ value, compact, decimals, signed, style }: MoneyProps) {
  const text = formatINR(value, { compact, decimals });
  const color =
    signed && value > 0
      ? colors.positive
      : signed && value < 0
        ? colors.negative
        : undefined;
  return <Text style={[color ? { color } : null, style]}>{text}</Text>;
}
