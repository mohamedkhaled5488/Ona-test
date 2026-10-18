import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

// For the few things outside any screen that need to open one (the demo's
// tour offer, the Discover tour's "Try it").
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Opens a screen once the navigator is ready. Switching between your data and
// the demo remounts the navigator, so right after a switch it may not be yet.
export function navigateWhenReady(route: keyof RootStackParamList, params?: Record<string, unknown>, tries = 40): void {
  if (navigationRef.isReady()) {
    if (route === 'Main') navigationRef.navigate('Main' as never);
    else (navigationRef.navigate as (r: string, p?: object) => void)(route, params);
    return;
  }
  if (tries > 0) setTimeout(() => navigateWhenReady(route, params, tries - 1), 50);
}
