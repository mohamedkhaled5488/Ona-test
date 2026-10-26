// The doodle pad's strokes (games/doodle.ts): points join into SVG paths, a
// tap is a dot, tiny moves add nothing, and a very long session never holds
// more than MAX_POINTS (the oldest strokes give way, never the one being
// drawn). IDs: docs/test-cases/integration.md (DOODLE-*)
import fc from 'fast-check';
import { MAX_POINTS, extendStroke, pathOf, pointCount, startStroke, type Stroke } from '../../games/doodle';

test('DOODLE-001 a stroke becomes a path; a single tap is a dot', () => {
  let s = startStroke([], [10, 20], '#000', 4);
  expect(pathOf(s[0])).toBe('M 10 20 l 0.1 0');
  s = extendStroke(s, [30, 40]);
  s = extendStroke(s, [50, 45]);
  expect(pathOf(s[0])).toBe('M 10 20 L 30 40 L 50 45');
  expect(s[0]).toMatchObject({ color: '#000', width: 4 });
});

test('DOODLE-002 moves of under 2 points add nothing; extending with no stroke changes nothing', () => {
  const s = startStroke([], [10, 10], '#000', 4);
  expect(extendStroke(s, [11, 11])).toBe(s);
  expect(extendStroke([], [5, 5])).toEqual([]);
});

test('DOODLE-003 a new stroke keeps the earlier ones, with its own colour and width', () => {
  let s = startStroke([], [0, 0], 'a', 4);
  s = extendStroke(s, [10, 0]);
  s = startStroke(s, [0, 10], 'b', 10);
  expect(s.map((x) => [x.color, x.width, x.points.length])).toEqual([['a', 4, 2], ['b', 10, 1]]);
});

test('DOODLE-004 never more than MAX_POINTS, however long it goes on; the stroke being drawn stays (property)', () => {
  fc.assert(
    fc.property(fc.array(fc.integer({ min: 1, max: 900 }), { minLength: 1, maxLength: 12 }), (lengths) => {
      let s: Stroke[] = [];
      lengths.forEach((n, k) => {
        s = startStroke(s, [0, k * 3], String(k), 4);
        for (let i = 1; i < n; i++) s = extendStroke(s, [i * 3, k * 3]);
      });
      expect(pointCount(s) <= MAX_POINTS || s.length === 1).toBe(true);
      expect(s[s.length - 1].color).toBe(String(lengths.length - 1));
    }),
    { numRuns: 40 }
  );
});
