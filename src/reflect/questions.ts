// Which questions a reflection asks. Pure functions over the content
// (src/content) and the person's own sessions, so the choice can be tested:
// - A guided session has a shape (arrive, explore, deepen, close) and a length.
// - Questions never asked come first, then the ones asked longest ago, so the
//   same question doesn't come back soon (the library has 12+ per theme and
//   depth; content.test.ts).
// - Swap, follow-ups and "Ask me anything" follow the same rule.
import { FOLLOW_UPS, REFLECT_QUESTIONS, REFLECT_THEMES } from '../content';
import type { ReflectQuestion, Stage } from '../content/types';
import type { PlannedQuestion } from '../store/useReflectionStore';
import type { ReflectDepth, ReflectLength, ReflectMode, ReflectSession } from '../types/sections';
import { FREE_REFLECT_THEMES } from '../config/plans';

// About 5, 15 and 30 minutes.
export const SESSION_SHAPE: Record<ReflectLength, Stage[]> = {
  short: ['arrive', 'explore', 'close'],
  medium: ['arrive', 'explore', 'explore', 'explore', 'deepen', 'close'],
  long: ['arrive', 'arrive', 'explore', 'explore', 'explore', 'explore', 'explore', 'deepen', 'deepen', 'close'],
};

export const LENGTH_LABEL: Record<ReflectLength, { title: string; line: string }> = {
  short: { title: 'Short', line: 'About 5 minutes, 3 questions' },
  medium: { title: 'Medium', line: 'About 15 minutes, 6 questions' },
  long: { title: 'Long', line: 'About 30 minutes, 10 questions' },
};

export const DEPTH_LABEL: Record<ReflectDepth, { title: string; line: string }> = {
  light: { title: 'Light', line: 'Easy, everyday questions' },
  medium: { title: 'Medium', line: 'A little more searching' },
  deep: { title: 'Deep', line: 'Questions that go further. Skip any of them.' },
};

export type Rand = () => number;

export const writtenThemes = () => REFLECT_THEMES.filter((t) => t.written);
// The themes this plan opens (config/plans.ts): every written one with Plus.
export const themesFor = (plus: boolean) => writtenThemes().filter((t) => plus || FREE_REFLECT_THEMES.includes(t.id));
export const themeById = (id: string | undefined) => REFLECT_THEMES.find((t) => t.id === id);
export const questionById = (id: string | undefined) => REFLECT_QUESTIONS.find((q) => q.id === id);

export const asPlanned = (q: ReflectQuestion): PlannedQuestion => ({ questionId: q.id, question: q.text, stage: q.stage, depth: q.depth });

// When each question was last asked (its session's start), across sessions.
export function lastAsked(sessions: ReflectSession[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of sessions)
    for (const a of s.answers) {
      if (!a.questionId) continue;
      const prev = out.get(a.questionId);
      if (!prev || prev < s.startedAt) out.set(a.questionId, s.startedAt);
      if (a.followUp) {
        const f = out.get(a.followUp.id);
        if (!f || f < s.startedAt) out.set(a.followUp.id, s.startedAt);
      }
    }
  return out;
}

// Never asked first, then longest ago; ties in a random order.
function freshest<T extends { id: string }>(items: T[], asked: Map<string, string>, rand: Rand): T[] {
  const keyed = items.map((x) => ({ x, when: asked.get(x.id) ?? '', r: rand() }));
  keyed.sort((a, b) => (a.when === b.when ? a.r - b.r : a.when < b.when ? -1 : 1));
  return keyed.map((k) => k.x);
}

// When every question of a stage has been asked before, its neighbour's can
// stand in, so a short session doesn't keep ending on the same question.
const NEIGHBOURS: Record<Stage, Stage[]> = { arrive: ['explore'], explore: ['arrive', 'deepen'], deepen: ['explore'], close: ['deepen', 'explore'] };

