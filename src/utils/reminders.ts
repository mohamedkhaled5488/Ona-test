// Re-applies Settings → Notifications to reminders that already exist. Each
// section's own scheduler cancels what it had and schedules afresh, and
// scheduleReminder() returns nothing when that feature's switch is off — so
// turning a switch off cancels, and turning it back on restores, exactly the
// reminders the user created.
import { useDailyPlanningStore } from '../store/useDailyPlanningStore';
import { useHabitsStore } from '../store/useHabitsStore';
import { useSkillsStore } from '../store/useSkillsStore';
import { useSleepStore } from '../store/useSleepStore';
import { useStudyStore } from '../store/useStudyStore';
import { useSettingsStore, type NotificationFeature } from '../store/useSettingsStore';
import { cancelReminders, scheduleAt, scheduleWeeklyStoryReminder } from './notifications';

export async function syncWeeklyStoryReminder(): Promise<void> {
  const { weeklyStoryNotificationIds, notify, weekStartsOn, set } = useSettingsStore.getState();
  await cancelReminders(weeklyStoryNotificationIds);
  set('weeklyStoryNotificationIds', notify.weeklyStory ? await scheduleWeeklyStoryReminder(weekStartsOn) : []);
}

export async function resyncFeature(feature: NotificationFeature): Promise<void> {
  switch (feature) {
    case 'tasks':
      await useDailyPlanningStore.getState().resyncAllReminders();
      return;
    case 'habits': {
      const habits = useHabitsStore.getState();
      const skills = useSkillsStore.getState();
      await Promise.all([
        ...habits.habits.filter((h) => h.reminderEnabled).map((h) => habits.setReminder(h.id, h.reminderTime, true)),
        ...skills.skills.filter((s) => s.reminderEnabled).map((s) => skills.setReminder(s.id, s.reminderTime, true)),
      ]);
      return;
    }
    case 'sleep': {
      const sleep = useSleepStore.getState();
      await sleep.setBedtime(sleep.bedtime.time, sleep.bedtime.enabled);
      await sleep.setWakeAlarm(sleep.wakeAlarm.time, sleep.wakeAlarm.enabled);
      return;
    }
    case 'studyEnd':
      await syncStudyEndReminder();
      return;
    case 'weeklyStory':
      await syncWeeklyStoryReminder();
      return;
  }
}

// Quiet hours and the default sound affect everything already scheduled.
export async function resyncAllReminders(): Promise<void> {
  await Promise.all((['tasks', 'habits', 'sleep', 'studyEnd', 'weeklyStory'] as NotificationFeature[]).map(resyncFeature));
}

// ---------------------------------------------------------------------------
// Study session end: the timer runs in the app, so a notification is
// scheduled for the end of the current block in case the phone is locked or
// Ona is in the background, and replaced whenever the block changes.
// ---------------------------------------------------------------------------
let studyIds: string[] = [];
let studyKey = '';

async function syncStudyEndReminder(force = true): Promise<void> {
  const active = useStudyStore.getState().active;
  const key = active && !active.isPaused ? `${active.startedAt}|${active.phase}|${active.cyclesCompleted}` : '';
  if (!force && key === studyKey) return;
  studyKey = key;
  const previous = studyIds;
  studyIds = [];
  await cancelReminders(previous);
  if (!active || active.isPaused) return;
  const at = new Date(Date.now() + active.secondsRemaining * 1000);
  const ids =
    active.phase === 'focus'
      ? await scheduleAt(at, 'studyEnd', 'Focus block done', 'Time for a break.', true)
      : await scheduleAt(at, 'studyEnd', "Break's over", 'Ready for the next focus block?', true);
  // A newer block may have started while this one was being scheduled.
  if (studyKey === key) studyIds = ids;
  else await cancelReminders(ids);
}

// Call once at startup.
export function watchStudyEndReminders(): () => void {
  return useStudyStore.subscribe((state, prev) => {
    const a = state.active;
    const b = prev.active;
    if (a?.startedAt !== b?.startedAt || a?.phase !== b?.phase || a?.isPaused !== b?.isPaused || a?.cyclesCompleted !== b?.cyclesCompleted) {
      void syncStudyEndReminder(false);
    }
  });
}
