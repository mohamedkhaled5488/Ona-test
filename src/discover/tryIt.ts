// "Try it" on a tour slide: opens the real section when there's something of
// the user's own to look at (an account or any data of their own), otherwise
// the same section in Demo mode. Demo data and real data never mix: the demo
// is a separate data space (utils/dataSpace.ts), switched as a whole.
import type { TryIt } from './content';
import { useAuthStore } from '../store/useAuthStore';
import { hasRealData } from '../utils/dataSpaceController';
import { isDemo } from '../utils/dataSpace';
import { navigateWhenReady } from '../navigation/navigationRef';
import { useDemoActions } from '../demo/useDemoActions';
import { tryItDestination } from './tryItRule';

export function useTryIt() {
  const { enter } = useDemoActions();
  return async (target: TryIt) => {
    const where = tryItDestination({ inDemo: isDemo(), signedIn: !!useAuthStore.getState().session, hasData: await hasRealData() });
    if (where === 'demo') await enter({ offerTour: false });
    navigateWhenReady(target.route, target.params);
  };
}
