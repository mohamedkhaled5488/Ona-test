import { buildPortfolioText, metricChartSvg } from '../skillExport';
import type { PracticeSession, Skill } from '../../types/sections';

const skill: Skill = {
  id: 'run',
  name: 'Running',
  color: '#5B8FC7',
  icon: 'basketball-outline',
  startDate: '2026-06-01',
  startingLevel: 'some',
  goal: 'Sub-25 5K',
  milestones: [{ id: 'm', text: 'First sub-28', achieved: true, achievedAt: '2026-08-01' }],
  metrics: [{ id: 'k5', name: '5K time', unit: 'min', direction: 'lower', role: 'primary', createdAt: '2026-06-01' }],
  subSkills: [{ id: 'e', name: 'Endurance', level: 2, createdAt: '' }],
  reminderEnabled: false,
  reminderNotificationIds: [],
};

const sessions: PracticeSession[] = [
  { id: 'a', skillId: 'run', date: '2026-06-02', minutes: 30, hasVoiceMemo: false, createdAt: '2026-06-02T08:00:00Z', metricValues: { k5: 31 } },
  {
    id: 'b',
    skillId: 'run',
    date: '2026-09-02',
    minutes: 35,
    hasVoiceMemo: false,
    createdAt: '2026-09-02T08:00:00Z',
    metricValues: { k5: 28 },
    focusSubSkillIds: ['e'],
    difficulty: 'challenging',
    breakthrough: true,
  },
];

describe('skill export', () => {
  it('describes a faster 5K as an improvement, and includes level, goal, milestones, journey and details', () => {
    const text = buildPortfolioText(skill, sessions);
    expect(text).toContain('5K time: 31 → 28 min · 3 min better since you began');
    expect(text).toContain('Level: Some experience');
    expect(text).toContain('Goal: Sub-25 5K');
    expect(text).toContain('✓ First sub-28');
    expect(text).toContain('Journey');
    expect(text).toContain('Focus: Endurance');
    expect(text).toContain('Difficulty: Challenging');
    expect(text).toContain('Something clicked');
  });

  it('draws the metric chart only when there are at least two values', () => {
    expect(metricChartSvg([], '#000')).toBe('');
    expect(metricChartSvg([{ date: '2026-06-02', value: 31, sessionId: 'a' }, { date: '2026-09-02', value: 28, sessionId: 'b' }], '#000')).toContain('<path');
  });

  it('a bare skill with no sessions still exports', () => {
    expect(buildPortfolioText({ ...skill, metrics: [], milestones: [], goal: undefined, startingLevel: undefined }, [])).toContain('No sessions logged yet.');
  });
});
