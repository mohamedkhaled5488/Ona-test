import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { CartesianChart, useChartPressState, useChartTransformState } from 'victory-native';
import { Circle, DashPathEffect, Line as SkLine, Rect, scale as skiaScale } from '@shopify/react-native-skia';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { Caption } from './Typography';
import { colors } from '../theme';
import { zoneMeta } from '../data/feelingsWheel';
import { formatDisplayDate } from '../utils/date';
import type { FeelingZone } from '../types/sections';
import type { TrendPoint } from '../utils/feelingsStats';
import { themedStyles } from '../theme/runtime';

// The graph, rebuilt on Skia (via Victory Native XL) instead of react-native-svg
// + hand-rolled PanResponder math. GPU-rendered, so pinch/pan are genuinely
// continuous — driven by CartesianChart's own gesture-to-transform-matrix
// pipeline, not by re-deriving a day range on every touch-move and
// re-rendering React state, which is what the old implementation did.
//
// Data correctness: the x-domain is passed explicitly as [0, domainSlots-1]
// (every day 1..last-day-of-month, or every month of a year), completely
// independent of how many of those slots actually have a point. That is the
// fix for the recurring "graph stops early" bug — the previous SVG
// implementation positioned points by their index in the array of points
// that exist, which stretched sparse data to fill the full width. Here a
// point's screen position always comes from its fixed `domainIndex` against
// the fixed domain, via `xScale`/`yScale`, so a gap is a gap, not a
// compression.

// Feeling points carry a zone (which drives color and the tooltip label).
// Non-feeling series (habit completion, a quit journey) reuse this same chart
// by leaving zone off and setting color/radius/label per point instead.
export type PositionedPoint = Omit<TrendPoint, 'zone'> & {
  zone?: FeelingZone;
  domainIndex: number;
  color?: string;
  radius?: number; // 0 = draw the line through this point but no dot
  label?: string; // tooltip text; defaults to the zone label
  segments?: { value: number; color: string }[]; // stacked parts of a bar (variant 'bars')
};

function pointColor(p: PositionedPoint, fallback: string): string {
  return p.color ?? (p.zone ? zoneMeta(p.zone).accent : fallback);
}



// Axis labels are plain RN Text, not Skia-drawn text: CanvasKit's web build
// has no system font manager for matchFont to query, so Skia text silently
// renders nothing there (native has real system fonts and would work fine,
// but this keeps the two platforms visually identical and sidesteps
// bundling a font file just for tick labels).
function axisLabelIndices(domainSlots: number): number[] {
  if (domainSlots <= 7) return Array.from({ length: domainSlots }, (_, i) => i);
  const showEvery = domainSlots <= 31 ? 5 : Math.ceil(domainSlots / 8);
  const indices = new Set<number>([0, domainSlots - 1]);
  for (let i = 0; i < domainSlots; i += showEvery) indices.add(i);
  return Array.from(indices).sort((a, b) => a - b);
}

function contiguousRuns(points: PositionedPoint[]): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];
  points.forEach((p, i) => {
    if (current.length === 0 || p.domainIndex === points[i - 1].domainIndex + 1) {
      current.push(i);
    } else {
      runs.push(current);
      current = [i];
    }
  });
  if (current.length) runs.push(current);
  return runs;
}

export interface FeelingsGraphProps {
  points: PositionedPoint[];
  comparePoints?: PositionedPoint[];
  domainSlots: number;
  formatLabel: (domainIndex: number) => string;
  isolatedZone?: FeelingZone | null;
  onPointPress?: (point: PositionedPoint) => void;
  height?: number;
  yDomain?: [number, number]; // defaults to the -2..2 Pleasantness/Energy scale
  baselineAt?: number | null; // dashed reference line; null hides it
  lineColor?: string; // one color for the whole line instead of per-zone segments
  compareColor?: string;
  compareDots?: boolean; // dots on the overlay too, for sparse overlays that rarely connect
  emptyText?: string;
  variant?: 'line' | 'bars';
  // Shaded spans behind the data, in domain-index units (e.g. plateau periods).
  bands?: { start: number; end: number; color: string }[];
}

