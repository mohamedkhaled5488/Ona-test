// Journaling, as a person uses it: the calendar and past entries, search
// (Arabic too), streak and word counts, "On this day", opening an entry, and
// the PIN lock actually hiding the writing, including after leaving the app.
// IDs: docs/test-cases/journaling.md
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));
// The lock screen asks the phone about fingerprint/face unlock; no such
// hardware here, so it offers the PIN only.
jest.mock('../../utils/pinLock', () => ({
  ...jest.requireActual('../../utils/pinLock'),
  deviceAuthInfo: jest.fn(async () => ({ available: false, enrolled: false, biometricLabel: null })),
  authenticateWithDevice: jest.fn(async () => false),
  hasPin: jest.fn(async () => true),
}));

import React from 'react';
import { Text } from 'react-native';
import { act, screen } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import { renderScreen, renderWithApp } from '../../test-utils/render';
import { JournalingScreen } from '../JournalingScreen';
import { useJournalStore } from '../../store/useJournalStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useLockStore, RELOCK_AFTER_MS } from '../../store/useLockStore';
import { LockGate } from '../../components/LockScreen';
import { startAppData, __flushForTests } from '../../utils/dataSpaceController';
import { hydrateLocalData } from '../../utils/localPersistence';

// Whole screens render slowly on a busy machine (e.g. with Docker running).
jest.setTimeout(20_000);

beforeEach(async () => {
  await resetAll();
  useLockStore.getState().lockAll();
  useClock('2026-10-18T20:00');
});
afterEach(() => restoreClock());

const write = (date: string, text: string, tags: string[] = [], zone: 'calm' | 'tense' | 'okay' = 'calm') => useJournalStore.getState().upsertEntry(date, zone, text, tags);

describe('JRN-C: Journaling screen', () => {
  test('JRN-C-001 nothing written yet: today invites you to start, and opens the writing page', async () => {
    const { user } = await renderScreen('journaling', JournalingScreen);
    expect(screen.getByText('Nothing written for this day yet.')).toBeTruthy();
    expect(screen.getByText('No entries found.')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Start writing' }));
    expect(await screen.findByText('Opened: journalWrite {"date":"2026-10-18"}')).toBeTruthy();
  });

  test('JRN-C-002 entries show in the past list, newest first, with tags; streak and words add up', async () => {
    write('2026-10-16', 'Quiet morning walk', ['walk']);
    write('2026-10-17', 'Long day at work', ['work']);
    write('2026-10-18', 'Dinner with friends tonight', ['friends']);
    await renderScreen('journaling', JournalingScreen);
    const texts = screen.getAllByText(/Quiet morning walk|Long day at work|Dinner with friends tonight/).map((n) => n.props.children);
    expect(texts.slice(-3)).toEqual(['Dinner with friends tonight', 'Long day at work', 'Quiet morning walk']);
    expect(screen.getByText('#work')).toBeTruthy();
    expect(screen.getByText('3 days')).toBeTruthy(); // streak
    // Words written: 3 + 4 + 4.
    const wordsTile = screen.getByText('Words written').parent!;
    expect(wordsTile.children.some((c) => typeof c !== 'string' && JSON.stringify(c.props?.children) === '11')).toBe(true);
  });

  test('JRN-C-003 search finds words and tags, including Arabic', async () => {
    write('2026-10-10', 'كان يومًا هادئًا في البيت', ['عائلة']);
    write('2026-10-11', 'Gym then coffee', ['health']);
    const { user } = await renderScreen('journaling', JournalingScreen);
    await user.type(screen.getByPlaceholderText('Search entries or tags...'), 'هادئ');
    expect(screen.getByText('Search results')).toBeTruthy();
    expect(screen.getByText('كان يومًا هادئًا في البيت')).toBeTruthy();
    expect(screen.queryByText('Gym then coffee')).toBeNull();
    await user.clear(screen.getByPlaceholderText('Search entries or tags...'));
    await user.type(screen.getByPlaceholderText('Search entries or tags...'), 'health');
    expect(screen.getByText('Gym then coffee')).toBeTruthy();
  });

  test('JRN-C-004 "On this day" shows what you wrote on this date before', async () => {
    write('2025-10-18', 'A year ago I started this journal');
    await renderScreen('journaling', JournalingScreen);
    expect(screen.getByText('On this day')).toBeTruthy();
    expect(screen.getAllByText('A year ago I started this journal').length).toBeGreaterThan(0);
  });

  test('JRN-C-005 opening a past entry opens its own date', async () => {
    write('2026-10-12', 'Sunday reset');
    const { user } = await renderScreen('journaling', JournalingScreen);
    await user.press(screen.getAllByText('Sunday reset').slice(-1)[0]);
    expect(await screen.findByText('Opened: journalWrite {"date":"2026-10-12"}')).toBeTruthy();
  });

  test('JRN-C-006 the lock row says whether the PIN lock is on', async () => {
    useSettingsStore.getState().set('journalLock', true);
    await renderScreen('journaling', JournalingScreen);
    expect(screen.getByText('Lock Journaling with a PIN')).toBeTruthy();
    expect(screen.getByText('On')).toBeTruthy();
  });

  test('JRN-C-007 entries survive closing and reopening the app', async () => {
    await startAppData(undefined, false);
    write('2026-10-18', 'Saved before closing', ['test']);
    await __flushForTests();
    useJournalStore.setState({ entries: [] });
    await hydrateLocalData(undefined, false);
    expect(useJournalStore.getState().entries[0]).toMatchObject({ date: '2026-10-18', text: 'Saved before closing', tags: ['test'] });
  });
});

describe('JRN-LOCK: the PIN lock keeps the writing hidden', () => {
  const Secret = () => <Text>My private entry</Text>;

  test('JRN-LOCK-001 with the lock on, the writing is not shown until unlocked', async () => {
    useSettingsStore.getState().set('journalLock', true);
    await renderWithApp(<LockGate scope="journal"><Secret /></LockGate>);
    expect(screen.queryByText('My private entry')).toBeNull();
    expect(screen.getByText('Forgot PIN?')).toBeTruthy();
    await act(async () => useLockStore.getState().unlock('journal'));
    expect(screen.getByText('My private entry')).toBeTruthy();
  });

  test('JRN-LOCK-002 leaving the app for 30 seconds or more locks it again; a quick switch does not', async () => {
    useSettingsStore.getState().set('journalLock', true);
    useLockStore.getState().unlock('journal');
    await renderWithApp(<LockGate scope="journal"><Secret /></LockGate>);
    expect(screen.getByText('My private entry')).toBeTruthy();
    await act(async () => {
      useLockStore.getState().markBackgrounded(1_000);
      useLockStore.getState().markForegrounded(1_000 + RELOCK_AFTER_MS - 1);
    });
    expect(screen.getByText('My private entry')).toBeTruthy();
    await act(async () => {
      useLockStore.getState().markBackgrounded(50_000);
      useLockStore.getState().markForegrounded(50_000 + RELOCK_AFTER_MS);
    });
    expect(screen.queryByText('My private entry')).toBeNull();
  });

  test('JRN-LOCK-003 with the lock off, the writing shows straight away', async () => {
    await renderWithApp(<LockGate scope="journal"><Secret /></LockGate>);
    expect(screen.getByText('My private entry')).toBeTruthy();
  });
});
