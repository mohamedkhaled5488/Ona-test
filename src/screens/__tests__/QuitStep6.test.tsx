// Craving toolkit, step 6: what the earlier steps' tests didn't cover. A call
// or a trip to the background mid-tool; Ona killed mid-tool and opened again;
// no connection at all; a second phone; analytics; Demo mode; and a long
// session (nothing piles up, no timer left running).
// IDs: docs/test-cases/integration.md (QUIT-6-*)
jest.mock('../../utils/notifications', () => ({
  cancelReminders: jest.fn(async () => {}),
  scheduleReminder: jest.fn(async () => []),
  scheduleTaskReminders: jest.fn(async () => []),
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Light: 'light' } }));
jest.setTimeout(60_000);

import { AppState } from 'react-native';
import { act, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resetAll, useClock, restoreClock, makeQuitHabit, makeTrack } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { QuitHabitScreen, CRAVING_COPY } from '../QuitHabitScreen';
import { TOOLKIT_COPY } from '../../quit/toolkit';
import { TOOL_VIEW_COPY } from '../../quit/toolContent';
import { isLayerActive, stopAllLayers } from '../../utils/audioEngine';
import { setDataSpace, getDataSpace } from '../../utils/dataSpace';
import { __flushForTests, __resetForTests, startAppData, switchDataSpace } from '../../utils/dataSpaceController';
import { setAnalyticsTransport, track } from '../../utils/analytics';
import { EMPTY_SYNC_STATE, syncOnce, type PushedRow, type RemoteRow, type SyncServer, type SyncState } from '../../sync/engine';
import { localData } from '../../sync/syncController';
import { stableStringify } from '../../sync/records';
import type { QuitHabit } from '../../types/sections';

const storage = AsyncStorage as unknown as { clear: () => Promise<void> };
let clock: ReturnType<typeof useClock>;
const st = () => useQuitHabitsStore.getState();
const HABIT = () =>
  makeQuitHabit({
    id: 'q1',
    name: 'Vaping',
    toolkit: { pinned: ['tea'], hidden: [], custom: [{ id: 'tea', name: 'Make tea', minutes: 5 }] },
    plans: [{ id: 'p1', when: "it's evening", timeOfDay: 'evening', toolId: 'tea' }],
  });
function oneHabit(over: Partial<QuitHabit> = {}) {
  useQuitHabitsStore.setState({ habits: [{ ...HABIT(), ...over }], tracks: [makeTrack({ id: 't1', quitHabitId: 'q1', startDate: '2026-10-15' })], feelingEntries: [], slips: [], cravingSessions: [] } as never);
}
async function openTool(title: string) {
  const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
  await r.user.press(await screen.findByText("I'm craving it"));
  await r.user.press(screen.getByText(CRAVING_COPY.skip));
  await r.user.press(screen.getByText(TOOLKIT_COPY.seeAll));
  await r.user.press(screen.getAllByLabelText(title).at(-1)!);
  return r;
}
// What the app does when it moves to the background and back (the listeners
// the app registered, in order).
const appState = (state: 'active' | 'background' | 'inactive') => {
  for (const [event, fn] of (AppState.addEventListener as unknown as jest.Mock).mock.calls) if (event === 'change') (fn as (s: string) => void)(state);
};

beforeEach(async () => {
  await resetAll();
  clock = useClock('2026-10-27T20:00');
});
afterEach(() => {
  stopAllLayers('quit');
  setAnalyticsTransport(null);
  restoreClock();
});

