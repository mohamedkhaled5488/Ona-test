import type { Difficulty, GameId } from '../types/sections';

export const gameOrder: GameId[] = ['memory', 'reaction', 'math', 'word'];

export interface GameMeta {
  name: string;
  description: string;
  icon: string;
  accent: string;
  unit: string;
  betterWhen: 'lower' | 'higher';
}

export const gameMeta: Record<GameId, GameMeta> = {
  memory: {
    name: 'Memory Match',
    description: 'Flip and match pairs',
    icon: 'grid-outline',
    accent: '#5B8FC7',
    unit: 'moves',
    betterWhen: 'lower',
  },
  reaction: {
    name: 'Reaction Time',
    description: 'Tap the moment you see the signal',
    icon: 'flash-outline',
    accent: '#D98F4E',
    unit: 'ms',
    betterWhen: 'lower',
  },
  math: {
    name: 'Quick Math',
    description: 'Solve as many as you can, timed',
    icon: 'calculator-outline',
    accent: '#7FAE68',
    unit: 'correct',
    betterWhen: 'higher',
  },
  word: {
    name: 'Word Recall',
    description: 'Memorize a list, then recall it',
    icon: 'text-outline',
    accent: '#B072A0',
    unit: 'words',
    betterWhen: 'higher',
  },
};

export const memoryPairsByDifficulty: Record<Difficulty, number> = { easy: 6, medium: 8, hard: 10 };
export const reactionRoundsByDifficulty: Record<Difficulty, number> = { easy: 1, medium: 3, hard: 5 };
export const mathSecondsByDifficulty: Record<Difficulty, number> = { easy: 45, medium: 30, hard: 20 };
export const wordListByDifficulty: Record<Difficulty, string[]> = {
  easy: ['River', 'Lamp', 'Cloud', 'Bridge', 'Kettle'],
  medium: ['River', 'Lamp', 'Cloud', 'Bridge', 'Kettle', 'Ladder', 'Whistle', 'Anchor'],
  hard: ['River', 'Lamp', 'Cloud', 'Bridge', 'Kettle', 'Ladder', 'Whistle', 'Anchor', 'Compass', 'Lantern', 'Meadow', 'Thimble'],
};

export const difficultyLabels: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
export const difficultyOrder: Difficulty[] = ['easy', 'medium', 'hard'];
