// Realistic data for real-account tests: about eight weeks of every section,
// from the Demo mode generator, with its ids re-marked ("-seed-" for
// "-demo-") so Ona treats it as ordinary data, not leaked sample data.
import { generateDemoData } from '../demo/generate';
import { normalizeField } from '../utils/localData';

export function seededSections(today: string, seed = 'ona-real-account-1'): Record<string, Record<string, unknown>> {
  const images = { sketchEarly: 'file:///seed/sketch-early.png', sketchLatest: 'file:///seed/sketch-latest.png', bookPage: 'file:///seed/book-page.png', practiceNotes: 'file:///seed/practice-notes.png' };
  const raw = generateDemoData({ today, seed, images, currency: 'EUR' });
  const plain = JSON.parse(JSON.stringify(raw).split('-demo-').join('-seed-')) as Record<string, Record<string, unknown>>;
  return Object.fromEntries(Object.entries(plain).map(([section, state]) => [section, Object.fromEntries(Object.entries(state).map(([k, v]) => [k, normalizeField(section, k, v)]))]));
}
