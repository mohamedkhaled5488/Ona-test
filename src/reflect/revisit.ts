// Coming back to what you wrote: every answer to a question across sessions
// ("Answer this again", side by side), "A year ago you reflected on…",
// search and filters, and the gentle support card. Old answers are shown only
// when the person opens them: the year-ago prompt names the date and the
// theme, never the answer, and leaves out heavy questions and sessions that
// began on a heavy feeling.
import { REFLECT_QUESTIONS } from '../content';
import type { FeelingCheckIn, ReflectAnswer, ReflectSession } from '../types/sections';
import { addDaysISO } from '../utils/date';
import { localDateOf } from '../quit/journey';
import { themeById } from './questions';

const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');
// A question's identity: its content id, or (the person's own) its words.
export const questionKey = (a: Pick<ReflectAnswer, 'questionId' | 'question'>) => a.questionId ?? `own:${norm(a.question)}`;

export interface PastAnswer {
  sessionId: string;
  answerId: string;
  date: string; // local day the session started
  question: string;
  answer: string;
}

// Every written answer to this question, newest first (drafts included: they
// were written too).
export function pastAnswers(key: string, sessions: ReflectSession[], exceptAnswerId?: string): PastAnswer[] {
  const out: PastAnswer[] = [];
  for (const s of sessions)
    for (const a of s.answers)
      if (a.id !== exceptAnswerId && questionKey(a) === key && a.answer.trim()) out.push({ sessionId: s.id, answerId: a.id, date: localDateOf(s.startedAt), question: a.question, answer: a.answer });
  return out.sort((x, y) => (x.date === y.date ? 0 : x.date < y.date ? 1 : -1));
}

const HEAVY_QUESTIONS = new Set(REFLECT_QUESTIONS.filter((q) => q.sensitivity === 'heavy').map((q) => q.id));

// A heavy feeling: Low, or Tense felt strongly (4 or 5 of 5).
export function isHeavyFeeling(f: Pick<FeelingCheckIn, 'zone' | 'intensities'> | undefined): boolean {
  if (!f) return false;
  if (f.zone === 'low') return true;
  return f.zone === 'tense' && Object.values(f.intensities ?? {}).some((v) => (v ?? 0) >= 4);
}

// "A year ago you reflected on…": a finished session from about a year ago
// (a week either side), with something written, no heavy question, and not
// begun on a heavy feeling. The prompt shows its date and title only.
export function yearAgo(sessions: ReflectSession[], today: string, feelings: FeelingCheckIn[]): ReflectSession | undefined {
  const [y, m, d] = today.split('-');
  const centre = `${Number(y) - 1}-${m}-${m === '02' && d === '29' ? '28' : d}`;
  const from = addDaysISO(centre, -7);
  const to = addDaysISO(centre, 7);
  const byId = new Map(feelings.map((f) => [f.id, f]));
  const fits = sessions.filter((s) => {
    const day = localDateOf(s.startedAt);
    return (
      s.status === 'done' &&
      day >= from &&
      day <= to &&
      s.answers.some((a) => a.answer.trim()) &&
      !s.answers.some((a) => a.questionId && HEAVY_QUESTIONS.has(a.questionId) && a.answer.trim()) &&
      !isHeavyFeeling(s.feelingBefore ? byId.get(s.feelingBefore) : undefined)
    );
  });
  // The one closest to the day.
  const dist = (s: ReflectSession) => Math.abs(new Date(localDateOf(s.startedAt)).getTime() - new Date(centre).getTime());
  return fits.sort((a, b) => dist(a) - dist(b))[0];
}

export interface LibraryFilter {
  query?: string;
  theme?: string; // a theme id, or 'own' (Ask me anything and Free)
  tag?: string;
  from?: string;
  to?: string;
  favorites?: boolean;
}

// The library: newest first, drafts included (marked on screen).
export function searchSessions(sessions: ReflectSession[], f: LibraryFilter): ReflectSession[] {
  const q = f.query ? norm(f.query) : '';
  return sessions
    .filter((s) => {
      const day = localDateOf(s.startedAt);
      if (f.theme === 'own' ? s.mode === 'guided' : f.theme && s.theme !== f.theme) return false;
      if (f.tag && !s.tags.includes(f.tag)) return false;
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
      if (f.favorites && !s.favorite && !s.answers.some((a) => a.favorite)) return false;
      if (!q) return true;
      const text = [s.title, s.takeaway ?? '', themeById(s.theme)?.title ?? '', ...s.tags, ...s.answers.flatMap((a) => [a.question, a.answer, a.followUp?.question ?? '', a.followUp?.answer ?? ''])].join('\n');
      return norm(text).includes(q);
    })
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export const allTags = (sessions: ReflectSession[]) => [...new Set(sessions.flatMap((s) => s.tags))].sort((a, b) => a.localeCompare(b));

// The gentle support card: heavy feelings on 3 or more of the last 7 days,
// shown at most once a week (and never as a diagnosis).
export const SUPPORT_CARD_DAYS = 7;
export function showSupportCard(feelings: FeelingCheckIn[], today: string, lastShown: string | undefined): boolean {
  if (lastShown && lastShown > addDaysISO(today, -SUPPORT_CARD_DAYS)) return false;
  const from = addDaysISO(today, -6);
  const days = new Set(feelings.filter((f) => f.date >= from && f.date <= today && isHeavyFeeling(f)).map((f) => f.date));
  return days.size >= 3;
}

export const SUPPORT_CARD_COPY = {
  title: 'Things have felt heavy lately',
  line: "You've noted some hard feelings over the past few days. If it would help to talk to someone, support is here, any time.",
  action: 'See support options',
  dismiss: 'Not now',
};
