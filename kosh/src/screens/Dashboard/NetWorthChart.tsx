import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  LayoutChangeEvent,
  Pressable,
  PanResponder,
} from 'react-native';
import { formatINR, maskDigits } from '@/components/Money';
import { usePrivacy } from '@/state/privacy';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, radius } from '@/theme/spacing';

export interface NetWorthPoint {
  date: string; // ISO date string
  value: number; // net worth in INR
}

export type Period = '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'ALL';

export interface PeriodDelta {
  value: number;
  percent: number;
  label: string;
}

// Visible period chips on the chart. '1W' is omitted intentionally — the
// chart now plots one consolidated point per month-end (plus "today"),
// so a one-week window is at most a single dot and has no useful delta.
// The Period TYPE still includes '1W' for compatibility but it's never
// surfaced to the user.
const PERIODS: Period[] = ['1M', '3M', 'YTD', '1Y', 'ALL'];

const PERIOD_LABEL: Record<Period, string> = {
  '1W': 'Past week',
  '1M': 'Past month',
  '3M': 'Past 3 months',
  YTD: 'Year to date',
  '1Y': 'Past year',
  ALL: 'All time',
};

const DAY = 86_400_000;

// Cutoff timestamp for a given period, or null for "ALL". Centralised so
// filterByPeriod (chart range) and computeDelta (delta baseline) stay in
// sync.
//
// Semantics are MONTH-BOUNDARY based, matching the month-on-month chart:
//   1M  → start of current month  → baseline = last month-end
//   3M  → first day of (curMonth - 2) → baseline = 3 month-ends back
//   1Y  → first day of (curMonth - 11) → baseline = 12 month-ends back
//   YTD → Jan 1 of current year
//   1W  → 7-day window (legacy; chip not shown to user anymore)
function periodCutoff(period: Period): number | null {
  if (period === 'ALL') return null;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case '1W':
      return Date.now() - 7 * DAY;
    case '1M':
      return new Date(y, m, 1).getTime();
    case '3M':
      return new Date(y, m - 2, 1).getTime();
    case '1Y':
      return new Date(y, m - 11, 1).getTime();
    case 'YTD':
      return new Date(y, 0, 1).getTime();
    default:
      return 0;
  }
}

