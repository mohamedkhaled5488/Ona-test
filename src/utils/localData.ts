// Everything Ona stores on the device, in one registry, so "Export my data"
// and "Delete data on this device" always cover exactly the same things.
// Neither touches the account, the server or settings.
import { usePlanStore } from '../store/usePlanStore';
import { useDailyPlanningStore } from '../store/useDailyPlanningStore';
import { useJournalStore } from '../store/useJournalStore';
import { useThoughtsStore } from '../store/useThoughtsStore';
import { useStudyStore } from '../store/useStudyStore';
import { useDietStore } from '../store/useDietStore';
import { useSongwritingStore } from '../store/useSongwritingStore';
import { useMindGamesStore } from '../store/useMindGamesStore';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { useSleepStore } from '../store/useSleepStore';
import { useReadingListStore } from '../store/useReadingListStore';
import { useSkillsStore } from '../store/useSkillsStore';
import { useHabitsStore } from '../store/useHabitsStore';
import { useBudgetStore } from '../store/useBudgetStore';
import { useQuitHabitsStore } from '../store/useQuitHabitsStore';
import { useRecapStore } from '../store/useRecapStore';
import { cancelReminders } from './notifications';
import { normalizeTags, normalizeTasks, normalizeTemplates } from './taskMigration';

interface DataStore {
  getState: () => object;
  setState: (partial: Record<string, unknown>) => void;
}

// section key in the export → the store and the keys that hold user data.
// `prefs` are a section's own preferences (Sleep's sound mix and reminders,
// Diet's currency): saved on the device with the data, but kept when data is
// deleted, and never synced (alarms belong to one phone).
// `normalize` brings a key's saved or synced value up to the current shape
// (data from an older version of Ona, here or on another device).
export const LOCAL_DATA: Record<string, { store: DataStore; keys: string[]; prefs?: string[]; normalize?: Record<string, (value: unknown) => unknown> }> = {
  planBuilder: { store: usePlanStore as never, keys: ['plans', 'personalTemplates'] },
  dailyPlanning: {
    store: useDailyPlanningStore as never,
    keys: ['tasks', 'tags', 'taskTemplates', 'hiddenStarterTemplates', 'dayTemplates', 'dayReflections', 'dayOrder'],
    normalize: { tasks: normalizeTasks, tags: normalizeTags, taskTemplates: normalizeTemplates },
  },
  journaling: { store: useJournalStore as never, keys: ['entries'] },
  catchAThought: { store: useThoughtsStore as never, keys: ['thoughts'] },
  studySession: { store: useStudyStore as never, keys: ['sessions', 'active', 'pendingSummary'] },
  dietPlanning: { store: useDietStore as never, keys: ['plannedMeals', 'favorites', 'groceryItems'], prefs: ['currency'] },
  songwriting: { store: useSongwritingStore as never, keys: ['songs'] },
  mindGames: { store: useMindGamesStore as never, keys: ['results'] },
  feelings: { store: useFeelingsStore as never, keys: ['entries', 'personalFeelings', 'bookmarks', 'guidanceVotes', 'customReasonTags'] },
  sleep: { store: useSleepStore as never, keys: ['logs'], prefs: ['mix', 'windDownItems', 'bedtime', 'wakeAlarm'] },
  book: { store: useReadingListStore as never, keys: ['entries', 'quotes', 'sessions'] },
  skills: { store: useSkillsStore as never, keys: ['skills', 'sessions'] },
  habits: { store: useHabitsStore as never, keys: ['habits', 'checkIns'] },
  budget: { store: useBudgetStore as never, keys: ['budgets', 'entries'] },
  quitHabit: { store: useQuitHabitsStore as never, keys: ['habits', 'tracks', 'feelingEntries'] },
  recap: { store: useRecapStore as never, keys: ['bestMoments'] },
};

// A value as the current version expects it (see `normalize` above).
export function normalizeField(section: string, field: string, value: unknown): unknown {
  const fn = LOCAL_DATA[section]?.normalize?.[field];
  return fn ? fn(value) : value;
}

const PHOTO_KEY = /(photoUri|CoverUri)$/;