export function FeelingsGraph({
  points,
  comparePoints,
  domainSlots,
  formatLabel,
  isolatedZone,
  onPointPress,
  height = 200,
  yDomain = [-2, 2],
  baselineAt = 0,
  lineColor,
  compareColor = colors.inkSoft,
  compareDots = false,
  emptyText = 'No check-ins in this period yet.',
  variant = 'line',
  bands,
}: FeelingsGraphProps) {
  const { state: transformState } = useChartTransformState();
  const { state: pressState, isActive } = useChartPressState({ x: 0, y: { y: 0 } });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [axisLayout, setAxisLayout] = useState<{ bounds: { left: number; right: number }; xScale: (v: number) => number } | null>(null);
  const gestureRef = useRef({ startedAt: 0, startIndex: -1 });
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const onPointPressRef = useRef(onPointPress);
  onPointPressRef.current = onPointPress;

  useAnimatedReaction(
    () => pressState.matchedIndex.value,
    (idx) => runOnJS(setHoverIndex)(idx >= 0 ? idx : null)
  );

  useEffect(() => {
    if (isActive) {
      gestureRef.current = { startedAt: Date.now(), startIndex: hoverIndex ?? -1 };
      return;
    }
    // Released: a short press with little movement opens the day's detail
    // (a "tap"); a longer drag was scrubbing the tooltip and just clears it.
    const { startedAt, startIndex } = gestureRef.current;
    if (startedAt && Date.now() - startedAt < 350 && hoverIndex === startIndex && hoverIndex != null) {
      const point = pointsRef.current[hoverIndex];
      if (point) onPointPressRef.current?.(point);
    }
    gestureRef.current.startedAt = 0;
    setHoverIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const resetZoom = () => {
    transformState.matrix.value = skiaScale(1, 1);
  };

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Caption style={styles.emptyText}>{emptyText}</Caption>
      </View>
    );
  }

  const isDimmed = (zone?: FeelingZone) => !!isolatedZone && !!zone && isolatedZone !== zone;
  const chartData = points.map((p) => ({ x: p.domainIndex, y: p.score }));
  const hoverPoint = hoverIndex != null ? points[hoverIndex] : null;
  const chartHeight = height - 20; // leaves room for the label row below

  return (
    <View style={{ height }}>
      <View style={{ height: chartHeight }}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={['y']}
          domain={{ x: [0, Math.max(1, domainSlots - 1)], y: yDomain }}
          padding={{ left: 8, right: 8, top: 14, bottom: 6 }}
          // Keeps a point on the very edge of the domain (the first day, a
          // 100% completion, a top-of-scale feeling) from being clipped in half.
          domainPadding={{ left: 8, right: 8, top: 8, bottom: 8 }}
          transformState={transformState}
          transformConfig={{ pan: { enabled: true }, pinch: { enabled: true } }}
          chartPressState={pressState}
          gestureLongPressDelay={0}
          onChartBoundsChange={(b) => setAxisLayout((prev) => (prev?.bounds.left === b.left && prev?.bounds.right === b.right ? prev : { bounds: b, xScale: prev?.xScale ?? ((v: number) => v) }))}
          onScaleChange={(xs) => setAxisLayout((prev) => (prev ? { ...prev, xScale: xs as unknown as (v: number) => number } : prev))}
        >
        {({ points: chartPoints, chartBounds, yScale, xScale }) => {
          const pts = chartPoints.y;
          const runs = contiguousRuns(points);

          const step = (chartBounds.right - chartBounds.left) / Math.max(1, domainSlots - 1);
          return (
            <>
              {bands?.map((b, i) => (
                <Rect
                  key={`band-${i}`}
                  x={xScale(b.start) - step / 2}
                  y={chartBounds.top}
                  width={Math.max(step, xScale(b.end) - xScale(b.start) + step)}
                  height={chartBounds.bottom - chartBounds.top}
                  color={b.color}
                />
              ))}

              {baselineAt != null && (
                <SkLine p1={{ x: chartBounds.left, y: yScale(baselineAt) }} p2={{ x: chartBounds.right, y: yScale(baselineAt) }} color={colors.line} strokeWidth={1}>
                  <DashPathEffect intervals={[4, 4]} />
                </SkLine>
              )}

              {comparePoints?.map((p, i) => {
                if (i === 0) return null;
                const prev = comparePoints[i - 1];
                if (p.domainIndex - prev.domainIndex !== 1) return null;
                return (
                  <SkLine
                    key={`cmp-${p.key}`}
                    p1={{ x: xScale(prev.domainIndex), y: yScale(prev.score) }}
                    p2={{ x: xScale(p.domainIndex), y: yScale(p.score) }}
                    color={compareColor}
                    strokeWidth={2}
                    opacity={0.55}
                  >
                    <DashPathEffect intervals={[3, 4]} />
                  </SkLine>
                );
              })}

              {compareDots &&
                comparePoints?.map((p) => (
                  <Circle key={`cmpdot-${p.key}`} cx={xScale(p.domainIndex)} cy={yScale(p.score)} r={4} color={pointColor(p, compareColor)} opacity={0.9} />
                ))}

              {variant === 'bars' &&
                points.map((p) => {
                  // Stacked from the bottom of the y-domain; a point with no
                  // segments is one bar of its own score.
                  const w = Math.max(3, ((chartBounds.right - chartBounds.left) / Math.max(1, domainSlots)) * 0.7);
                  const x = xScale(p.domainIndex) - w / 2;
                  const segs = p.segments ?? [{ value: p.score, color: pointColor(p, colors.teal) }];
                  let base = yDomain[0];
                  return segs.map((seg, si) => {
                    if (seg.value <= 0) return null;
                    const top = yScale(base + seg.value);
                    const bottom = yScale(base);
                    base += seg.value;
                    return <Rect key={`bar-${p.key}-${si}`} x={x} y={top} width={w} height={Math.max(0, bottom - top)} color={seg.color} />;
                  });
                })}

              {variant === 'line' && runs.map((run, ri) =>
                run.slice(0, -1).map((idx, j) => {
                  const a = pts[idx];
                  const b = pts[run[j + 1]];
                  if (!a || !b) return null;
                  const dimmed = isDimmed(points[idx].zone);
                  return (
                    <SkLine
                      key={`seg-${ri}-${j}`}
                      p1={{ x: a.x ?? 0, y: a.y ?? 0 }}
                      p2={{ x: b.x ?? 0, y: b.y ?? 0 }}
                      color={dimmed ? colors.inkSoft : lineColor ?? pointColor(points[idx], colors.teal)}
                      strokeWidth={2.5}
                      opacity={dimmed ? 0.3 : 1}
                    />
                  );
                })
              )}

              {variant === 'line' && points.map((p, i) => {
                const pt = pts[i];
                const r = p.radius ?? 5;
                if (!pt || r <= 0) return null;
                const dimmed = isDimmed(p.zone);
                return <Circle key={p.key} cx={pt.x ?? 0} cy={pt.y ?? 0} r={r} color={dimmed ? colors.inkSoft : pointColor(p, colors.teal)} opacity={dimmed ? 0.35 : 1} />;
              })}
            </>
          );
        }}
        </CartesianChart>

        {hoverPoint && (
          <View pointerEvents="none" style={styles.tooltip}>
            <Caption style={styles.tooltipText}>{formatDisplayDate(hoverPoint.date)}</Caption>
            <Caption style={[styles.tooltipText, { color: pointColor(hoverPoint, colors.white) }]}>
              {hoverPoint.label ?? (hoverPoint.zone ? zoneMeta(hoverPoint.zone).label : '')}
            </Caption>
          </View>
        )}

        <Pressable onPress={resetZoom} style={styles.resetButton} hitSlop={8}>
          <Caption style={styles.resetButtonText}>Reset zoom</Caption>
        </Pressable>
      </View>

      {axisLayout && (
        <View style={styles.labelRow} pointerEvents="none">
          {axisLabelIndices(domainSlots).map((idx) => (
            <Caption
              key={idx}
              style={[
                styles.labelText,
                { position: 'absolute', left: axisLayout.xScale(idx), transform: [{ translateX: -10 }] },
              ]}
            >
              {formatLabel(idx)}
            </Caption>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.inkSoft,
  },
  tooltip: {
    position: 'absolute',
    top: 4,
    left: 8,
    backgroundColor: colors.ink,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 1,
  },
  tooltipText: {
    color: colors.white,
    fontSize: 11,
  },
  resetButton: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  resetButtonText: {
    color: colors.teal,
    fontSize: 11,
  },
  labelRow: {
    height: 20,
    position: 'relative',
  },
  labelText: {
    fontSize: 10,
    width: 20,
    textAlign: 'center',
  },
}));
