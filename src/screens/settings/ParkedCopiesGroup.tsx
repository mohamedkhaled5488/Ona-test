// Settings → Privacy, Security & Data → Other data on this phone: whatever
// was kept aside when an account signed in (sync/signInFlow.ts). Ona never
// removes these by itself; the person brings one back or removes it.
import React, { useCallback, useEffect, useState } from 'react';
import { useUi } from '../../components/UiProvider';
import { useAuthStore } from '../../store/useAuthStore';
import { listParked, removeParked, type ParkedCopy } from '../../utils/dataSpaceController';
import { bringBack } from '../../sync/signInFlow';
import { formatDisplayDate } from '../../utils/date';
import { Group, NavRow } from './SettingsParts';

export const PARKED_COPY = {
  title: 'Other data on this phone',
  footer: "Kept aside when you signed in, so it didn't mix with your account. It stays until you bring it back or remove it.",
  label: (c: ParkedCopy) =>
    c.reason === 'otherAccount' ? 'Data from another account' : c.reason === 'accountOnly' ? "A copy of this phone's data from before you signed in" : "This phone's data from before you signed in",
  explain: (c: ParkedCopy) => `${c.records} ${c.records === 1 ? 'item' : 'items'} · kept ${formatDisplayDate(c.parkedAt.slice(0, 10))}`,
  restoreTitle: 'Bring it back?',
  restoreMessage: (signedIn: boolean) =>
    signedIn
      ? 'Its items are added to the data on this phone (nothing here is replaced), and to your account when it syncs.'
      : 'Its items are added to the data on this phone. Nothing here is replaced.',
  restore: 'Bring it back',
  removeTitle: 'Remove it from this phone?',
  removeMessage: "This removes the copy for good. It can't be undone, and it isn't in any account you're signed in to.",
  remove: 'Remove',
};

export function ParkedCopiesGroup() {
  const [copies, setCopies] = useState<ParkedCopy[]>([]);
  const signedIn = useAuthStore((s) => !!s.session);
  const { showDialog, showToast } = useUi();
  const refresh = useCallback(() => void listParked().then(setCopies), []);
  useEffect(refresh, [refresh, signedIn]);
  if (copies.length === 0) return null;

  const open = (c: ParkedCopy) =>
    showDialog({
      title: PARKED_COPY.label(c),
      message: PARKED_COPY.explain(c),
      actions: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: PARKED_COPY.remove,
          style: 'destructive',
          onPress: () =>
            showDialog({
              title: PARKED_COPY.removeTitle,
              message: PARKED_COPY.removeMessage,
              actions: [
                { label: 'Cancel', style: 'cancel' },
                { label: PARKED_COPY.remove, style: 'destructive', onPress: () => void removeParked(c.id).then(refresh) },
              ],
            }),
        },
        {
          label: PARKED_COPY.restore,
          style: 'default',
          onPress: () =>
            showDialog({
              title: PARKED_COPY.restoreTitle,
              message: PARKED_COPY.restoreMessage(signedIn),
              actions: [
                { label: 'Cancel', style: 'cancel' },
                {
                  label: PARKED_COPY.restore,
                  style: 'default',
                  onPress: () =>
                    void bringBack(c.id)
                      .then(() => showToast({ message: 'Brought back.' }))
                      .catch((e) => showToast({ message: `Couldn't bring it back: ${e instanceof Error ? e.message : String(e)}. Nothing was changed.` }))
                      .finally(refresh),
                },
              ],
            }),
        },
      ],
    });

  return (
    <Group title={PARKED_COPY.title} footer={PARKED_COPY.footer}>
      {copies.map((c) => (
        <NavRow key={c.id} icon="albums-outline" label={PARKED_COPY.label(c)} explain={PARKED_COPY.explain(c)} onPress={() => open(c)} />
      ))}
    </Group>
  );
}
