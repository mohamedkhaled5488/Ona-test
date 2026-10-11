import type { StateStorage } from 'zustand/middleware';
import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  createSettingsStore,
  migrateSettings,
  withDefaults,
} from '../../store/useSettingsStore';

// A storage that survives "restarts": each new store reads what the last one wrote.
function memoryStorage(): StateStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

async function restart(storage: StateStorage) {
  const store = createSettingsStore(storage);
  await store.persist.rehydrate();
  return store;
}

describe('settings store', () => {
  test('a fresh install has the documented defaults', async () => {
    const store = await restart(memoryStorage());
    const s = store.getState();
    expect(s.theme).toBe('system');
    expect(s.textSize).toBe('system');
    expect(s.notify).toEqual({ tasks: true, habits: true, studyEnd: true, sleep: true, weeklyStory: false });
    expect(s.quietHours.enabled).toBe(false);
    expect(s.quietHours.includeAlarms).toBe(false);
    // Consent is never pre-given.
    expect(s.consent).toEqual({ storeData: false, analytics: false, tips: false });
    expect(s.backgroundAudio).toBe(true);
    expect(s.shareSensitiveInRecap).toBe(false); // Feelings and Quit excluded from shares
    expect(s.recapComparison).toBe(true);
    expect(s.taskFeelingMode).toBe('auto'); // after important or tagged tasks
    expect(s.taskFeelingBefore).toBe(false); // the "before" feeling is opt-in
    expect([0, 1, 6]).toContain(s.weekStartsOn);
  });

  test('every setting persists across restarts', async () => {
    const storage = memoryStorage();
    const first = await restart(storage);
    const a = first.getState();
    a.set('theme', 'light');
    a.set('accent', 'plum');
    a.set('textSize', 'largest');
    a.set('weekStartsOn', 6);
    a.setNotify('habits', false);
    a.setNotify('weeklyStory', true);
    a.set('defaultAlarmSound', 'chime');
    a.setQuietHours({ enabled: true, start: '23:00', end: '06:30', includeAlarms: true });
    a.setConsent({ storeData: true, analytics: true });
    a.set('backgroundAudio', false);
    a.set('interruption', 'pause');
    a.set('defaultStudySound', 'rain');
    a.set('defaultSleepTimerMinutes', 45);
    a.set('defaultFadeOutMinutes', 10);
    a.toggleRecapSection('sleep');
    a.set('recapComparison', false);
    a.set('bookShowEstimate', false);

    const second = await restart(storage);
    const b = second.getState();
    expect(b.theme).toBe('light');
    expect(b.accent).toBe('plum');
    expect(b.textSize).toBe('largest');
    expect(b.weekStartsOn).toBe(6);
    expect(b.notify.habits).toBe(false);
    expect(b.notify.weeklyStory).toBe(true);
    expect(b.defaultAlarmSound).toBe('chime');
    expect(b.quietHours).toEqual({ enabled: true, start: '23:00', end: '06:30', includeAlarms: true });
    expect(b.consent).toEqual({ storeData: true, analytics: true, tips: false });
    expect(b.backgroundAudio).toBe(false);
    expect(b.interruption).toBe('pause');
    expect(b.defaultStudySound).toBe('rain');
    expect(b.defaultSleepTimerMinutes).toBe(45);
    expect(b.defaultFadeOutMinutes).toBe(10);
    expect(b.hiddenRecapSections).toEqual(['sleep']);
    expect(b.recapComparison).toBe(false);
    expect(b.bookShowEstimate).toBe(false);
  });

  test('only settings are written, never functions', async () => {
    const storage = memoryStorage();
    const store = await restart(storage);
    store.getState().set('theme', 'dark');
    const saved = JSON.parse(storage.data.get('ona.settings')!);
    expect(saved.version).toBe(SETTINGS_VERSION);
    expect(Object.keys(saved.state).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });
});

describe('settings migrations', () => {
  test('v2 with the after-task feeling switched on becomes the default mode', async () => {
    const storage = memoryStorage();
    storage.setItem('ona.settings', JSON.stringify({ version: 2, state: { feelingPromptAfterTasks: true, theme: 'dark' } }));
    const s = (await restart(storage)).getState();
    expect(s.taskFeelingMode).toBe('auto');
    expect(s.theme).toBe('dark');
  });

  test('v1 data (before the notify group) migrates to the current shape', async () => {
    const storage = memoryStorage();
    storage.setItem(
      'ona.settings',
      JSON.stringify({
        version: 1,
        state: { backgroundAudio: false, weekStartsOn: 0, weeklyStoryNotification: true, hiddenRecapSections: ['budget'], feelingPromptAfterTasks: false },
      })
    );
    const s = (await restart(storage)).getState();
    expect(s.notify.weeklyStory).toBe(true);
    expect((s as unknown as Record<string, unknown>).weeklyStoryNotification).toBeUndefined();
    // Values the user had are kept...
    expect(s.backgroundAudio).toBe(false);
    expect(s.weekStartsOn).toBe(0);
    expect(s.hiddenRecapSections).toEqual(['budget']);
    // The old "feeling after tasks: off" carries over as "never ask".
    expect(s.taskFeelingMode).toBe('never');
    expect((s as unknown as Record<string, unknown>).feelingPromptAfterTasks).toBeUndefined();
    // ...and settings added since then get their defaults.
    expect(s.theme).toBe('system');
    expect(s.notify.tasks).toBe(true);
    expect(s.quietHours).toEqual(DEFAULT_SETTINGS.quietHours);
  });

  test('migration steps run in order, from the stored version up', () => {
    const calls: number[] = [];
    const steps = {
      2: (s: Record<string, unknown>) => (calls.push(2), { ...s, a: 2 }),
      3: (s: Record<string, unknown>) => (calls.push(3), { ...s, theme: s.a === 2 ? 'light' : 'dark' }),
    };
    const out = migrateSettings({}, 1, steps, 3);
    expect(calls).toEqual([2, 3]);
    expect(out.theme).toBe('light');
    expect(migrateSettings({}, 2, steps, 3).theme).toBe('dark');
  });

  test('new keys are filled and removed keys dropped, even without a version bump', () => {
    const out = withDefaults({ theme: 'dark', notify: { tasks: false }, someOldSetting: 1 });
    expect(out.theme).toBe('dark');
    expect(out.notify).toEqual({ ...DEFAULT_SETTINGS.notify, tasks: false });
    expect((out as unknown as Record<string, unknown>).someOldSetting).toBeUndefined();
    expect(out.consent).toEqual(DEFAULT_SETTINGS.consent);
  });

  test('garbage in storage falls back to defaults', () => {
    expect(migrateSettings('not an object', 0)).toEqual(withDefaults({}));
  });
});
