// logFeeling tells whoever listens (the letter offer) that a feeling was just
// logged. A feeling brought in from a section's older data, or one synced in
// from another phone, isn't logged here, so it never brings an offer.
type Listener = (feelingId: string) => void;
const listeners = new Set<Listener>();

export function onFeelingLogged(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function feelingLogged(feelingId: string): void {
  listeners.forEach((fn) => fn(feelingId));
}
