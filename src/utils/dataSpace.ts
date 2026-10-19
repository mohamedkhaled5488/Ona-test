// Which data the app is showing: the user's own ('real') or Demo mode's
// sample data ('demo'). This is the ONE place that decides which storage
// keys are used. Every store loads and saves through keys from here, so the
// two never share a key. Nothing in here imports a store (no cycles).
//
// Outward effects (sync, account, purchases, notifications, analytics) check
// isDemo() at their single choke point and do nothing in demo.

export type DataSpace = 'real' | 'demo';

let current: DataSpace = 'real';
const listeners = new Set<(space: DataSpace) => void>();

export const isDemo = (): boolean => current === 'demo';
export const getDataSpace = (): DataSpace => current;

// Remembers the space across restarts. Lives outside both spaces.
export const SPACE_KEY = 'ona.space';
// Demo's own bookkeeping: that it was set up, with which seed, and what the
// user has already seen. Its presence is what makes demo data "consistent".
export const DEMO_META_KEY = 'ona.demo.meta';

const DEMO_PREFIX = 'ona.demo.';

// The storage key for `base` in the current space. Real keys are unchanged
// (existing data stays where it is); demo keys get their own prefix.
export function spaceKey(base: string, space: DataSpace = current): string {
  if (space === 'real') return base;
  return DEMO_PREFIX + base.replace(/^ona[.:]/, '');
}

export const isDemoKey = (key: string) => key.startsWith(DEMO_PREFIX) || key === DEMO_META_KEY;

// Only the data-space controller calls this, after saving and stopping
// everything in the old space.
export function setDataSpace(space: DataSpace): void {
  if (space === current) return;
  current = space;
  listeners.forEach((fn) => fn(space));
}

// True while the data-space controller is loading a space: the stores may
// still hold the other space's data even though the space has changed, so
// nothing may sync until it's done.
let switching = false;
export const isSwitchingDataSpace = (): boolean => switching;
export function setSwitchingDataSpace(on: boolean): void {
  switching = on;
}

export function onDataSpaceChange(fn: (space: DataSpace) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Thrown by anything that must never run in demo (sync, account changes).
export class DemoModeError extends Error {
  constructor(what = 'This') {
    super(`${what} isn't available in Demo mode. Exit the demo to use your account.`);
    this.name = 'DemoModeError';
  }
}

export const DEMO_UNAVAILABLE = "That isn't available in Demo mode. Exit the demo to use your account.";
