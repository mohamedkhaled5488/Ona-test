// The optional reminder for a dated letter: one notification at 9:00 on its
// day, with words that say nothing of the letter or of any feeling
// (LETTER_REMINDER). Scheduled on this phone only; Settings → Notifications'
// "letters" switch, quiet hours and Demo mode apply as for every reminder.
import { useLettersStore } from '../store/useLettersStore';
import { cancelReminders, scheduleAt } from '../utils/notifications';
import { isLive } from '../data/sectionsMeta';
import type { Letter } from '../types/sections';
import { LETTER_REMINDER, reminderTime } from './delivery';

export async function syncLetterReminder(letter: Letter): Promise<void> {
  const store = useLettersStore.getState();
  if (letter.notificationIds?.length) await cancelReminders(letter.notificationIds);
  const wanted = isLive('letters') && letter.kind === 'date' && letter.remind && !!letter.deliverOn && !letter.paused && !letter.hidden && !letter.deliveredAt;
  const ids = wanted ? await scheduleAt(reminderTime(letter.deliverOn!), 'letters', LETTER_REMINDER.title, LETTER_REMINDER.body) : [];
  store.setNotificationIds(letter.id, ids);
}

export async function resyncLetterReminders(): Promise<void> {
  for (const l of useLettersStore.getState().letters) await syncLetterReminder(l);
}

export async function cancelLetterReminder(letter: Letter): Promise<void> {
  if (letter.notificationIds?.length) await cancelReminders(letter.notificationIds);
}
