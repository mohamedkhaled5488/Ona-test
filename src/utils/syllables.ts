// A standard heuristic syllable counter — vowel-group counting with a silent-e
// adjustment. Good enough as a rhythm aid, not phonetically exact.
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;

  const vowels = 'aeiouy';
  let count = 0;
  let prevWasVowel = false;
  for (let i = 0; i < w.length; i++) {
    const isVowel = vowels.includes(w[i]);
    if (isVowel && !prevWasVowel) count++;
    prevWasVowel = isVowel;
  }
  if (w.endsWith('e') && count > 1) count--;
  return Math.max(count, 1);
}

export function countLineSyllables(line: string): number {
  return line
    .split(/\s+/)
    .filter(Boolean)
    .reduce((sum, word) => sum + countSyllables(word), 0);
}
