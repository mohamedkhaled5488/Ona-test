// Demo mode's seed: the generated sample data, ready to store under the demo
// keys (each value brought to the current data shape).
import { normalizeField } from '../utils/localData';
import { DEMO_SEED, generateDemoData, localeCurrency, type DemoImages } from './generate';
import { demoImageUris } from './demoImages';

export { DEMO_SEED };
// Bump when the sample story changes; "Reset demo data" picks up the new one.
export const DEMO_SEED_VERSION = 1;

export interface DemoSeed {
  seed: string;
  sections: Record<string, Record<string, unknown>>;
  // The demo's own settings: the defaults, plus a few choices that show the
  // sample data at its best. Never the user's settings.
  settings: Record<string, unknown>;
}

// Deterministic for the same day and moment: today's sample times are capped
// at `now`, so nothing is in the future.
export function demoSeed(today: string, images: DemoImages = demoImageUris(), currency: string = localeCurrency(), now: number = Date.now()): DemoSeed {
  const raw = generateDemoData({ today, seed: DEMO_SEED, images, currency, now });
  const sections = Object.fromEntries(
    Object.entries(raw).map(([section, state]) => [section, Object.fromEntries(Object.entries(state).map(([k, v]) => [k, normalizeField(section, k, v)]))])
  );
  const settings = { planningInsights: { range: 'quarter', custom: null, tagIds: [], compare: false }, budgetCurrency: currency };
  return { seed: DEMO_SEED, sections, settings };
}
