// The slide puzzle's rules (games/slidePuzzle.ts): every shuffled board can
// be solved, is never handed out already solved, and only a tile next to
// the gap moves. IDs: docs/test-cases/integration.md (SLIDE-*)
import fc from 'fast-check';
import { canSlide, isSolved, neighbours, shuffledBoard, slide, solvedBoard } from '../../games/slidePuzzle';

// An n×n sliding puzzle (odd n) is solvable exactly when its tiles have an
// even number of inversions.
function solvable(board: number[]): boolean {
  const tiles = board.filter((v) => v !== 0);
  let inversions = 0;
  for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) if (tiles[i] > tiles[j]) inversions++;
  return inversions % 2 === 0;
}
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31;
};

test('SLIDE-001 the solved board, and what counts as solved', () => {
  expect(solvedBoard(3)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 0]);
  expect(isSolved(solvedBoard(3))).toBe(true);
  expect(isSolved([1, 2, 3, 4, 5, 6, 7, 0, 8])).toBe(false);
});

test('SLIDE-002 neighbours at the corners, edges and middle', () => {
  expect(neighbours(0, 3).sort()).toEqual([1, 3]);
  expect(neighbours(4, 3).sort()).toEqual([1, 3, 5, 7]);
  expect(neighbours(5, 3).sort()).toEqual([2, 4, 8]);
  expect(neighbours(8, 3).sort()).toEqual([5, 7]);
});

test('SLIDE-003 only a tile next to the gap slides; anything else leaves the board as it was', () => {
  const b = [1, 2, 3, 4, 5, 6, 7, 0, 8];
  expect(canSlide(b, 8, 3)).toBe(true);
  expect(slide(b, 8, 3)).toEqual(solvedBoard(3));
  expect(canSlide(b, 0, 3)).toBe(false);
  expect(slide(b, 0, 3)).toBe(b);
  expect(slide(b, 7, 3)).toBe(b); // the gap itself
});

test('SLIDE-004 any shuffle is a real, solvable, unsolved board (property)', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 2 ** 30 }), fc.integer({ min: 0, max: 200 }), (seed, steps) => {
      const b = shuffledBoard(3, steps, seeded(seed));
      expect([...b].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(solvable(b)).toBe(true);
      expect(isSolved(b)).toBe(false);
    })
  );
});

test('SLIDE-005 a random source at its edges (0 and just under 1) still gives a legal board', () => {
  for (const r of [0, 0.999999]) {
    const b = shuffledBoard(3, 50, () => r);
    expect(solvable(b)).toBe(true);
    expect(isSolved(b)).toBe(false);
  }
});
