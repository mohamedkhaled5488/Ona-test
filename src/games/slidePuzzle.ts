// The slide puzzle in Quit's craving toolkit: tiles 1..n²-1 and one gap (0)
// on an n×n board. Shuffled only by legal slides from the solved board, so
// every puzzle can be solved. No move count, no clock.

export type Board = number[];

export function solvedBoard(size: number): Board {
  return [...Array.from({ length: size * size - 1 }, (_, i) => i + 1), 0];
}

export const isSolved = (board: Board) => board.every((v, i) => v === (i === board.length - 1 ? 0 : i + 1));

// The cells next to `index` (up, down, left, right).
export function neighbours(index: number, size: number): number[] {
  const r = Math.floor(index / size);
  const c = index % size;
  const out: number[] = [];
  if (r > 0) out.push(index - size);
  if (r < size - 1) out.push(index + size);
  if (c > 0) out.push(index - 1);
  if (c < size - 1) out.push(index + 1);
  return out;
}

export const canSlide = (board: Board, index: number, size: number) => neighbours(index, size).includes(board.indexOf(0));

// Slides the tile at `index` into the gap, if it's next to it; otherwise the
// same board.
export function slide(board: Board, index: number, size: number): Board {
  if (!canSlide(board, index, size)) return board;
  const gap = board.indexOf(0);
  const next = [...board];
  [next[gap], next[index]] = [next[index], next[gap]];
  return next;
}

// `steps` legal slides from solved, never straight back, and never left
// solved. `random` returns 0..1 (Math.random in the app; seeded in tests).
export function shuffledBoard(size: number, steps = size * size * 12, random: () => number = Math.random): Board {
  let board = solvedBoard(size);
  let previousGap = -1;
  for (let i = 0; i < steps || isSolved(board); i++) {
    const gap = board.indexOf(0);
    const options = neighbours(gap, size).filter((n) => n !== previousGap);
    const pick = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
    previousGap = gap;
    board = slide(board, pick, size);
  }
  return board;
}
