// Reflection, below the screen: which questions a session asks (shape, length,
// never-asked first, no repeats), swap, "Ask me anything", follow-ups, coming
// back to old answers (side by side, a year ago, never pushed), the library's
// search, the gentle support card, the store, and two phones (both versions
// kept, like the journal).
// IDs: docs/test-cases/integration.md (REFLECT-*)
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { REFLECT_QUESTIONS } from '../../content';
import { SESSION_SHAPE, followUpFor, offerQuestion, planSession, swapFor, writtenThemes } from '../questions';
import { pastAnswers, questionKey, searchSessions, showSupportCard, yearAgo, isHeavyFeeling } from '../revisit';
import { useReflectionStore } from '../../store/useReflectionStore';
import { EMPTY_SYNC_STATE, KEEP_BOTH, syncOnce, type LocalData, type PushedRow, type RemoteRow, type SyncServer, type SyncState } from '../../sync/engine';
import { syncedCollections } from '../../sync/records';
import type { FeelingCheckIn, ReflectAnswer, ReflectSession } from '../../types/sections';

// A fixed order instead of Math.random, so a test reads the same every run.
const seq = () => {
  let i = 0;
  return () => ((i++ * 0.618) % 1);
};

function session(over: Omit<Partial<ReflectSession>, 'answers'> & { answers?: Partial<ReflectAnswer>[] }): ReflectSession {
  const { answers = [], ...rest } = over;
  return {
    id: 's1',
    mode: 'guided',
    title: 'Know myself',
    status: 'done',
    startedAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:30:00.000Z',
    seconds: 600,
    position: 0,
    tags: [],
    ...rest,
    answers: answers.map((a, i) => ({ ...a, id: a.id ?? `${rest.id ?? 's1'}-a${i}`, question: a.question ?? 'Q', answer: a.answer ?? '' })),
  };
}

beforeEach(() => useReflectionStore.setState({ sessions: [], supportCardShownAt: undefined }));

describe('which questions', () => {
  test.each(Object.entries(SESSION_SHAPE))('REFLECT-001 %s: the arc (arrive first, close last), the right number, no repeats', (length, shape) => {
    for (const t of writtenThemes())
      for (const depth of ['light', 'medium', 'deep'] as const) {
        const plan = planSession(t.id, depth, length as never, [], seq());
        expect(plan).toHaveLength(shape.length);
        expect(plan[0].stage).toBe('arrive');
        expect(plan[plan.length - 1].stage).toBe('close');
        expect(new Set(plan.map((q) => q.questionId)).size).toBe(plan.length);
        expect(plan.every((q) => q.depth === depth)).toBe(true);
      }
  });

  const every = writtenThemes().flatMap((t) => (['light', 'medium', 'deep'] as const).map((d) => [t.id, d] as const));
  test.each(every)('REFLECT-002 %s, %s: session after session, no question comes back until all have been asked', (theme, depth) => {
    const sessions: ReflectSession[] = [];
    const seen: string[] = [];
    const pool = REFLECT_QUESTIONS.filter((q) => q.theme === theme && q.depth === depth);
    for (let i = 0; i < 4; i++) {
      const plan = planSession(theme, depth, 'short', sessions, seq());
      seen.push(...plan.map((q) => q.questionId!));
      sessions.push(session({ id: `s${i}`, startedAt: `2026-10-0${i + 1}T09:00:00.000Z`, answers: plan.map((q) => ({ questionId: q.questionId, question: q.question })) }));
    }
    // 4 short sessions × 3 = 12, the whole pool, once each.
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(pool.length);
    // The next one starts again from the longest ago.
    const fifth = planSession(theme, depth, 'short', sessions, seq());
    expect(sessions[0].answers.map((a) => a.questionId)).toContain(fifth[0].questionId);
  });

  test('REFLECT-003 swap: the same place (theme, depth, stage), a question not already in the session', () => {
    const plan = planSession('where-i-am', 'light', 'medium', [], seq());
    const s = session({ theme: 'where-i-am', depth: 'light', answers: plan.map((q) => ({ questionId: q.questionId, question: q.question, stage: q.stage, depth: q.depth })) });
    const explore = s.answers.find((a) => a.stage === 'explore')!;
    const q = swapFor(s, explore.id, [s], seq())!;
    expect(q.stage).toBe('explore');
    expect(q.depth).toBe('light');
    expect(s.answers.map((a) => a.questionId)).not.toContain(q.questionId);
  });

  test('REFLECT-004 "Ask me anything": never a closing question, never one already in the session, unasked first', () => {
    const asked = REFLECT_QUESTIONS.filter((q) => q.depth === 'light' && q.stage !== 'close').slice(0, 5).map((q) => q.id);
    const past = [session({ answers: asked.map((id) => ({ questionId: id })) })];
    for (let i = 0; i < 10; i++) {
      const q = offerQuestion({ depth: 'light', exclude: ['where-i-am.light.01'] }, past, seq())!;
      expect(q.stage).not.toBe('close');
      expect(q.questionId).not.toBe('where-i-am.light.01');
      expect(asked).not.toContain(q.questionId);
    }
    expect(offerQuestion({ theme: 'know-myself', depth: 'deep', exclude: [] }, [], seq())!.questionId).toMatch(/^know-myself\.deep\./);
  });

  test('REFLECT-005 follow-ups: the theme\'s own or any theme\'s, never twice in one session', () => {
    const s = session({ theme: 'know-myself', answers: [{ questionId: 'know-myself.light.01' }, { questionId: 'know-myself.light.02' }] });
    const f1 = followUpFor(s, s.answers[0].id, [s], seq())!;
    s.answers[0].followUp = { ...f1, answer: '' };
    const f2 = followUpFor(s, s.answers[1].id, [s], seq())!;
    expect(f2.id).not.toBe(f1.id);
    expect(f1.id).toMatch(/^follow\.(any|know-myself)\./);
  });
});

