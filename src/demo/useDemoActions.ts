// Entering and leaving Demo mode from anywhere in the UI.
import { useUi } from '../components/UiProvider';
import { hasRealData, resetDemoData, switchDataSpace, readDemoMeta, updateDemoMeta } from '../utils/dataSpaceController';
import { setStartScreen } from '../navigation/startScreen';
import { useAuthStore } from '../store/useAuthStore';
import { resetNavigationState } from '../navigation/RootNavigator';
import { shouldOfferTour, useTourStore } from './tour';

export function useDemoActions() {
  const { showDialog, showToast } = useUi();

  const enter = async () => {
    resetNavigationState();
    setStartScreen('Main');
    await switchDataSpace('demo');
    // Once: say where changes go.
    const meta = await readDemoMeta();
    if (meta && !meta.noteSeen) {
      showToast({ message: 'Changes here stay in the demo. Your own data is untouched.' });
      await updateDemoMeta({ noteSeen: true });
    }
    // The optional tour, offered once.
    if (shouldOfferTour(meta)) useTourStore.getState().show();
  };

  const exit = async () => {
    useTourStore.getState().close();
    resetNavigationState();
    if (!useAuthStore.getState().session) setStartScreen('welcome', await hasRealData());
    await switchDataSpace('real');
  };

  const confirmExit = () =>
    showDialog({
      title: 'Leave Demo mode?',
      message: "You'll go back to your own Ona, exactly as you left it. The sample data stays here for next time.",
      actions: [
        { label: 'Stay in demo', style: 'cancel' },
        { label: 'Exit demo', style: 'default', onPress: () => void exit() },
      ],
    });

  const confirmReset = () =>
    showDialog({
      title: 'Reset the demo data?',
      message: 'The sample data goes back to how it started. Anything you changed in the demo is undone. Your own data is not affected.',
      actions: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: 'Reset',
          style: 'default',
          onPress: () =>
            void (async () => {
              resetNavigationState();
              await resetDemoData();
              showToast({ message: 'Demo data reset' });
            })(),
        },
      ],
    });

  return { enter, exit, confirmExit, confirmReset };
}
