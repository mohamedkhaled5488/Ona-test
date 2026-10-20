// Shown once to accounts that signed in before the "your data is kept in
// your account" sentence existed (src/sync/accountConsent.ts). "OK" records
// that they saw this wording; "Turn off" asks the same keep-or-delete
// question as Settings.
import { useEffect } from 'react';
import { useUi } from './UiProvider';
import { useTurnOffSync } from '../hooks/useTurnOffSync';
import { acknowledgeConsentNotice, useConsentStatusStore } from '../sync/accountConsent';
import { ACCOUNT_STORAGE_SENTENCE, EXISTING_ACCOUNT_NOTICE } from '../config/consentWording';

export function ConsentNotice() {
  const notice = useConsentStatusStore((s) => s.notice);
  const { showDialog } = useUi();
  const turnOff = useTurnOffSync();
  useEffect(() => {
    if (!notice) return;
    showDialog({
      title: EXISTING_ACCOUNT_NOTICE.title,
      message: ACCOUNT_STORAGE_SENTENCE,
      actions: [
        {
          label: EXISTING_ACCOUNT_NOTICE.turnOff,
          style: 'default',
          onPress: () =>
            turnOff({
              onDone: () => void acknowledgeConsentNotice(false),
              // Cancelled: ask again (the notice stays until answered).
              onCancel: () => {
                useConsentStatusStore.getState().showNotice(null);
                setTimeout(() => useConsentStatusStore.getState().showNotice(notice), 0);
              },
            }),
        },
        { label: EXISTING_ACCOUNT_NOTICE.ok, style: 'cancel', onPress: () => void acknowledgeConsentNotice(true) },
      ],
    });
  }, [notice, showDialog, turnOff]);
  return null;
}
