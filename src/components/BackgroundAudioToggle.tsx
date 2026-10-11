import React from 'react';
import { SettingSwitch } from './SettingSwitch';
import { useSettingsStore } from '../store/useSettingsStore';

// One app-wide setting shared by Study and Sleep (they play through the same
// audio engine): keep ambient sound going when the app is in the background.
export function BackgroundAudioToggle({ accent }: { accent: string }) {
  const backgroundAudio = useSettingsStore((s) => s.backgroundAudio);
  const setBackgroundAudio = useSettingsStore((s) => s.setBackgroundAudio);
  return (
    <SettingSwitch
      label="Keep playing when the app is in the background"
      value={backgroundAudio}
      onValueChange={setBackgroundAudio}
      accent={accent}
    />
  );
}