export const EXPORT_FORMAT_VERSION = 1;

export interface DataExport {
  format: 'ona-export';
  version: number;
  exportedAt: string;
  includesPhotos: boolean;
  sections: Record<string, Record<string, unknown>>;
}

// Walks a value, dropping photo fields (or replacing them with what
// `photo` returns for each one).
function mapPhotos(value: unknown, photo: ((uri: string) => string) | null): unknown {
  if (Array.isArray(value)) return value.map((v) => mapPhotos(v, photo));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (PHOTO_KEY.test(k) && typeof v === 'string') {
        if (photo) out[k] = photo(v);
      } else out[k] = mapPhotos(v, photo);
    }
    return out;
  }
  return value;
}

export function collectPhotoUris(): string[] {
  const uris: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if (PHOTO_KEY.test(k) && typeof x === 'string') uris.push(x);
        else walk(x);
      }
  };
  for (const { store, keys } of Object.values(LOCAL_DATA)) {
    const state = store.getState() as Record<string, unknown>;
    keys.forEach((k) => walk(state[k]));
  }
  return uris;
}

// `photos`: undefined leaves photos out; otherwise a map of uri → embedded
// data (a data: URI) — anything missing from the map keeps its original uri.
export function buildExport(photos?: Record<string, string>, now: Date = new Date()): DataExport {
  const sections: DataExport['sections'] = {};
  for (const [section, { store, keys }] of Object.entries(LOCAL_DATA)) {
    const state = store.getState() as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = mapPhotos(state[key], photos ? (uri) => photos[uri] ?? uri : null);
    sections[section] = out;
  }
  return { format: 'ona-export', version: EXPORT_FORMAT_VERSION, exportedAt: now.toISOString(), includesPhotos: !!photos, sections };
}

function emptyLike(value: unknown): unknown {
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object') return {};
  return null;
}

// Clears every section's data on this device. The account, anything on the
// server, and settings are left alone. Reminders tied to deleted items
// (tasks, habits, skills) are cancelled so nothing fires for them.
export async function wipeLocalData(): Promise<void> {
  const ids: string[] = [];
  const collectIds = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(collectIds);
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if ((k === 'notificationIds' || k === 'reminderNotificationIds') && Array.isArray(x)) ids.push(...(x as string[]));
        else collectIds(x);
      }
  };
  for (const { store, keys } of Object.values(LOCAL_DATA)) {
    const state = store.getState() as Record<string, unknown>;
    keys.forEach((k) => collectIds(state[k]));
    const cleared: Record<string, unknown> = {};
    for (const key of keys) cleared[key] = emptyLike(state[key]);
    store.setState(cleared);
  }
  // Sleep's bedtime and wake reminders are settings, not data, so they stay.
  await cancelReminders(ids);
}

// Developer tools: put the sample data the app ships with back in place.
// Captured once, when this module first loads.
const SAMPLE: Record<string, Record<string, unknown>> = Object.fromEntries(
  Object.entries(LOCAL_DATA).map(([section, { store, keys }]) => {
    const state = store.getState() as Record<string, unknown>;
    return [section, Object.fromEntries(keys.map((k) => [k, state[k]]))];
  })
);

// Each section's own preferences as the app starts (the defaults). A space
// that has none saved starts from these, never from the other space's.
export const INITIAL_PREFS: Record<string, Record<string, unknown>> = Object.fromEntries(
  Object.entries(LOCAL_DATA).map(([section, { store, prefs }]) => {
    const state = store.getState() as Record<string, unknown>;
    return [section, JSON.parse(JSON.stringify(Object.fromEntries((prefs ?? []).map((k) => [k, state[k]]))))];
  })
);

// A deep copy of the built-in sample data, per section (Demo mode's seed until
// its own generator exists).
export function sampleSectionData(): Record<string, Record<string, unknown>> {
  return JSON.parse(JSON.stringify(SAMPLE));
}

export function restoreSampleData(): void {
  for (const [section, { store }] of Object.entries(LOCAL_DATA)) store.setState(SAMPLE[section]);
}
