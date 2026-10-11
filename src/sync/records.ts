// How section data becomes sync records and back. Pure functions.
//
// A "collection" is one key of one section (e.g. dailyPlanning.tasks).
// - A list of items with string ids → one record per item.
// - Anything else (a map like dayReflections, a list of words, a single
//   value) → one record with the id "_".
// Phone-only fields (the ids of reminders scheduled on this phone) are never
// sent, and are kept from this phone's copy when an item arrives from
// another device.
import { LOCAL_DATA } from '../utils/localData';

export const WHOLE = '_';

// Which collections carry phone-only fields, and which ones.
export const DEVICE_ONLY_FIELDS: Record<string, string[]> = {
  'dailyPlanning.tasks': ['notificationIds'],
  'habits.habits': ['reminderNotificationIds'],
  'skills.skills': ['reminderNotificationIds'],
};

// Section keys that describe this phone right now, not the user's data.
const NOT_SYNCED: Record<string, string[]> = {
  studySession: ['active', 'pendingSummary'], // a timer running on this phone
};

export interface Collection {
  key: string; // "section.field"
  section: string;
  field: string;
}

export function syncedCollections(): Collection[] {
  const out: Collection[] = [];
  for (const [section, { keys }] of Object.entries(LOCAL_DATA)) {
    for (const field of keys) {
      if (NOT_SYNCED[section]?.includes(field)) continue;
      out.push({ key: `${section}.${field}`, section, field });
    }
  }
  return out;
}

type Item = { id: string } & Record<string, unknown>;

function isItemList(value: unknown): value is Item[] {
  return Array.isArray(value) && value.every((v) => v !== null && typeof v === 'object' && typeof (v as Item).id === 'string');
}

// Whether a collection holds items (one record each) or is one whole value.
function holdsItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && isItemList(value);
}

export function toRecords(collection: string, value: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>();
  const deviceOnly = DEVICE_ONLY_FIELDS[collection] ?? [];
  if (holdsItems(value)) {
    for (const item of value as Item[]) {
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item)) if (!deviceOnly.includes(k)) data[k] = v;
      map.set(item.id, data);
    }
  } else if (Array.isArray(value) && value.length === 0) {
    // Empty: nothing to send.
  } else if (value !== null && value !== undefined && !(typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)) {
    map.set(WHOLE, value);
  }
  return map;
}

// Rebuilds a collection from its full set of records. Items already here keep
// their place and their phone-only fields; new ones go at the end with empty
// phone-only fields, so this phone schedules its own reminders for them.
export function fromRecords(collection: string, current: unknown, records: Map<string, unknown>): unknown {
  if (records.has(WHOLE)) return records.get(WHOLE);
  const deviceOnly = DEVICE_ONLY_FIELDS[collection] ?? [];
  if (Array.isArray(current) && (current.length === 0 || isItemList(current))) {
    const list = current as Item[];
    const out: Item[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      if (!records.has(item.id)) continue; // deleted
      const kept = Object.fromEntries(deviceOnly.map((f) => [f, item[f] ?? []]));
      out.push({ ...(records.get(item.id) as Record<string, unknown>), ...kept, id: item.id });
      seen.add(item.id);
    }
    for (const [id, data] of records) {
      if (seen.has(id)) continue;
      out.push({ ...(data as Record<string, unknown>), ...Object.fromEntries(deviceOnly.map((f) => [f, []])), id });
    }
    return out;
  }
  // A whole value whose record is gone (deleted elsewhere): back to empty.
  if (Array.isArray(current)) return [];
  if (current && typeof current === 'object') return {};
  return current;
}

// Stable JSON (sorted keys), so the same data always fingerprints the same.
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// A short fingerprint (FNV-1a, 32-bit, plus length) — only used to notice changes.
export function fingerprint(value: unknown): string {
  const s = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}:${s.length}`;
}