export function filterByPeriod(points: NetWorthPoint[], period: Period): NetWorthPoint[] {
  const cutoff = periodCutoff(period);
  if (cutoff === null || points.length === 0) return points;
  return points.filter((p) => {
    const t = new Date(p.date).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

// Net-worth change over the selected period.
//
// Baseline = the latest history point AT OR BEFORE the cutoff in the
// FULL history (not the filtered window). For "1M" that's the value as
// of one month ago — i.e. the last statement before the lookback
// boundary. This matches what a bank shows as "% change this month".
//
// If no point is that old (you only started tracking recently), we fall
// back to the very first point — the delta then reads "since you started"
// which is the most honest answer.
//
// `allPoints` MUST be the full unfiltered history. Passing a filtered
// window was the previous bug — when the only old statement got
// filtered out, baseline collapsed to a recent point and the delta
// reported ~0.
export function computeDelta(
  allPoints: NetWorthPoint[],
  period: Period
): PeriodDelta | null {
  if (allPoints.length < 2) return null;
  const last = allPoints[allPoints.length - 1]!.value;
  const cutoff = periodCutoff(period);

  let baseline: number;
  if (cutoff === null) {
    baseline = allPoints[0]!.value;
  } else {
    // Walk forward; the last point with t <= cutoff is the baseline.
    let baseIdx = -1;
    for (let i = 0; i < allPoints.length; i++) {
      const t = new Date(allPoints[i]!.date).getTime();
      if (Number.isFinite(t) && t <= cutoff) baseIdx = i;
      else if (Number.isFinite(t) && t > cutoff) break;
    }
    baseline = baseIdx >= 0 ? allPoints[baseIdx]!.value : allPoints[0]!.value;
  }

  const value = last - baseline;
  const percent = baseline !== 0 ? (value / baseline) * 100 : 0;
  return { value, percent, label: PERIOD_LABEL[period] };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface Props {
  points: NetWorthPoint[]; // full history; filtered internally by period
  period: Period;
  onPeriodChange: (p: Period) => void;
}

const CHART_H = 150;
const PAD = 6;
const LINE_W = 2.5;

interface Coord {
  x: number;
  y: number;
}
interface Geometry {
  coords: Coord[];
  segments: { x: number; y: number; len: number; angle: number }[];
  up: boolean;
}

// Robinhood-style net worth chart: stroke-only line, tappable period
// selector, and touch-scrub — drag across the line to read off the value
// and date at any point. Scrub handling uses RN core PanResponder.
export function NetWorthChart({ points, period, onPeriodChange }: Props) {
  const [width, setWidth] = useState(0);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const hidden = usePrivacy((s) => s.hidden);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const visible = useMemo(() => filterByPeriod(points, period), [points, period]);

  const geometry = useMemo<Geometry | null>(() => {
    if (visible.length < 2 || width <= 0) return null;
    const values = visible.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const innerW = Math.max(width - 2 * PAD, 1);
    const innerH = CHART_H - 2 * PAD;
    const coords: Coord[] = visible.map((p, i) => ({
      x: PAD + (i / (visible.length - 1)) * innerW,
      y: PAD + (1 - (p.value - min) / range) * innerH,
    }));
    const segments = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i]!;
      const b = coords[i + 1]!;
      segments.push({
        x: a.x,
        y: a.y,
        len: Math.hypot(b.x - a.x, b.y - a.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      });
    }
    return {
      coords,
      segments,
      up: visible[visible.length - 1]!.value >= visible[0]!.value,
    };
  }, [visible, width]);

  // PanResponder is created once; route through refs so the scrub handler
  // always sees the latest geometry/visible data.
  const geomRef = useRef<Geometry | null>(geometry);
  geomRef.current = geometry;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const scrubTo = (x: number) => {
    const g = geomRef.current;
    if (!g || g.coords.length === 0) return;
    let best = 0;
    let bestDist = Infinity;
    g.coords.forEach((c, i) => {
      const d = Math.abs(c.x - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setScrubIndex(best);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => scrubTo(e.nativeEvent.locationX),
      onPanResponderMove: (e) => scrubTo(e.nativeEvent.locationX),
      onPanResponderRelease: () => setScrubIndex(null),
      onPanResponderTerminate: () => setScrubIndex(null),
    })
  ).current;

  const lineColor = geometry?.up === false ? colors.negative : colors.positive;

  // Clamp scrubIndex into the current visible range (period change can
  // shrink the array while a scrub is mid-flight).
  const safeScrub =
    scrubIndex != null && geometry && scrubIndex < geometry.coords.length
      ? scrubIndex
      : null;
  const scrubCoord = safeScrub != null ? geometry!.coords[safeScrub]! : null;
  const scrubPoint = safeScrub != null ? visibleRef.current[safeScrub] : null;

  // Position the floating label so it stays inside the chart bounds.
  const LABEL_W = 150;
  let labelLeft = 0;
  if (scrubCoord) {
    labelLeft = Math.min(
      Math.max(scrubCoord.x - LABEL_W / 2, 0),
      Math.max(width - LABEL_W, 0)
    );
  }

  return (
    <View style={styles.wrap}>
      {/* Fixed-height strip above the chart. The scrub readout lives here
          at a constant Y — only its X follows the finger — so it never
          overlaps the line and never jumps vertically. */}
      <View style={styles.labelStrip}>
        {scrubCoord && scrubPoint ? (
          <View style={[styles.scrubLabel, { left: labelLeft, width: LABEL_W }]}>
            <Text style={styles.scrubValue}>
              {hidden
                ? maskDigits(formatINR(scrubPoint.value))
                : formatINR(scrubPoint.value)}
            </Text>
            <Text style={styles.scrubDate}>{fmtDate(scrubPoint.date)}</Text>
          </View>
        ) : null}
      </View>

      <View
        style={[styles.canvas, { height: CHART_H }]}
        onLayout={onLayout}
        {...panResponder.panHandlers}
      >
        {geometry ? (
          <>
            {/* The line is drawn as rotated rectangles between points.
                A dot the exact thickness of the line sits on every vertex
                to fill the wedge gap where two segments meet — turning the
                polyline into one continuous line with round joins. */}
            {geometry.segments.map((s, i) => (
              <View
                key={`s${i}`}
                style={{
                  position: 'absolute',
                  left: s.x,
                  top: s.y - LINE_W / 2,
                  width: s.len,
                  height: LINE_W,
                  backgroundColor: lineColor,
                  transform: [{ rotateZ: `${s.angle}rad` }],
                  transformOrigin: 'left center',
                }}
              />
            ))}
            {geometry.coords.map((c, i) => (
              <View
                key={`j${i}`}
                style={{
                  position: 'absolute',
                  left: c.x - LINE_W / 2,
                  top: c.y - LINE_W / 2,
                  width: LINE_W,
                  height: LINE_W,
                  borderRadius: LINE_W / 2,
                  backgroundColor: lineColor,
                }}
              />
            ))}
            {/* end dot (hidden while scrubbing to reduce clutter) */}
            {safeScrub == null && (
              <View
                style={{
                  position: 'absolute',
                  left: geometry.coords[geometry.coords.length - 1]!.x - 4,
                  top: geometry.coords[geometry.coords.length - 1]!.y - 4,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: lineColor,
                }}
              />
            )}
            {/* scrub cursor: vertical guide + ring on the line */}
            {scrubCoord && (
              <>
                <View
                  style={{
                    position: 'absolute',
                    left: scrubCoord.x - 0.5,
                    top: 0,
                    width: 1,
                    height: CHART_H,
                    backgroundColor: colors.border,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    left: scrubCoord.x - 6,
                    top: scrubCoord.y - 6,
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: colors.bg,
                    borderWidth: 2.5,
                    borderColor: lineColor,
                  }}
                />
              </>
            )}
          </>
        ) : (
          <View style={styles.emptyInner}>
            <Text style={styles.emptyTxt}>
              {points.length < 2
                ? 'Your net worth trend will appear here as you add and update holdings.'
                : 'No data points in this period yet — try a longer range.'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.pills}>
        {PERIODS.map((p) => {
          const active = p === period;
          return (
            <Pressable
              key={p}
              onPress={() => onPeriodChange(p)}
              style={[styles.pill, active && styles.pillActive]}
              hitSlop={6}
            >
              <Text style={[styles.pillTxt, active && styles.pillTxtActive]}>{p}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const LABEL_STRIP_H = 42;

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  // Reserved space above the chart for the scrub readout. Always present
  // (empty when not scrubbing) so the chart never shifts.
  labelStrip: {
    height: LABEL_STRIP_H,
    position: 'relative',
  },
  canvas: { width: '100%', position: 'relative' },
  emptyInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyTxt: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  scrubLabel: {
    position: 'absolute',
    top: 2,
    alignItems: 'center',
  },
  scrubValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 15,
  },
  scrubDate: { ...typography.micro, color: colors.textSecondary, marginTop: 1 },
  pills: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  pillActive: { backgroundColor: colors.accent },
  pillTxt: { ...typography.pill, color: colors.textSecondary },
  pillTxtActive: { color: colors.accentInk },
});