describe('interruptions', () => {
  test('QUIT-6-001 a phone call in the middle of "Delay it": back after 3 minutes, the ride timer and the countdown are right, nothing restarted', async () => {
    oneHabit();
    await openTool('Delay it');
    expect(screen.getByText('10:00')).toBeTruthy();
    await act(async () => {
      appState('inactive'); // the call comes in
      clock.advance(3 * 60_000); // JS timers don't run meanwhile; only the clock moves
      appState('active');
    });
    expect(await screen.findByText(/^(7:00|6:5\d)$/)).toBeTruthy(); // 3 minutes gone, give or take the test's own time
    expect(screen.getByText(/Riding it out: 3:0\d/)).toBeTruthy();
    expect(st().cravingSessions).toHaveLength(1);
    expect(st().cravingSessions[0].tools.map((t) => t.toolId)).toEqual(['delayIt']);
  });

  test('QUIT-6-002 a calm sound playing when Ona goes to the background: still there when it comes back, and the timer right', async () => {
    oneHabit();
    const r = await openTool('Calm sounds');
    await r.user.press(screen.getByLabelText('Rain'));
    await act(async () => {
      appState('background');
      clock.advance(5 * 60_000);
      appState('active');
    });
    expect(isLayerActive('rain', 'quit')).toBe(true);
    expect(await screen.findByText(/Riding it out: 5:0\d/)).toBeTruthy();
  });

  test('QUIT-6-003 Ona killed in the middle of your own tool (with its timer): opened again, the same craving, the time right, the tool\'s countdown carrying on', async () => {
    await storage.clear();
    __resetForTests();
    setDataSpace('real');
    await startAppData(storage as never, false);
    oneHabit();
    const first = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
    await first.user.press(await screen.findByText("I'm craving it"));
    await first.user.press(screen.getByText(CRAVING_COPY.skip));
    await first.user.press(screen.getByLabelText('Make tea')); // the evening plan, offered first
    await __flushForTests();
    first.unmount?.();
    // Killed: nothing in memory survives; only what was saved.
    __resetForTests();
    useQuitHabitsStore.setState({ habits: [], tracks: [], feelingEntries: [], slips: [], cravingSessions: [] } as never);
    clock.advance(2 * 60_000 + 10_000);
    await startAppData(storage as never, false);
    expect(st().cravingSessions).toHaveLength(1);
    const again = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
    await again.user.press(await screen.findByText(/Riding it out: 2:1\d. Continue/));
    await again.user.press(screen.getByLabelText('Make tea'));
    expect(await screen.findByText(/^2:5\d$/)).toBeTruthy(); // 5 minutes from when it was picked
    expect(st().cravingSessions[0].tools.map((t) => t.toolId)).toEqual(['tea']);
  });
});

test('QUIT-6-010 no connection at all: the whole craving works and is recorded, and nothing is fetched', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch' as never).mockImplementation((() => Promise.reject(new Error('Network request failed'))) as never);
  try {
    oneHabit();
    const r = await openTool('Grounding: 5-4-3-2-1');
    for (let i = 0; i < 4; i++) await r.user.press(screen.getByText(TOOL_VIEW_COPY.next));
    await r.user.press(screen.getByText(TOOL_VIEW_COPY.done));
    await r.user.press(screen.getByLabelText('3 out of 10'));
    await r.user.press(screen.getByText(CRAVING_COPY.passed));
    expect(st().cravingSessions[0]).toMatchObject({ outcome: 'passed', ratingAfter: 3 });
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
  }
});

describe('a second phone, analytics and Demo mode', () => {
  // The same rule as migration 0009 (revisions), as in the sync tests.
  function revisionServer(): SyncServer {
    const rows = new Map<string, RemoteRow & { rev: number }>();
    let tick = 0;
    return {
      pull: async (since, limit) => [...rows.values()].filter((r) => !since || r.server_updated_at > since).sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at)).slice(0, limit),
      push: async (batch) => {
        const back: PushedRow[] = [];
        for (const r of batch) {
          const k = `${r.collection}/${r.record_id}`;
          const old = rows.get(k);
          if (old && r.base_rev != null && r.base_rev !== old.rev) {
            back.push(old);
            continue;
          }
          const row = { collection: r.collection, record_id: r.record_id, data: r.data, deleted: r.deleted, client_updated_at: r.client_updated_at, server_updated_at: new Date(Date.UTC(2026, 9, 27, 12, 0, 0, ++tick)).toISOString(), rev: old ? old.rev + 1 : 1 };
          rows.set(k, row);
          back.push(row);
        }
        return back;
      },
    };
  }

  test('QUIT-6-020 a craving, its tools and ratings, a hard day and your toolkit reach a second phone exactly', async () => {
    const server = revisionServer();
    oneHabit();
    const r = await openTool('Delay it');
    await r.user.press(screen.getByText(CRAVING_COPY.okay));
    await r.user.press(screen.getByLabelText('4 out of 10'));
    await r.user.press(screen.getByText(CRAVING_COPY.passed));
    st().markHardDay('q1', 't1', { reflection: 'long day', reasonTags: ['Work'] });
    let a: SyncState = EMPTY_SYNC_STATE;
    a = (await syncOnce('u1', server, a, localData)).state;
    const onA = stableStringify({ habits: st().habits, sessions: st().cravingSessions, slips: st().slips, urges: st().feelingEntries });
    // The second phone: empty, then synced.
    useQuitHabitsStore.setState({ habits: [], tracks: [], feelingEntries: [], slips: [], cravingSessions: [] } as never);
    await syncOnce('u1', server, EMPTY_SYNC_STATE, localData);
    expect(stableStringify({ habits: st().habits, sessions: st().cravingSessions, slips: st().slips, urges: st().feelingEntries })).toBe(onA);
    expect(st().habits[0].toolkit?.custom).toEqual([{ id: 'tea', name: 'Make tea', minutes: 5 }]);
  });

  test('QUIT-6-021 analytics, switched on: a whole craving sends nothing about it (no habit, tool, rating, trigger or note)', async () => {
    const sent: unknown[] = [];
    setAnalyticsTransport((ev) => sent.push(ev));
    useSettingsStore.getState().setConsent({ storeData: true, analytics: true });
    track('discover_opened'); // an allowed event goes through, so the transport is live
    oneHabit();
    const r = await openTool('Name the craving');
    await r.user.type(screen.getByLabelText(TOOL_VIEW_COPY.nameFeeling), 'restless');
    await r.user.press(screen.getByLabelText('Work'));
    await r.user.press(screen.getByText(CRAVING_COPY.okay));
    await r.user.press(screen.getByLabelText('6 out of 10'));
    await r.user.press(screen.getByText(CRAVING_COPY.passed));
    expect(sent.length).toBeGreaterThan(0);
    expect(JSON.stringify(sent)).not.toMatch(/Vaping|craving|Naming|restless|Work|rating|tool|quit/i);
  });

  test('QUIT-6-022 a craving in Demo mode never reaches your own data', async () => {
    await storage.clear();
    __resetForTests();
    setDataSpace('real');
    await startAppData(storage as never, false);
    oneHabit();
    await __flushForTests();
    const own = stableStringify(st().cravingSessions);
    await switchDataSpace('demo', storage as never);
    expect(getDataSpace()).toBe('demo');
    const demoHabit = st().habits[0];
    const id = st().startCraving(demoHabit.id, st().tracks.find((t) => t.quitHabitId === demoHabit.id)!.id);
    st().tryCravingTool(id, 'grounding');
    st().endCraving(id, 'passed');
    await switchDataSpace('real', storage as never);
    expect(stableStringify(st().cravingSessions)).toBe(own);
    expect(st().cravingSessions.some((c) => c.id === id)).toBe(false);
  });
});

