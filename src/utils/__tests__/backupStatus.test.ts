// The backup status row (design 3.6): one honest line for every state, and
// never "Backed up" while anything on this phone isn't in the account.
// IDs: docs/test-cases/integration.md (BACKUP-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import fc from 'fast-check';
import { ago, backupStatus, type BackupInput } from '../../sync/backupStatus';
import { syncGate, type SyncGateInput } from '../sync';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const gateOk: SyncGateInput = { configured: true, signedIn: true, syncAccess: true, consentStoreData: true, paused: false, offline: false };
const base: BackupInput = { demo: false, signedIn: true, waitingForChoice: false, gate: syncGate(gateOk), unsent: 0, syncing: false, error: null, lastSyncedAt: '2026-10-24T11:58:00Z', now: NOW };
const with_ = (p: Partial<BackupInput>, g: Partial<SyncGateInput> = {}) => backupStatus({ ...base, gate: syncGate({ ...gateOk, ...g }), ...p });

test('BACKUP-001 every state has its own title', () => {
  expect(with_({}).title).toBe('Backed up');
  expect(with_({}).line).toBe('Last synced 2 min ago.');
  expect(with_({ demo: true }).kind).toBe('demo');
  expect(with_({ signedIn: false }, { signedIn: false })).toMatchObject({ kind: 'signedOut', title: 'Not backed up' });
  expect(with_({ waitingForChoice: true })).toMatchObject({ kind: 'waitingForChoice', title: 'Waiting for your choice' });
  expect(with_({}, { consentStoreData: false })).toMatchObject({ kind: 'off', title: 'Not backed up' });
  expect(with_({ unsent: 2 }, { paused: true })).toMatchObject({ kind: 'paused', title: 'Sync paused' });
  expect(with_({ unsent: 1 }, { offline: true }).line).toBe("1 change on this phone isn't in your account yet. They're sent when you're back online.");
  expect(with_({ unsent: 3 }, { syncAccess: false })).toMatchObject({ kind: 'withoutPlus', title: 'Backup paused' });
  expect(with_({ syncing: true, unsent: 2 }).line).toBe('Sending 2 changes.');
  expect(with_({ error: "Couldn't reach the server." })).toMatchObject({ kind: 'error', title: "Couldn't sync" });
  expect(with_({ unsent: 1 })).toMatchObject({ kind: 'sending', title: 'Backing up' });
  expect(with_({ lastSyncedAt: undefined })).toMatchObject({ kind: 'notYet' });
});

test('BACKUP-002 never "Backed up" while a change is waiting, in any combination', () => {
  fc.assert(
    fc.property(
      fc.record({ unsent: fc.integer({ min: 1, max: 500 }), syncing: fc.boolean(), err: fc.boolean(), waitingForChoice: fc.boolean(), paused: fc.boolean(), offline: fc.boolean(), access: fc.boolean(), consent: fc.boolean() }),
      (r) => {
        const s = with_({ unsent: r.unsent, syncing: r.syncing, error: r.err ? 'x' : null, waitingForChoice: r.waitingForChoice }, { paused: r.paused, offline: r.offline, syncAccess: r.access, consentStoreData: r.consent });
        return s.kind !== 'backedUp' && !/^Backed up/.test(s.title);
      }
    )
  );
});

test('BACKUP-003 the wording uses the mode names and none of the banned words', () => {
  const all = [with_({ unsent: 2 }, { syncAccess: false }), with_({}, { syncAccess: false }), with_({ signedIn: false }, { signedIn: false }), with_({ waitingForChoice: true })].flatMap((s) => [s.title, s.line]).join('\n');
  expect(all).toMatch(/Plus/);
  expect(all).not.toMatch(/\b(free version|expired?|downgrad\w*|limited|trial ended|premium)\b/i);
});

test('BACKUP-004 "x ago" in plain words', () => {
  expect(ago('2026-10-24T11:59:45Z', NOW)).toBe('just now');
  expect(ago('2026-10-24T11:15:00Z', NOW)).toBe('45 min ago');
  expect(ago('2026-10-24T07:00:00Z', NOW)).toBe('5 h ago');
  expect(ago('2026-10-23T12:00:00Z', NOW)).toBe('1 day ago');
});
