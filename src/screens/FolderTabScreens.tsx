import React from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FolderScreen } from './FolderScreen';
import { folders } from '../data/folders';
import type { RootStackParamList } from '../navigation/types';

// Thin per-tab wrappers around the one shared FolderScreen, each fixed to its
// own folder — see src/data/folders.ts for the Plan/Reflect/Grow/Learn
// contents. Typed directly against the root stack's navigation (not the tab
// navigator's) since these screens only ever need to push a section screen,
// same approach as RecapScreen.
type Props = { navigation: NativeStackNavigationProp<RootStackParamList> };

const [planFolder, reflectFolder, growFolder, learnFolder] = folders;

export function PlanFolderScreen({ navigation }: Props) {
  return <FolderScreen folder={planFolder} navigation={navigation} />;
}

export function ReflectFolderScreen({ navigation }: Props) {
  return <FolderScreen folder={reflectFolder} navigation={navigation} />;
}

export function GrowFolderScreen({ navigation }: Props) {
  return <FolderScreen folder={growFolder} navigation={navigation} />;
}

export function LearnFolderScreen({ navigation }: Props) {
  return <FolderScreen folder={learnFolder} navigation={navigation} />;
}