describe('a long session', () => {
  // Ends the craving the way a person does, back to the journey, and lets
  // any last timers run out.
  const finish = async (r: Awaited<ReturnType<typeof renderScreen>>) => {
    await r.user.press(screen.getAllByText(CRAVING_COPY.okay)[0]);
    await r.user.press(screen.getByText(CRAVING_COPY.passed));
    await r.user.press(await screen.findByText('Done'));
    expect(await screen.findByText("I'm craving it")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
  };

  test('QUIT-6-030 two hours in one tool (breathing): the craving doesn\'t grow, one check-in only, and every timer stops when it\'s over', async () => {
    oneHabit();
    const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
    const before = jest.getTimerCount(); // on the journey, before the craving
    await r.user.press(await screen.findByText("I'm craving it"));
    await r.user.press(screen.getByText(CRAVING_COPY.skip));
    await r.user.press(screen.getByText(TOOLKIT_COPY.seeAll));
    await r.user.press(screen.getAllByLabelText('Breathe and ride it out').at(-1)!);
    const size = () => JSON.stringify(st().cravingSessions).length;
    const start = size();
    for (let minute = 0; minute < 120; minute += 10) {
      await act(async () => {
        clock.advance(10 * 60_000);
        jest.advanceTimersByTime(16_000); // past the check-in's 15-second look
      });
    }
    expect(size()).toBe(start); // ticking stores nothing
    expect(st().cravingSessions[0].tools).toHaveLength(1);
    expect(screen.getAllByText(TOOL_VIEW_COPY.longStay)).toHaveLength(1);
    expect(screen.getByText(/^Riding it out: /)).toBeTruthy();
    await finish(r);
    expect(jest.getTimerCount()).toBeLessThanOrEqual(before);
  });

  test('QUIT-6-031 moving between every tool many times: one entry per switch, no sound left playing, no timer left behind', async () => {
    oneHabit();
    const r = await renderScreen('quitHabit', QuitHabitScreen, { openHabitId: 'q1' });
    const before = jest.getTimerCount();
    await r.user.press(await screen.findByText("I'm craving it"));
    await r.user.press(screen.getByText(CRAVING_COPY.skip));
    const tools = ['Calm sounds', 'Breathe and ride it out', 'A mindful minute', 'Delay it', 'Count ten breaths', 'Draw what you feel'];
    for (let round = 0; round < 3; round++) {
      for (const t of tools) {
        await r.user.press(screen.getByText(TOOLKIT_COPY.seeAll));
        await r.user.press(screen.getAllByLabelText(t).at(-1)!);
        if (t === 'Calm sounds') await r.user.press(screen.getByLabelText('Waves'));
        await r.user.press(screen.getByText(CRAVING_COPY.tryElse));
        expect(isLayerActive('ocean-waves', 'quit')).toBe(false);
      }
    }
    expect(st().cravingSessions[0].tools).toHaveLength(tools.length * 3);
    await finish(r);
    expect(jest.getTimerCount()).toBeLessThanOrEqual(before);
  });
});
