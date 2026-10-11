import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Difficulty, GameId, GameResult } from '../types/sections';
import { genId } from '../utils/id';

interface MindGamesState {
  results: GameResult[];
  addResult: (gameId: GameId, difficulty: Difficulty, score: number) => void;
}

export const useMindGamesStore = create<MindGamesState>()(
  immer((set) => ({
    results: [],
    addResult: (gameId, difficulty, score) =>
      set((state) => {
        state.results.push({ id: genId('result'), gameId, difficulty, score, playedAt: new Date().toISOString() });
      }),
  }))
);

export function personalBest(
  results: GameResult[],
  gameId: GameId,
  difficulty: Difficulty,
  betterWhen: 'lower' | 'higher'
): number | undefined {
  const scores = results.filter((r) => r.gameId === gameId && r.difficulty === difficulty).map((r) => r.score);
  if (scores.length === 0) return undefined;
  return betterWhen === 'lower' ? Math.min(...scores) : Math.max(...scores);
}
