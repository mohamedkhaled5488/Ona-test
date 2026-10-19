// Regression: after opening the demo and leaving it, demo data showed up as
// the user's own (and, once synced, in their account on another phone).
// Cause: a section saved by an older version of Ona lacks fields added
// since; when loading a space, fields missing from the saved copy kept
// whatever was in memory, which was the demo's. IDs: docs/audit-report.md (FIX-13)
jest.setTimeout(20_000);
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SPACE_KEY, setDataSpace } from '../dataSpace';
import { __flushForTests, __resetForTests, startAppData, switchDataSpace } from '../dataSpaceController';
import { LOCAL_DATA } from '../localData';
import { storageKey } from '../localPersistence';
import { useClock, restoreClock } from '../../test-utils';

const storage = AsyncStorage as unknown as { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void>; clear: () => Promise<void> };
const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) ? v.length === 0 : typeof v === 'object' ? Object.keys(v as object).length === 0 : false);

// Data fields that hold something in the demo (so a leak would show).
function demoFilledFields(): [string, string][] {
  const out: [string, string][] = [];
  for (const [section, { store, keys }] of Object.entries(LOCAL_DATA)) {
    const state = store.getState() as Record<string, unknown>;
    for (const k of keys) if (!isEmpty(state[k])) out.push([section, k]);
  }
  return out;
}

beforeEach(async () => {
  await storage.clear();
  __resetForTests();
  setDataSpace('real');
  useClock('2026-10-18T12:00');
});
afterEach(() => restoreClock());

test('FIX-13a leaving the demo never leaves demo data in a section saved by an older version (missing newer fields)', async () => {
  // Your own data, saved by an older Ona: every section has a saved copy,
  // but only with its first field (the others were added later).
  for (const [section, { keys }] of Object.entries(LOCAL_DATA)) {
    await storage.setItem(storageKey(section, 'real'), JSON.stringify({ v: 1, state: { [keys[0]]: Array.isArray((LOCAL_DATA[section].store.getState() as Record<string, unknown>)[keys[0]]) ? [] : {} } }));
  }
  await startAppData(storage as never, false);
  await switchDataSpace('demo', storage as never);
  const filled = demoFilledFields();
  expect(filled.length).toBeGreaterThan(10); // the demo really holds data
  await switchDataSpace('real', storage as never);
  await __flushForTests();

  const leaked = filled.filter(([section, k]) => !isEmpty((LOCAL_DATA[section].store.getState() as Record<string, unknown>)[k])).map(([s, k]) => `${s}.${k}`);
  expect(leaked).toEqual([]);
  // ...and nothing of the demo was saved as your own data either.
  for (const section of Object.keys(LOCAL_DATA)) {
    const saved = JSON.parse((await storage.getItem(storageKey(section, 'real'))) ?? '{"state":{}}') as { state: Record<string, unknown> };
    const nonEmpty = Object.entries(saved.state).filter(([k, v]) => LOCAL_DATA[section].keys.includes(k) && !isEmpty(v)).map(([k]) => `${section}.${k}`);
    expect(nonEmpty).toEqual([]);
  }
  expect(await storage.getItem(SPACE_KEY)).toBe('real');
});

test('FIX-13b the same holds going into the demo: your own data never fills a demo field', async () => {
  const { useJournalStore } = require('../../store/useJournalStore') as typeof import('../../store/useJournalStore');
  await startAppData(storage as never, false);
  useJournalStore.setState({ entries: [{ id: 'mine', date: '2026-10-18', zone: 'calm', text: 'My own private words', tags: [], createdAt: '2026-10-18T09:00:00.000Z', updatedAt: '2026-10-18T09:00:00.000Z' }] } as never);
  await __flushForTests();
  // A demo copy saved by an older version, missing the journal's entries.
  await switchDataSpace('demo', storage as never);
  await switchDataSpace('real', storage as never);
  await storage.setItem(storageKey('journaling', 'demo'), JSON.stringify({ v: 1, state: {} }));
  await switchDataSpace('demo', storage as never);
  expect(JSON.stringify(useJournalStore.getState().entries)).not.toContain('My own private words');
});
