// One clock for the app. Code that needs "now" reads it from here (todayISO
// does), so tests can set the time without touching the machine's clock.
// In tests, src/test-utils/time.ts also fakes Date itself, so older code
// that still calls `new Date()` follows the same time.
//
// The trial and plan state never trust this clock alone: they use the
// server's time from the last answer (utils/entitlement.ts estimateServerNow),
// so moving the phone's clock can't extend a trial.
let override: (() => number) | null = null;

export function now(): number {
  return override ? override() : Date.now();
}

export function nowDate(): Date {
  return new Date(now());
}

// For tests: a fixed or moving time. resetClock() goes back to the real one.
export function setClock(next: number | (() => number)): void {
  override = typeof next === 'number' ? () => next : next;
}

export function resetClock(): void {
  override = null;
}
