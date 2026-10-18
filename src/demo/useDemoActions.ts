// Entering and leaving Demo mode from anywhere in the UI.
import { useUi } from '../components/UiProvider';
import { hasRealData, resetDemoData, switchDataSpace, readDemoMeta, updateDemoMeta, type DemoMeta } from '../utils/dataSpaceController';
import { setStartScreen } from '../navigation/startScreen';
import { useAuthStore } from '../store/useAuthStore';
import { resetNavigationState } from '../navigation/RootNavigator';
import { navigateWhenReady } from '../navigation/navigationRef';
import { track } from '../utils/analytics';
import { t } from '../discover/content';

// The Discover tour is offered once on entering the demo: only if it hasn't
// been offered (or taken) before. Kept in the demo's meta, which survives
// "Reset demo data".
export const shouldOfferTour = (meta: Pick<DemoMeta, 'tourDone'> | null): boolean => !!meta && !meta.tourDone;

export function useDemoActions() {
  const { showDialog, showToast } = useUi();

  // `offerTour: false` when arriving from the tour itself ("Try it").
  const enter = async (opts: { offerTour?: boolean } = {}) => {
    // Sent before switching: nothing is sent from inside the demo.
    track('demo_started');
    resetNavigationState();
    setStartScreen('Main');
    await switchDataSpace('demo');
    // Once: say where changes go.
    const meta = await readDemoMeta();
    if (meta && !meta.noteSeen) {
      showToast({ message: 'Changes here stay in the demo. Your own data is untouched.' });
      await updateDemoMeta({ noteSeen: true });
    }
    if (opts.offerTour === false) {
      if (meta && !meta.tourDone) await updateDemoMeta({ tourDone: true });
      return;
    }
    // The Discover tour, offered once.
    if (shouldOfferTour(meta)) {
      await updateDemoMeta({ tourDone: true });
      showDialog({
        title: t('demoOffer'),
        message: t('demoOfferBody'),
        actions: [
          { label: t('notNow'), style: 'cancel' },
          { label: t('takeTour'), style: 'default', onPress: () => navigateWhenReady('discoverTour', {}) },
        ],
      });
    }
  };

  const exit = async () => {
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
