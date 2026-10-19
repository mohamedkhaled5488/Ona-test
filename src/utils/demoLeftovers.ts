// Cleans up demo items that leaked into the user's own data (FIX-13/14:
// before those fixes, leaving the demo could save or sync demo items as the
// user's own). Every demo item's id contains "-demo-" (e.g. "task-demo-12"),
// and the user's own ids never can (genId: "<prefix>-<time>-<random>"), so
// these are removed with certainty. Removing them locally also makes the
// next sync delete them from the account, on every phone.
import { getDataSpace } from './dataSpace';
import { LOCAL_DATA } from './localData';

export const isDemoId = (id: unknown): boolean => typeof id === 'string' && id.includes('-demo-');

const isDemoItem = (v: unknown) => !!v && typeof v === 'object' && isDemoId((v as { id?: unknown }).id);

// A section field without its demo items (lists of items only; anything
// else is returned as it is).
export function withoutDemoItems<T>(value: T): T {
  if (!Array.isArray(value) || !value.some(isDemoItem)) return value;
  return value.filter((v) => !isDemoItem(v)) as T;
}

// Removes demo items from every section of the user's own data. Does
// nothing in the demo itself. Returns how many were removed.
export function purgeDemoLeftovers(): number {
  if (getDataSpace() !== 'real') return 0;
  let removed = 0;
  for (const { store, keys } of Object.values(LOCAL_DATA)) {
    const state = store.getState() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of keys) {
      const next = withoutDemoItems(state[k]);
      if (next !== state[k]) {
        removed += (state[k] as unknown[]).length - (next as unknown[]).length;
        patch[k] = next;
      }
    }
    if (Object.keys(patch).length) store.setState(patch);
  }
  return removed;
}
