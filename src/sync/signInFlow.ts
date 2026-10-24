// What happens to the data on this phone when an account signs in, and when
// it signs out (design 3.3 and 3.4). Before the first sync with an account,
// one check decides:
//
// - The phone's data already belongs to this account, or the phone is
//   empty: sync straight away (an empty phone gets the account's data; data
//   this account left here earlier is brought back first).
// - Data made without an account, and the account is empty: one tap to
//   confirm, with the count (Continue / Keep separate).
// - Data made without an account, and the account already has data: the
//   merge screen. Merge (default), keep this phone's data separate, or use
//   the account's data only. Never decided silently.
// - Data from a different account: never added by default. Keep it
//   separate (default) or add it to this account.
//
// Until the person chooses, nothing syncs. Whatever is kept separate is put
// aside on this phone (dataSpaceController: parkActiveData), never deleted.
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useSyncStore } from '../store/useSyncStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { clearActiveData, countActiveRecords, listParked, parkActiveData, restoreParked, type ParkedCopy } from '../utils/dataSpaceController';
import { isDemo } from '../utils/dataSpace';
import { resyncFeature } from '../utils/reminders';

export type AccountChoice =
  | { kind: 'adopt'; userId: string; here: number }
  | { kind: 'merge'; userId: string; here: number; inAccount: number }
  | { kind: 'otherAccount'; userId: string; here: number; otherOwner: string };

export type ChoiceOption = 'continue' | 'merge' | 'keepSeparate' | 'accountOnly' | 'addToAccount';

interface ChoiceState {
  pending: AccountChoice | null;
  readyFor: string | null; // the account the phone's data is settled for
  busy: boolean;
  hidden: boolean; // "Decide later": the sheet is closed, the choice still waits
}

export const useAccountChoiceStore = create<ChoiceState>(() => ({ pending: null, readyFor: null, busy: false, hidden: false }));

export const CHOICE_NEEDED = 'Choose what to do with the data on this phone first.';

