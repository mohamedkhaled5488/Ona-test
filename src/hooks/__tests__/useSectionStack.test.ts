// A section's own pages as one history (hooks/useSectionStack.ts): opened
// straight at an item, Back leaves to where the person came from (never
// through a list they didn't see); the page's own "‹ list" link goes to its
// parent. IDs: docs/test-cases/integration.md (NAV-STACK-*)
import { act, renderHook } from '@testing-library/react-native';
import { useSectionStack } from '../useSectionStack';

type S = { kind: 'list' } | { kind: 'item'; id: string } | { kind: 'day'; id: string; date: string };
const ROOT: S = { kind: 'list' };
const parentOf = (s: S): S | undefined => (s.kind === 'day' ? { kind: 'item', id: s.id } : s.kind === 'item' ? ROOT : undefined);

test('NAV-STACK-001 opened on the list: pages stack up, Back steps one at a time, then leaves the screen', async () => {
  const { result } = await renderHook(() => useSectionStack<S>(ROOT, [], parentOf));
  expect(result.current.stepBack).toBeUndefined(); // Back leaves the screen
  await act(async () => result.current.push({ kind: 'item', id: 'a' }));
  await act(async () => result.current.push({ kind: 'day', id: 'a', date: '2026-10-21' }));
  await act(async () => result.current.stepBack!());
  expect(result.current.current).toEqual({ kind: 'item', id: 'a' });
  await act(async () => result.current.stepBack!());
  expect(result.current.current).toEqual(ROOT);
  expect(result.current.stepBack).toBeUndefined();
});

test('NAV-STACK-002 opened straight at a day (from Recap, a link): Back leaves at once; the page\'s "‹" link goes day → item → list', async () => {
  const { result } = await renderHook(() => useSectionStack<S>(ROOT, [{ kind: 'day', id: 'a', date: '2026-10-21' }], parentOf));
  expect(result.current.stack).toHaveLength(1); // no unseen list behind it
  expect(result.current.stepBack).toBeUndefined();
  await act(async () => result.current.up());
  expect(result.current.current).toEqual({ kind: 'item', id: 'a' });
  await act(async () => result.current.up());
  expect(result.current.current).toEqual(ROOT);
  await act(async () => result.current.up());
  expect(result.current.current).toEqual(ROOT); // the list is the top
});

test('NAV-STACK-003 the "‹" link after pushing pages is just one step back, the same as Back', async () => {
  const { result } = await renderHook(() => useSectionStack<S>(ROOT, [{ kind: 'item', id: 'a' }], parentOf));
  await act(async () => result.current.push({ kind: 'day', id: 'a', date: '2026-10-21' }));
  await act(async () => result.current.up());
  expect(result.current.stack).toEqual([{ kind: 'item', id: 'a' }]);
});
