// A small, local, offline starter set for the rhyme helper — not an
// exhaustive dictionary or an external API. Grouped by ending sound.
const rhymeGroups: Record<string, string[]> = {
  ay: ['day', 'way', 'say', 'play', 'stay', 'away', 'today', 'may', 'pray', 'stray', 'gray', 'okay'],
  ight: ['night', 'light', 'right', 'fight', 'sight', 'bright', 'flight', 'tonight', 'might', 'tight'],
  ove: ['love', 'above', 'dove', 'enough', 'shove'],
  art: ['heart', 'start', 'apart', 'part', 'smart', 'dark', 'spark'],
  ime: ['time', 'rhyme', 'climb', 'mine', 'sublime', 'sign', 'line', 'design'],
  eel: ['feel', 'real', 'heal', 'steal', 'reveal', 'deal', 'seal'],
  own: ['down', 'town', 'crown', 'around', 'sound', 'found', 'ground', 'now', 'how'],
  ain: ['rain', 'pain', 'again', 'chain', 'remain', 'brain', 'gain', 'explain'],
  one: ['alone', 'known', 'shown', 'home', 'own', 'grown', 'gone'],
  ind: ['mind', 'find', 'kind', 'blind', 'behind', 'remind'],
  ace: ['face', 'place', 'space', 'grace', 'chase', 'embrace'],
  ide: ['side', 'wide', 'ride', 'tide', 'inside', 'pride', 'guide'],
  ee: ['free', 'see', 'be', 'me', 'we', 'need', 'believe', 'leave'],
  old: ['gold', 'hold', 'cold', 'told', 'unfold', 'bold'],
};

export function findRhymes(word: string): string[] {
  const target = word.toLowerCase().trim().replace(/[^a-z]/g, '');
  if (!target) return [];

  for (const [key, group] of Object.entries(rhymeGroups)) {
    if (target.endsWith(key) || group.includes(target)) {
      return group.filter((w) => w !== target);
    }
  }

  const suffix = target.slice(-2);
  const all = Object.values(rhymeGroups).flat();
  return Array.from(new Set(all.filter((w) => w.endsWith(suffix) && w !== target))).slice(0, 8);
}
