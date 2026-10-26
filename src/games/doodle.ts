// The doodle pad in Quit's craving toolkit: strokes as points, drawn as SVG
// paths. Nothing is saved. A long session can't grow without end: past
// MAX_POINTS the oldest strokes give way (the page doesn't fill up and stop).

export interface Stroke {
  color: string;
  width: number;
  points: [number, number][];
}

export const MAX_POINTS = 4000;
// Closer than this to the last point isn't a new point (fewer points, same
// line).
const MIN_STEP = 2;

export const startStroke = (strokes: Stroke[], at: [number, number], color: string, width: number): Stroke[] => trim([...strokes, { color, width, points: [at] }]);

export function extendStroke(strokes: Stroke[], at: [number, number]): Stroke[] {
  const last = strokes[strokes.length - 1];
  if (!last) return strokes;
  const [px, py] = last.points[last.points.length - 1];
  if (Math.hypot(at[0] - px, at[1] - py) < MIN_STEP) return strokes;
  return trim([...strokes.slice(0, -1), { ...last, points: [...last.points, at] }]);
}

export const pointCount = (strokes: Stroke[]) => strokes.reduce((n, s) => n + s.points.length, 0);

// Drops the oldest strokes until the total fits (never the one being drawn).
function trim(strokes: Stroke[]): Stroke[] {
  let out = strokes;
  while (out.length > 1 && pointCount(out) > MAX_POINTS) out = out.slice(1);
  return out;
}

// "M x y L x y …"; a single tap draws a dot.
export function pathOf(stroke: Stroke): string {
  const [first, ...rest] = stroke.points;
  if (!first) return '';
  if (!rest.length) return `M ${first[0]} ${first[1]} l 0.1 0`;
  return `M ${first[0]} ${first[1]} ` + rest.map(([x, y]) => `L ${x} ${y}`).join(' ');
}
