// What a bug report may carry: app version, OS and phone model, and whether
// Demo mode was on. Never the device name (often the owner's name), the
// account, or anything the user (or the sample data) wrote.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { isDemo } from './dataSpace';

export function appVersion(): { version: string; build?: string } {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build = Platform.OS === 'ios' ? Constants.platform?.ios?.buildNumber ?? undefined : Platform.OS === 'android' ? String(Constants.platform?.android?.versionCode ?? '') || undefined : undefined;
  return { version, build };
}

export function diagnostics(): string {
  const { version, build } = appVersion();
  const model = Platform.OS === 'android' ? `${(Platform.constants as { Brand?: string }).Brand ?? ''} ${(Platform.constants as { Model?: string }).Model ?? ''}`.trim() : Platform.OS;
  return [`Ona ${version}${build ? ` (${build})` : ''}`, `${Platform.OS} ${String(Platform.Version)}`, model && `Device: ${model}`, isDemo() && 'Mode: Demo (sample data)']
    // Says when Demo mode was on (so a report reads in context), never anything
    // from the sample data or the user's own.
    .filter(Boolean)
    .join('\n');
}
