// What a bug report may carry: app version, OS and phone model, and whether
// Demo mode was on. Never the device name (often the owner's name), the
// account, or anything the user (or the sample data) wrote.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { isDemo } from './dataSpace';

// The commit a build was made from (set by the build: EXPO_PUBLIC_GIT_COMMIT),
// so a phone can say exactly which code it runs. Short form; none in Expo Go.
export const buildCommit = (): string | undefined => process.env.EXPO_PUBLIC_GIT_COMMIT?.slice(0, 7) || undefined;

export function appVersion(): { version: string; build?: string; commit?: string } {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build = Platform.OS === 'ios' ? Constants.platform?.ios?.buildNumber ?? undefined : Platform.OS === 'android' ? String(Constants.platform?.android?.versionCode ?? '') || undefined : undefined;
  return { version, build, commit: buildCommit() };
}

export function diagnostics(): string {
  const { version, build, commit } = appVersion();
  const model = Platform.OS === 'android' ? `${(Platform.constants as { Brand?: string }).Brand ?? ''} ${(Platform.constants as { Model?: string }).Model ?? ''}`.trim() : Platform.OS;
  return [`Ona ${version}${build ? ` (${build})` : ''}${commit ? `, ${commit}` : ''}`, `${Platform.OS} ${String(Platform.Version)}`, model && `Device: ${model}`, isDemo() && 'Mode: Demo (sample data)']
    // Says when Demo mode was on (so a report reads in context), never anything
    // from the sample data or the user's own.
    .filter(Boolean)
    .join('\n');
}
