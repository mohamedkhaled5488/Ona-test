import { buildHabitReportText, buildQuitJourneyText } from '../habitExport';
import type { FeelingCheckIn, Habit, HabitCheckIn, QuitFeelingEntry, QuitHabit, QuitTrack } from '../../types/sections';

describe('habit exports', () => {
  it('a Build report includes the schedule, stats, and every check-in with its details', () => {
    const habit: Habit = {
      id: 'h',
      name: 'Read',
      cueRoutine: 'pour my coffee',
      targetDays: 21,
      createdAt: '2026-09-28',
      reminderEnabled: false,
      reminderNotificationIds: [],
      frequency: { kind: 'weekdays', days: [1, 3, 5] },
    };
    const checkIns: HabitCheckIn[] = [
      { id: '1', habitId: 'h', date: '2026-09-28', done: true, note: 'Two chapters', durationMinutes: 25, createdAt: '' },
      { id: '2', habitId: 'h', date: '2026-09-30', done: false, reasonTags: ['Work'], createdAt: '' },
    ];
    const feelings: FeelingCheckIn[] = [
      { id: 'f', zone: 'calm', feelingIds: ['calm-calm'], date: '2026-09-28', createdAt: '', source: { kind: 'habit', refId: 'h' } },
    ];
    const text = buildHabitReportText(habit, checkIns, feelings);
    expect(text).toContain('After I pour my coffee, I will read.');
    expect(text).toContain('Mon, Wed, Fri');
    expect(text).toContain('Done · 25 min session');
    expect(text).toContain('Felt Calm');
    expect(text).toContain('Two chapters');
    expect(text).toContain('What got in the way: Work');
  });

  it('a Quit export tells the whole journey, oldest first', () => {
    const habit: QuitHabit = { id: 'q', name: 'Scrolling', why: 'Sleep better', createdAt: '2026-09-01' };
    const tracks: QuitTrack[] = [
      { id: 't1', quitHabitId: 'q', startDate: '2026-09-01', endDate: '2026-09-05', createdAt: '2026-09-01T08:00:00', status: 'archived', relapseReasonTags: ['Work'] },
      { id: 't2', quitHabitId: 'q', startDate: '2026-09-06', createdAt: '2026-09-06T08:00:00', status: 'active' },
    ];
    const entries: QuitFeelingEntry[] = [
      { id: 'e', trackId: 't2', feelingId: 'tense-stressed', zone: 'tense', isRelapseMoment: false, isResistedUrge: true, approach: 'Stretch', urgePassed: true, createdAt: '2026-09-07T22:00:00' },
    ];
    const text = buildQuitJourneyText(habit, tracks, entries, [], '2026-09-10');
    expect(text).toContain('Why: Sleep better');
    expect(text).toContain('1 urge resisted');
    // A slip reads as "a hard day" (owner's decision 2026-10-24).
    const order = ['Track 1 started', 'A hard day', 'Track 2 started', 'Resisted an urge'].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain('Stretch — the urge passed');
    expect(text).toContain('What was going on: Work');
  });
});
