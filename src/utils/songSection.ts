// Maps a structure label like "Verse 2 (16 bars)" or "Final Chorus" to the
// base part name used as a key into a SongType's partTips.
const knownParts = ['Pre-Chorus', 'Chorus', 'Verse', 'Bridge', 'Hook', 'Intro', 'Outro'];

export function basePartName(label: string): string {
  return knownParts.find((part) => label.includes(part)) ?? label;
}
