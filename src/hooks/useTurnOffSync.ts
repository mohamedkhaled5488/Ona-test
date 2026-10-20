// "Stop keeping my data in my account": the one question, asked from
// Settings → Privacy and from the one-time notice. Sync stops at once
// (uploads check before every batch); the person chooses whether the copy
// already in the account stays or is deleted. Nothing on the phone changes.
import { useUi } from '../components/UiProvider';
import { useAuthStore } from '../store/useAuthStore';

export const TURN_OFF_DIALOG = {
  title: 'Stop keeping your data in your account?',
  signedIn: 'Sync stops right away: nothing more is sent. You can also delete the copy already in your account. Everything on this phone stays.',
  signedOut: 'Nothing is in an account yet. Ona keeps working on this phone.',
  keep: 'Keep account copy',
  delete: 'Delete account copy',
  cancel: 'Cancel',
  turnOff: 'Turn off',
};

export function useTurnOffSync() {
  const { showDialog, showToast } = useUi();
  const session = useAuthStore((s) => s.session);
  const withdraw = useAuthStore((s) => s.withdrawStoreDataConsent);

  return (opts: { onDone?: () => void; onCancel?: () => void } = {}) => {
    const run = async (deleteServer: boolean) => {
      const result = await withdraw(deleteServer);
      showToast({ message: result.ok ? (deleteServer ? 'Sync is off and the copy in your account was deleted.' : 'Sync is off. The copy in your account was kept.') : result.message });
      opts.onDone?.();
    };
    showDialog({
      title: TURN_OFF_DIALOG.title,
      message: session ? TURN_OFF_DIALOG.signedIn : TURN_OFF_DIALOG.signedOut,
      actions: session
        ? [
            { label: TURN_OFF_DIALOG.cancel, style: 'cancel', onPress: opts.onCancel },
            { label: TURN_OFF_DIALOG.keep, style: 'default', onPress: () => void run(false) },
            { label: TURN_OFF_DIALOG.delete, style: 'destructive', onPress: () => void run(true) },
          ]
        : [
            { label: TURN_OFF_DIALOG.cancel, style: 'cancel', onPress: opts.onCancel },
            { label: TURN_OFF_DIALOG.turnOff, style: 'default', onPress: () => void run(false) },
          ],
    });
  };
}
