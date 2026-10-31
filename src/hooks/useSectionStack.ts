import { useState } from 'react';

// A section's own pages (a list, an item, a detail) as one history, so Back
// always goes exactly one step (docs/navigation.md):
// - Opened from inside the section, each page is pushed on the last.
// - Opened straight at an item from somewhere else (a Recap link, another
//   section, Discover), the pages it opens at are the whole history: Back
//   returns to where the person came from, never through a list they didn't
//   see. (Found on a phone, 2026-10-29: Back went to a list first.)
// - A page's own "‹ list" link ("up") goes one page back, or, on the first
//   page, to that page's parent (a habit's day → the habit → the list).
export function useSectionStack<S extends { kind: string }>(root: S, opened: S[] = [], parentOf: (s: S) => S | undefined = () => undefined) {
  const [stack, setStack] = useState<S[]>(() => (opened.length ? opened : [root]));
  const current = stack[stack.length - 1];
  const push = (s: S) => setStack((prev) => [...prev, s]);
  const pop = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  const up = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : [parentOf(prev[0]) ?? root]));
  return {
    stack,
    setStack,
    current,
    push,
    // For useBackHandler: steps back within this visit; at its first page,
    // undefined, so Back leaves the screen.
    stepBack: stack.length > 1 ? pop : undefined,
    up,
  };
}
