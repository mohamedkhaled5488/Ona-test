import { StackActions, createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';
import type { SectionId } from '../types/sections';

// For the few things outside any screen that need to open one (the demo's
// tour offer, the Discover tour's "Try it"), and for openSection below.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// The one way to open another screen or section, from anywhere (Recap's links
// and area pages, a folder, Discover and the tour's "Try it", Settings, a
// section's link to another): it's pushed on top of where the person is, so
// Back returns there, with that screen as it was. ("navigate" would reuse a
// copy already further back and drop the screens in between.) "Main" (Home and
// the tabs) is the root, so it goes back to it instead.
// Waits for the navigator if it isn't ready (right after a switch between
// your data and the demo it remounts).
export function openSection(route: keyof RootStackParamList | SectionId, params?: object, tries = 40): void {
  if (navigationRef.isReady()) {
    // Recap is Home.
    if (route === 'Main' || route === 'recap') navigationRef.navigate('Main' as never);
    else navigationRef.dispatch(StackActions.push(route, params));
    return;
  }
  if (tries > 0) setTimeout(() => openSection(route, params, tries - 1), 50);
}

// The older name, kept for the callers outside screens.
export const navigateWhenReady = (route: keyof RootStackParamList, params?: Record<string, unknown>) => openSection(route, params);