describe('coming back to what you wrote', () => {
  const a = session({ id: 'old', startedAt: '2025-10-30T09:00:00.000Z', answers: [{ questionId: 'know-myself.light.03', question: 'What do people tend to come to you for?', answer: 'Advice' }] });
  const b = session({ id: 'new', startedAt: '2026-10-30T09:00:00.000Z', answers: [{ questionId: 'know-myself.light.03', question: 'What do people tend to come to you for?', answer: 'Calm' }] });

  test('REFLECT-010 "Answer this again": every earlier answer to the question, newest first, without the one being written', () => {
    const list = pastAnswers('know-myself.light.03', [a, b], 'x');
    expect(list.map((p) => p.answer)).toEqual(['Calm', 'Advice']);
    expect(pastAnswers('know-myself.light.03', [a, b], b.answers[0].id).map((p) => p.answer)).toEqual(['Advice']);
    // The person's own question: matched by its words.
    expect(questionKey({ question: '  What  matters? ' })).toBe(questionKey({ question: 'what matters?' }));
  });

  test('REFLECT-011 "A year ago": about a year back, finished, with something written; never a heavy question or a session begun on a heavy feeling', () => {
    expect(yearAgo([a, b], '2026-11-01', [])?.id).toBe('old');
    expect(yearAgo([{ ...a, status: 'draft' }], '2026-11-01', [])).toBeUndefined();
    expect(yearAgo([a], '2026-12-15', [])).toBeUndefined();
    const heavyQ = { ...a, answers: [...a.answers, { id: 'h', questionId: 'where-i-am.deep.03', question: 'Grieving', answer: 'Yes' }] };
    expect(yearAgo([heavyQ], '2026-11-01', [])).toBeUndefined();
    const low: FeelingCheckIn = { id: 'f1', zone: 'low', feelingIds: [], date: '2025-10-30', createdAt: '2025-10-30T09:00:00.000Z' };
    expect(yearAgo([{ ...a, feelingBefore: 'f1' }], '2026-11-01', [low])).toBeUndefined();
    // A leap day looks back to the 28th.
    expect(yearAgo([{ ...a, startedAt: '2027-02-28T09:00:00.000Z' }], '2028-02-29', [])?.id).toBe('old');
  });

  test('REFLECT-012 heavy feelings: Low at any strength, Tense only when felt strongly', () => {
    expect(isHeavyFeeling({ zone: 'low' })).toBe(true);
    expect(isHeavyFeeling({ zone: 'tense', intensities: { x: 2 } })).toBe(false);
    expect(isHeavyFeeling({ zone: 'tense', intensities: { x: 4 } })).toBe(true);
    expect(isHeavyFeeling({ zone: 'calm', intensities: { x: 5 } })).toBe(false);
  });

  test('REFLECT-013 the library: search in titles, answers, follow-ups and tags; filter by theme, own questions, tag, dates, favourites; newest first', () => {
    const own = session({ id: 'own', mode: 'free', theme: undefined, title: 'My own questions', startedAt: '2026-10-20T09:00:00.000Z', tags: ['work'], answers: [{ question: 'What next?', answer: 'A new job', followUp: { id: 'f', question: 'Smallest step?', answer: 'Update the CV' } }] });
    const fav = { ...b, answers: [{ ...b.answers[0], favorite: true }] };
    const all = [a, own, fav];
    expect(searchSessions(all, {}).map((s) => s.id)).toEqual(['new', 'own', 'old']);
    expect(searchSessions(all, { query: 'cv' }).map((s) => s.id)).toEqual(['own']);
    expect(searchSessions(all, { query: 'ADVICE' }).map((s) => s.id)).toEqual(['old']);
    expect(searchSessions(all, { theme: 'own' }).map((s) => s.id)).toEqual(['own']);
    expect(searchSessions(all, { tag: 'work' }).map((s) => s.id)).toEqual(['own']);
    expect(searchSessions(all, { from: '2026-01-01' }).map((s) => s.id)).toEqual(['new', 'own']);
    expect(searchSessions(all, { favorites: true }).map((s) => s.id)).toEqual(['new']);
  });

  test('REFLECT-014 the support card: heavy feelings on 3 of the last 7 days; at most once a week', () => {
    const f = (date: string, zone: FeelingCheckIn['zone'] = 'low'): FeelingCheckIn => ({ id: date, zone, feelingIds: [], date, createdAt: `${date}T09:00:00.000Z` });
    const two = [f('2026-10-30'), f('2026-10-31')];
    expect(showSupportCard(two, '2026-11-01', undefined)).toBe(false);
    const three = [...two, f('2026-11-01')];
    expect(showSupportCard(three, '2026-11-01', undefined)).toBe(true);
    expect(showSupportCard([...two, f('2026-11-01', 'calm')], '2026-11-01', undefined)).toBe(false);
    expect(showSupportCard(three, '2026-11-01', '2026-10-29')).toBe(false);
    expect(showSupportCard(three, '2026-11-01', '2026-10-24')).toBe(true);
    // Three heavy feelings on one day are one day.
    expect(showSupportCard([f('2026-11-01'), { ...f('2026-11-01'), id: 'b' }, { ...f('2026-11-01'), id: 'c' }], '2026-11-01', undefined)).toBe(false);
  });
});

