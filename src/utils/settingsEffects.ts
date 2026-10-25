// Side effects of settings that live outside React: the audio mode, the week start used by date code, and reminders that
// depend on it. Started once, after settings have loaded from storage.
import { useSettingsStore, type SettingsData } from '../store/useSettingsStore';
import { configureAudio } from './audioEngine';
import { syncWeeklyStoryReminder } from './reminders';
import { setCalendarWeekStart, setTimeFormat } from './date';
import { applyHideInRecents } from '../hooks/useScreenPrivacy';

export function startSettingsEffects(): () => void {
  const initial = useSettingsStore.getState();
  void configureAudio({ backgroundAudio: initial.backgroundAudio, interruption: initial.interruption });
  setCalendarWeekStart(initial.weekStartsOn);
  setTimeFormat(initial.timeFormat);
  if (initial.hideInRecents) applyHideInRecents(true);

  return useSettingsStore.subscribe((s, prev) => {
    if (s.backgroundAudio !== prev.backgroundAudio || s.interruption !== prev.interruption) {
      void configureAudio({ backgroundAudio: s.backgroundAudio, interruption: s.interruption });
    }
    if (s.timeFormat !== prev.timeFormat) setTimeFormat(s.timeFormat);
    if (s.hideInRecents !== prev.hideInRecents) applyHideInRecents(s.hideInRecents);
    if (s.weekStartsOn !== prev.weekStartsOn) {
      setCalendarWeekStart(s.weekStartsOn);
      // The weekly story fires on the first day of the week.
      if (s.notify.weeklyStory) void syncWeeklyStoryReminder();
    }
  });
}
