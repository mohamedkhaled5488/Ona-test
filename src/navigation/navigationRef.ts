import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

// For the few things outside any screen that need to open one (the demo tour).
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