describe('the store', () => {
  const st = () => useReflectionStore.getState();
  test('REFLECT-020 start, answer, skip, later, swap, follow-up, finish: saved as it goes, a draft until closed', () => {
    const id = st().start({ mode: 'guided', theme: 'know-myself', depth: 'light', length: 'short', title: 'Know myself', questions: planSession('know-myself', 'light', 'short', [], seq()) });
    const [q1, q2, q3] = st().sessions[0].answers;
    expect(st().sessions[0].status).toBe('draft');
    st().setAnswer(id, q1.id, 'Morning');
    st().skip(id, q2.id);
    st().later(id, q3.id);
    expect(st().sessions[0].answers.map((a) => [a.answer, !!a.skipped, !!a.later])).toEqual([['Morning', false, false], ['', true, false], ['', false, true]]);
    st().setAnswer(id, q2.id, 'Changed my mind');
    expect(st().sessions[0].answers[1].skipped).toBeUndefined();
    st().setFollowUp(id, q1.id, { id: 'follow.any.01', question: 'What would you say to a friend?' });
    st().setFollowUpAnswer(id, q1.id, 'Go for it');
    st().swap(id, q3.id, { questionId: 'know-myself.light.12', question: 'Did anything surprise you?', stage: 'close', depth: 'light' });
    expect(st().sessions[0].answers[2]).toMatchObject({ questionId: 'know-myself.light.12', answer: '', later: undefined });
    st().finish(id, { takeaway: '  Mornings matter  ', tags: ['self'] });
    expect(st().sessions[0]).toMatchObject({ status: 'done', takeaway: 'Mornings matter', tags: ['self'] });
    expect(st().sessions[0].answers[0].followUp).toEqual({ id: 'follow.any.01', question: 'What would you say to a friend?', answer: 'Go for it' });
  });

  test('REFLECT-021 time: only the seconds on the page are added; a delete takes the whole session', () => {
    const id = st().start({ mode: 'free', title: 'Mine', questions: [] });
    st().addTime(id, 15);
    st().addTime(id, -5);
    expect(st().sessions[0].seconds).toBe(15);
    st().deleteSession(id);
    expect(st().sessions).toEqual([]);
  });

  test('REFLECT-022 synced, and a conflict keeps both versions (like the journal)', () => {
    expect(KEEP_BOTH.has('reflection.sessions')).toBe(true);
    expect(syncedCollections().map((c) => c.key)).toContain('reflection.sessions');
    // The support card's date is this phone's only.
    expect(syncedCollections().map((c) => c.key)).not.toContain('reflection.supportCardShownAt');
  });
});

