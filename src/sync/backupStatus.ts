// "Is my data backed up?" in one honest line (design 3.6, gaps G10/G11).
// Shown at the top of Settings → Account & Subscription → Sync. Never says
// "backed up" while anything on this phone isn't in the account.
import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useAccountStore } from '../store/useAccountStore';
import { useSyncStore } from '../store/useSyncStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAccountChoiceStore } from './signInFlow';
import { currentSyncGate, unsentChanges } from './syncController';
import { isDemo } from '../utils/dataSpace';
import { PLUS_NAME } from '../config/plans';
import type { SyncGate } from '../utils/sync';

export type BackupKind = 'demo' | 'signedOut' | 'waitingForChoice' | 'off' | 'paused' | 'withoutPlus' | 'offline' | 'syncing' | 'error' | 'sending' | 'backedUp' | 'notYet';

export interface BackupStatus {
  kind: BackupKind;
  title: string;
  line: string;
}

export interface BackupInput {
  demo: boolean;
  signedIn: boolean;
  waitingForChoice: boolean;
  gate: SyncGate;
  unsent: number;
  syncing: boolean;
  error: string | null;
  lastSyncedAt?: string;
  now: number;
}

const changes = (n: number) => `${n} ${n === 1 ? 'change' : 'changes'}`;
const waiting = (n: number, when: string) => (n ? `${changes(n)} on this phone ${n === 1 ? "isn't" : "aren't"} in your account yet. ${when}` : '');

export function ago(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'} ago`;
}

export function backupStatus(i: BackupInput): BackupStatus {
  if (i.demo) return { kind: 'demo', title: 'Demo mode', line: 'Sample data stays on this phone and is never backed up.' };
  if (!i.signedIn) return { kind: 'signedOut', title: 'Not backed up', line: 'Your data is only on this phone. Sign in to keep a copy in your account.' };
  if (i.waitingForChoice) return { kind: 'waitingForChoice', title: 'Waiting for your choice', line: 'Nothing syncs until you choose what to do with the data on this phone.' };
  if (!i.gate.allowed) {
    if (i.gate.reason === 'noConsent') return { kind: 'off', title: 'Not backed up', line: 'Sync is off, so your data is only on this phone.' };
    if (i.gate.reason === 'paused') return { kind: 'paused', title: 'Sync paused', line: waiting(i.unsent, 'Nothing leaves this phone until you turn sync back on.') || 'Nothing leaves this phone while paused.' };
    if (i.gate.reason === 'offline') return { kind: 'offline', title: 'Offline', line: waiting(i.unsent, "They're sent when you're back online.") || "Everything is in your account. Ona syncs when you're back online." };
    return { kind: 'off', title: 'Not backed up', line: i.gate.message };
  }
  if (i.gate.uploads === false) {
    return {
      kind: 'withoutPlus',
      title: 'Backup paused',
      line: waiting(i.unsent, `They're kept here, and sent when you have ${PLUS_NAME} again. Your account's data still comes to this phone.`) || `Sending new changes needs ${PLUS_NAME}. Your account's data still comes to this phone.`,
    };
  }
  if (i.syncing) return { kind: 'syncing', title: 'Syncing…', line: i.unsent ? `Sending ${changes(i.unsent)}.` : 'Checking your account.' };
  if (i.error) return { kind: 'error', title: "Couldn't sync", line: `${i.error}${i.unsent ? ` ${waiting(i.unsent, 'Ona tries again soon.')}` : ''}` };
  if (i.unsent) return { kind: 'sending', title: 'Backing up', line: waiting(i.unsent, 'They go up within a few seconds.') };
  if (!i.lastSyncedAt) return { kind: 'notYet', title: 'Not synced yet', line: 'Ona syncs in a moment.' };
  return { kind: 'backedUp', title: 'Backed up', line: `Last synced ${ago(i.lastSyncedAt, i.now)}.` };
}

export function currentBackupStatus(now = Date.now()): BackupStatus {
  const sync = useSyncStore.getState();
  return backupStatus({
    demo: isDemo(),
    signedIn: !!useAuthStore.getState().session,
    waitingForChoice: !!useAccountChoiceStore.getState().pending,
    gate: currentSyncGate(),
    unsent: isDemo() ? 0 : unsentChanges(),
    syncing: sync.status === 'syncing',
    error: sync.status === 'error' ? sync.lastError : null,
    lastSyncedAt: useAccountStore.getState().lastSyncedAt,
    now,
  });
}

// Recomputed when anything it depends on changes, and every 30 s (for
// "x min ago").
export function useBackupStatus(): BackupStatus {
  const [status, setStatus] = useState(() => currentBackupStatus());
  useEffect(() => {
    const update = () => setStatus(currentBackupStatus());
    const unsubs = [useSyncStore, useAccountStore, useAuthStore, useAccountChoiceStore, useSettingsStore].map((s) => (s as unknown as { subscribe: (fn: () => void) => () => void }).subscribe(update));
    const t = setInterval(update, 30_000);
    return () => {
      unsubs.forEach((u) => u());
      clearInterval(t);
    };
  }, []);
  return status;
}