// How many records the account holds (not counting deleted ones).
export async function countAccountRecords(userId: string): Promise<number> {
  const { data, count, error } = (await supabase
    .from('sync_records' as never)
    .select('record_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('deleted', false)) as unknown as { data: unknown[] | null; count: number | null; error: { message: string } | null };
  if (error) throw new Error(error.message);
  return count ?? data?.length ?? 0;
}

// Every way a kept-aside copy comes back goes through here, so its tasks,
// habits and skills get their reminders scheduled again on this phone.
export async function bringBack(id: string): Promise<'restored' | 'added'> {
  const result = await restoreParked(id);
  await resyncFeature('tasks');
  await resyncFeature('habits');
  return result;
}

// The check running now, per account (a check for one account never answers
// for another).
const checking = new Map<string, Promise<'ready' | AccountChoice>>();

// Called by sync before it runs for `userId`. Cheap once settled.
export function prepareAccount(userId: string, countInAccount: (userId: string) => Promise<number> = countAccountRecords): Promise<'ready' | AccountChoice> {
  const state = useAccountChoiceStore.getState();
  if (state.readyFor === userId) return Promise.resolve('ready');
  if (state.pending?.userId === userId) return Promise.resolve(state.pending);
  const already = checking.get(userId);
  if (already) return already;
  const run = (async (): Promise<'ready' | AccountChoice> => {
    const owner = useSyncStore.getState().owner;
    if (owner === userId) return settle(userId);
    const here = countActiveRecords();
    if (here === 0) {
      // Nothing here: forget any other account, and bring back what this
      // account left on this phone before (if anything).
      if (owner) useSyncStore.getState().reset();
      const own = (await listParked()).filter((c) => c.origin === userId);
      for (const c of own) await bringBack(c.id);
      return settle(userId);
    }
    if (owner === null) {
      const inAccount = await countInAccount(userId);
      if (inAccount === 0) return ask({ kind: 'adopt', userId, here });
      return ask({ kind: 'merge', userId, here, inAccount });
    }
    return ask({ kind: 'otherAccount', userId, here, otherOwner: owner });
  })();
  // Cleared once settled, also when the check finishes without waiting.
  checking.set(userId, run);
  void run.finally(() => checking.delete(userId)).catch(() => {});
  return run;
}

function settle(userId: string): 'ready' {
  useAccountChoiceStore.setState({ readyFor: userId, pending: null });
  return 'ready';
}
function ask(choice: AccountChoice): AccountChoice {
  // Signed out (or in as someone else) while checking: nothing to ask.
  if (useAuthStore.getState().session?.user.id !== choice.userId) return choice;
  useAccountChoiceStore.setState({ pending: choice, readyFor: null, hidden: false });
  return choice;
}

// The person's answer. Afterwards sync runs as usual.
export async function chooseForAccount(option: ChoiceOption): Promise<void> {
  const choice = useAccountChoiceStore.getState().pending;
  if (!choice || isDemo()) return;
  useAccountChoiceStore.setState({ busy: true });
  try {
    if (option === 'continue' || option === 'merge' || option === 'addToAccount') {
      // Everything here is added to the account by the next sync (union by
      // item; nothing deleted on either side).
      if (choice.kind === 'otherAccount') useSyncStore.getState().reset();
    } else {
      const origin = choice.kind === 'otherAccount' ? choice.otherOwner : null;
      await parkActiveData({ origin, reason: choice.kind === 'otherAccount' ? 'otherAccount' : option === 'accountOnly' ? 'accountOnly' : 'keptSeparate' });
      for (const c of (await listParked()).filter((x) => x.origin === choice.userId)) await bringBack(c.id);
    }
    if (useAuthStore.getState().session?.user.id === choice.userId) settle(choice.userId);
    else useAccountChoiceStore.setState({ pending: null });
  } finally {
    useAccountChoiceStore.setState({ busy: false });
  }
}

// --- Sign-out (design 3.4) ---------------------------------------------------

export interface SignOutFacts {
  unsent: number; // changes on this phone not yet in the account
  canRemove: boolean; // everything is in the account, so removing loses nothing
  noLock: boolean; // no app lock: worth mentioning on a shared phone
  keptSeparate: ParkedCopy | null; // this phone's data from before signing in
}

export async function signOutFacts(unsent: number, syncOn: boolean): Promise<SignOutFacts> {
  const parked = await listParked();
  return {
    unsent,
    canRemove: syncOn && unsent === 0,
    noLock: !useSettingsStore.getState().appLock,
    keptSeparate: parked.find((c) => c.origin === null && c.reason !== 'otherAccount') ?? null,
  };
}

// "Keep my data on this phone": it stays, still marked as this account's, so
// another account signing in is asked before anything mixes. "Remove": the
// phone's copy goes (the account keeps everything), and this phone's own
// data from before signing in, if it was kept separate, comes back.
export async function signOutAndChoose(keep: boolean): Promise<void> {
  const facts = keep ? null : await signOutFacts(0, true);
  await useAuthStore.getState().signOut();
  if (useAuthStore.getState().session) {
    // Signed out on the server but the session event hasn't arrived: never
    // remove anything while a session is still here (a sync could bring it
    // all back down). Clear it now; the event then changes nothing.
    useAuthStore.setState({ session: null });
  }
  if (keep) return;
  await clearActiveData();
  if (facts?.keptSeparate) await bringBack(facts.keptSeparate.id);
}

// The sign-out wording, in one place (tests read it).
export const SIGN_OUT_COPY = {
  unsentTitle: (n: number) => `${n} ${n === 1 ? 'change is' : 'changes are'} not in your account yet`,
  unsentMessage: 'Sync them first, so your account has everything?',
  syncFirst: 'Sync now',
  signOutAnyway: 'Sign out anyway',
};

export function signOutCopy(facts: SignOutFacts) {
  const lines = [
    facts.canRemove
      ? 'Everything is in your account. Keep a copy on this phone, or remove it (your account keeps everything).'
      : facts.unsent > 0
        ? `${facts.unsent} ${facts.unsent === 1 ? 'change' : 'changes'} on this phone ${facts.unsent === 1 ? "isn't" : "aren't"} in your account, so your data stays on this phone. To take it off this phone, sync first or export it (Privacy, Security & Data).`
        : 'Your data stays on this phone. Sync stops until you sign in again.',
    ...(facts.keptSeparate ? ["This phone's data from before you signed in comes back if you remove your account's copy."] : []),
    ...(facts.noLock ? ['If others use this phone, turn on App lock in Privacy, Security & Data.'] : []),
  ];
  return {
    title: 'Sign out?',
    message: lines.join('\n\n'),
    keep: 'Keep my data on this phone',
    remove: 'Remove my data from this phone',
    removedToast: 'Signed out. Your data is in your account, not on this phone.',
  };
}
