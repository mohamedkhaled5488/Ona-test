// Memory Match's cards: shared by Mind Games and the gentle version in
// Quit's craving toolkit (no move count, no result there).
export const memoryIcons = ['leaf', 'star', 'heart', 'moon', 'sunny', 'flower', 'paw', 'rocket', 'musical-notes', 'diamond'];

export interface MemoryCard {
  key: string;
  icon: string;
  matched: boolean;
}

// A shuffled deck of `pairCount` pairs.
export function memoryDeck(pairCount: number): MemoryCard[] {
  const icons = memoryIcons.slice(0, pairCount);
  return [...icons, ...icons].map((icon, i) => ({ key: `${icon}-${i}`, icon, matched: false })).sort(() => Math.random() - 0.5);
}
