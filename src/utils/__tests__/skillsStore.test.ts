// Skills, through the real store: create, set up, practise, milestones,
// resources, reminders, archive and delete (with what happens to sessions and
// reminders), and that it survives a relaunch. IDs: docs/test-cases/skills.md
const mockScheduled: string[][] = [];
const mockCancelled: string[][] = [];
jest.mock('../notifications', () => ({
  cancelReminders: jest.fn(async (ids: string[]) => {
    mockCancelled.push(ids);
  }),
  scheduleReminder: jest.fn(async () => {
    const ids = [`n${mockScheduled.length + 1}`];
    mockScheduled.push(ids);
    return ids;
  }),
}));

import { resetAll, useClock, restoreClock } from '../../test-utils';
import { useSkillsStore } from '../../store/useSkillsStore';
import { startAppData, __flushForTests } from '../dataSpaceController';
import { hydrateLocalData } from '../localPersistence';
import { totalMinutesFor, buildJourney, metricSeries, primaryMetric } from '../skillProgress';

const s = () => useSkillsStore.getState();

beforeEach(async () => {
  await resetAll();
  mockScheduled.length = 0;
  mockCancelled.length = 0;
  useClock('2026-10-18T19:00');
});
afterEach(() => restoreClock());

const newSkill = (name = 'Guitar') => s().addSkill(name, '#3D8B7A', 'musical-notes-outline', undefined, '2026-09-01');