// Two phones, through the real sync engine and a server that refuses a write
// over a revision the phone never saw (as migration 0009 does).
function revisionServer() {
  const rows = new Map<string, RemoteRow & { rev: number }>();
  let tick = 0;
  const server: SyncServer = {
    pull: async (since, limit) => [...rows.values()].filter((r) => !since || r.server_updated_at > since).sort((x, y) => x.server_updated_at.localeCompare(y.server_updated_at)).slice(0, limit),
    push: async (batch) => {
      const back: PushedRow[] = [];
      for (const r of batch) {
        const k = `${r.collection}/${r.record_id}`;
        const old = rows.get(k);
        if (old && r.base_rev != null && r.base_rev !== old.rev) {
          back.push(old);
          continue;
        }
        const row = { collection: r.collection, record_id: r.record_id, data: r.data, deleted: r.deleted, client_updated_at: r.client_updated_at, server_updated_at: new Date(Date.UTC(2026, 10, 1, 12, 0, 0, ++tick)).toISOString(), rev: old ? old.rev + 1 : 1 };
        rows.set(k, row);
        back.push(row);
      }
      return back;
    },
  };
  return server;
}
function phone() {
  const data = new Map<string, unknown>();
  let state: SyncState = EMPTY_SYNC_STATE;
  const local: LocalData = { read: (c) => data.get(c) ?? [], write: (c, v) => void data.set(c, v) };
  return {
    list: () => (data.get('reflection.sessions') ?? []) as ReflectSession[],
    set: (v: ReflectSession[]) => data.set('reflection.sessions', v),
    sync: async (server: SyncServer) => {
      state = (await syncOnce('u1', server, state, local, () => Date.UTC(2026, 10, 1, 12))).state;
    },
  };
}

test('REFLECT-023 the same session written on two phones at once: both versions are kept, nothing lost; a delete reaches the other phone', async () => {
  const server = revisionServer();
  const a = phone();
  const b = phone();
  const s = session({ id: 'r1', answers: [{ id: 'q', questionId: 'know-myself.light.01', question: 'Smile?', answer: '' }] });
  a.set([s]);
  await a.sync(server);
  await b.sync(server);
  a.set([{ ...s, answers: [{ ...s.answers[0], answer: 'Written on A' }] }]);
  b.set([{ ...s, answers: [{ ...s.answers[0], answer: 'Written on B' }] }]);
  await a.sync(server);
  await b.sync(server);
  await a.sync(server);
  for (const p of [a, b]) {
    const texts = p.list().map((x) => x.answers[0].answer).sort();
    expect(texts).toEqual(['Written on A', 'Written on B']);
    expect(p.list().filter((x) => x.conflictCopyOf === 'r1')).toHaveLength(1);
  }
  // Deleted on A (both versions): gone on B too.
  a.set([]);
  await a.sync(server);
  await b.sync(server);
  expect(b.list()).toEqual([]);
});
