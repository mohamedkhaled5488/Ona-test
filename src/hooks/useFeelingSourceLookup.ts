import { useDailyPlanningStore } from '../store/useDailyPlanningStore';
import { useReadingListStore } from '../store/useReadingListStore';
import { useHabitsStore } from '../store/useHabitsStore';
import { useQuitHabitsStore } from '../store/useQuitHabitsStore';
import { useSkillsStore } from '../store/useSkillsStore';
import { useStudyStore } from '../store/useStudyStore';
import { formatDisplayDate } from '../utils/date';
import type { FeelingSourceLookup } from '../utils/feelingSource';

// Live names for every feature a feeling can be logged from — feeds
// describeFeelingSource in the Feelings Log.
export function useFeelingSourceLookup(): FeelingSourceLookup {
  const tasks = useDailyPlanningStore((s) => s.tasks);
  const books = useReadingListStore((s) => s.entries);
  const habits = useHabitsStore((s) => s.habits);
  const quitHabits = useQuitHabitsStore((s) => s.habits);
  const skills = useSkillsStore((s) => s.skills);
  const studySessions = useStudyStore((s) => s.sessions);

  return {
    task: (id) => {
      const t = tasks.find((x) => x.id === id);
      return t ? t.title || '' : undefined;
    },
    book: (id) => books.find((x) => x.id === id)?.book.title,
    habit: (id) => habits.find((x) => x.id === id)?.name,
    quitHabit: (id) => quitHabits.find((x) => x.id === id)?.name,
    skill: (id) => skills.find((x) => x.id === id)?.name,
    study: (id) => {
      const s = studySessions.find((x) => x.id === id);
      return s ? s.subject || formatDisplayDate(s.date) : undefined;
    },
  };
}