describe('SKL-S: the Skills store', () => {
  test('SKL-S-001 a skill with just a name works', () => {
    const id = newSkill();
    expect(s().skills[0]).toMatchObject({ id, name: 'Guitar', milestones: [], reminderEnabled: false });
  });

  test('SKL-S-002 a session with or without the timer; minutes never negative or fractional; totals add up', () => {
    const id = newSkill();
    s().addSession(id, { minutes: 25.6 });
    s().addSession(id, { minutes: 0, notes: 'No timer, just notes' });
    s().addSession(id, { minutes: -5 });
    expect(s().sessions.map((x) => x.minutes).sort()).toEqual([0, 0, 26]);
    expect(totalMinutesFor(s().sessions, id)).toBe(26);
  });

  test('SKL-S-003 a timed session that runs past midnight belongs to the day it started', () => {
    const id = newSkill();
    s().addSession(id, { minutes: 90, startedAt: new Date(2026, 9, 18, 23, 30).toISOString() });
    expect(s().sessions[0].date).toBe('2026-10-18');
  });

  test('SKL-S-004 metric values that aren\'t numbers are dropped, not stored', () => {
    const id = newSkill();
    const metric = s().addMetric(id, { name: 'Clean changes', unit: 'per minute', direction: 'higher' }, 'primary')!;
    s().addSession(id, { minutes: 20, metricValues: { [metric]: 12, other: Number.NaN } });
    expect(s().sessions[0].metricValues).toEqual({ [metric]: 12 });
    expect(metricSeries(s().sessions, id, metric)).toHaveLength(1);
  });

  test('SKL-S-005 a new primary metric archives the old one and keeps its values', () => {
    const id = newSkill();
    const a = s().addMetric(id, { name: 'WPM', unit: 'wpm', direction: 'higher' }, 'primary')!;
    s().addSession(id, { minutes: 10, metricValues: { [a]: 40 } });
    const b = s().addMetric(id, { name: 'Accuracy', unit: '%', direction: 'higher' }, 'primary')!;
    const skill = s().skills[0];
    expect(primaryMetric(skill)?.id).toBe(b);
    expect(skill.metrics!.find((m) => m.id === a)?.archivedAt).toBe('2026-10-18');
    expect(metricSeries(s().sessions, id, a)).toHaveLength(1); // the old values are kept
  });

  test('SKL-S-006 milestones: blank ones are ignored; achieving records the date and reflection; untoggling clears it', () => {
    const id = newSkill();
    s().addMilestone(id, '   ');
    s().addMilestone(id, 'First full song');
    const m = s().skills[0].milestones[0];
    expect(s().skills[0].milestones).toHaveLength(1);
    s().achieveMilestone(id, m.id, { reflection: '  Slow but done  ' });
    expect(s().skills[0].milestones[0]).toMatchObject({ achieved: true, achievedAt: '2026-10-18', reflection: 'Slow but done' });
    s().toggleMilestone(id, m.id);
    expect(s().skills[0].milestones[0]).toMatchObject({ achieved: false, achievedAt: undefined });
  });

  test('SKL-S-007 resources: finishing records the date once; reopening clears it', () => {
    const id = newSkill();
    s().addResource(id, 'Chord book', 'book');
    const r = s().skills[0].resources![0];
    s().setResourceStatus(id, r.id, 'done');
    expect(s().skills[0].resources![0].doneAt).toBe('2026-10-18');
    s().setResourceStatus(id, r.id, 'inProgress');
    expect(s().skills[0].resources![0].doneAt).toBeUndefined();
  });

  test('SKL-S-008 levels are recorded for the Journey', () => {
    const id = newSkill();
    s().setLevel(id, 'some');
    s().setLevel(id, 'intermediate');
    expect(buildJourney(s().skills[0], s().sessions).filter((e) => e.kind === 'level')).toHaveLength(2);
  });

  test('SKL-S-009 a reminder is scheduled, and replaced (old one cancelled) when the time changes; off cancels it', async () => {
    const id = newSkill();
    await s().setReminder(id, '18:00', true);
    expect(s().skills[0]).toMatchObject({ reminderTime: '18:00', reminderEnabled: true, reminderNotificationIds: ['n1'] });
    await s().setReminder(id, '19:30', true);
    expect(mockCancelled).toContainEqual(['n1']);
    expect(s().skills[0].reminderNotificationIds).toEqual(['n2']);
    await s().setReminder(id, '19:30', false);
    expect(mockCancelled).toContainEqual(['n2']);
    expect(s().skills[0].reminderNotificationIds).toEqual([]);
  });

  test('SKL-S-010 archiving keeps everything and turns the reminder off', async () => {
    const id = newSkill();
    s().addSession(id, { minutes: 30 });
    await s().setReminder(id, '18:00', true);
    s().archiveSkill(id);
    expect(s().skills[0]).toMatchObject({ archivedAt: '2026-10-18', reminderEnabled: false, reminderNotificationIds: [] });
    expect(mockCancelled).toContainEqual(['n1']);
    expect(s().sessions).toHaveLength(1);
    s().unarchiveSkill(id);
    expect(s().skills[0].archivedAt).toBeUndefined();
  });

  test('SKL-S-011 deleting a skill removes its sessions (only its own) and cancels its reminder', async () => {
    const a = newSkill('Guitar');
    const b = newSkill('Sketching');
    s().addSession(a, { minutes: 30 });
    s().addSession(b, { minutes: 15 });
    await s().setReminder(a, '18:00', true);
    s().deleteSkill(a);
    expect(s().skills.map((x) => x.name)).toEqual(['Sketching']);
    expect(s().sessions.map((x) => x.skillId)).toEqual([b]);
    expect(mockCancelled).toContainEqual(['n1']);
  });

  test('SKL-S-012 Arabic and emoji names, and everything survives a relaunch', async () => {
    await startAppData(undefined, false);
    const id = newSkill('🎸 العزف على الجيتار');
    s().addSession(id, { minutes: 20, notes: 'تمرين الأوتار' });
    s().addMilestone(id, 'أول أغنية');
    await __flushForTests();
    useSkillsStore.setState({ skills: [], sessions: [] });
    await hydrateLocalData(undefined, false);
    expect(s().skills[0]).toMatchObject({ name: '🎸 العزف على الجيتار' });
    expect(s().skills[0].milestones[0].text).toBe('أول أغنية');
    expect(s().sessions[0]).toMatchObject({ minutes: 20, notes: 'تمرين الأوتار' });
  });
});