export function planSession(theme: string, depth: ReflectDepth, length: ReflectLength, sessions: ReflectSession[], rand: Rand = Math.random): PlannedQuestion[] {
  const pool = REFLECT_QUESTIONS.filter((q) => q.theme === theme && q.depth === depth);
  const asked = lastAsked(sessions);
  const chosen: ReflectQuestion[] = [];
  for (const stage of SESSION_SHAPE[length]) {
    const unused = pool.filter((q) => !chosen.includes(q));
    const own = unused.filter((q) => q.stage === stage);
    const allAsked = own.every((q) => asked.has(q.id));
    // Only never-asked neighbours stand in.
    const withNeighbour = allAsked ? [...own, ...unused.filter((q) => NEIGHBOURS[stage].includes(q.stage) && !asked.has(q.id))] : own;
    // Short of both, any explore question, then any.
    const options = [withNeighbour, unused.filter((q) => q.stage === 'explore'), unused].find((l) => l.length > 0);
    if (!options) break;
    chosen.push(freshest(options, asked, rand)[0]);
  }
  return chosen.map(asPlanned);
}

// Another question for the same place: same theme, depth and stage, not
// already in the session.
export function swapFor(session: ReflectSession, answerId: string, sessions: ReflectSession[], rand: Rand = Math.random): PlannedQuestion | undefined {
  const a = session.answers.find((x) => x.id === answerId);
  const current = questionById(a?.questionId);
  const inSession = new Set(session.answers.map((x) => x.questionId).filter(Boolean));
  const theme = current?.theme ?? session.theme;
  const depth = current?.depth ?? session.depth ?? 'light';
  const pool = REFLECT_QUESTIONS.filter((q) => (!theme || q.theme === theme) && q.depth === depth && !inSession.has(q.id));
  const sameStage = pool.filter((q) => q.stage === (current?.stage ?? 'explore'));
  const list = sameStage.length ? sameStage : pool;
  return list.length ? asPlanned(freshest(list, lastAsked(sessions), rand)[0]) : undefined;
}

// "Ask me anything": one question at a time, from a chosen theme or any
// written one, at a depth. Not one already in this session; never asked
// first; among those, themes the person has chosen before come first.
export function offerQuestion(opts: { theme?: string; depth: ReflectDepth; exclude: string[]; themes?: string[] }, sessions: ReflectSession[], rand: Rand = Math.random): PlannedQuestion | undefined {
  const themes = opts.theme ? [opts.theme] : writtenThemes().map((t) => t.id).filter((id) => !opts.themes || opts.themes.includes(id));
  const pool = REFLECT_QUESTIONS.filter((q) => themes.includes(q.theme) && q.depth === opts.depth && q.stage !== 'close' && !opts.exclude.includes(q.id));
  if (!pool.length) return undefined;
  const asked = lastAsked(sessions);
  const used = new Set(sessions.map((s) => s.theme).filter(Boolean));
  const order = freshest(pool, asked, rand);
  const neverAsked = order.filter((q) => !asked.has(q.id));
  const familiar = neverAsked.filter((q) => used.has(q.theme));
  return asPlanned((familiar[0] ?? neverAsked[0] ?? order[0])!);
}

// One optional follow-up after an answer: the theme's own or one for any
// theme, not yet used in this session, the one used longest ago first.
export function followUpFor(session: ReflectSession, answerId: string, sessions: ReflectSession[], rand: Rand = Math.random): { id: string; question: string } | undefined {
  const a = session.answers.find((x) => x.id === answerId);
  const theme = questionById(a?.questionId)?.theme ?? session.theme;
  const used = new Set(session.answers.map((x) => x.followUp?.id).filter(Boolean));
  const pool = FOLLOW_UPS.filter((f) => (f.themes.length === 0 || (theme && f.themes.includes(theme))) && !used.has(f.id));
  if (!pool.length) return undefined;
  const f = freshest(pool, lastAsked(sessions), rand)[0];
  return { id: f.id, question: f.text };
}

export function defaultTitle(mode: ReflectMode, theme?: string): string {
  if (mode === 'guided') return themeById(theme)?.title ?? 'A reflection';
  if (mode === 'ask') return 'Questions for me';
  return 'My own questions';
}

// The answers still to come back to ("Come back later"), in order.
export const laterAnswers = (s: ReflectSession) => s.answers.filter((a) => a.later && !a.answer.trim());
