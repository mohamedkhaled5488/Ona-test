// Reflection: sessions of questions and answers, kept for coming back to. A
// session is saved as it's written (a draft until it's closed), so nothing is
// lost if Ona is closed or killed mid-answer. Synced like the journal: a
// conflict keeps both versions (sync/engine.ts KEEP_BOTH).
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ReflectAnswer, ReflectDepth, ReflectLength, ReflectMode, ReflectSession } from '../types/sections';
import { genId } from '../utils/id';

export interface PlannedQuestion {
  questionId?: string;
  question: string;
  stage?: ReflectAnswer['stage'];
  depth?: ReflectDepth;
}

export interface StartOptions {
  mode: ReflectMode;
  title: string;
  theme?: string;
  depth?: ReflectDepth;
  length?: ReflectLength;
  questions: PlannedQuestion[];
  redoOf?: string;
  againOf?: string; // "Answer this again": the answer it revisits (one question)
}

interface ReflectionState {
  sessions: ReflectSession[];
  // When the gentle support card was last shown (this phone only, a pref).
  supportCardShownAt?: string;
  setSupportCardShown: (date: string) => void;

  start: (o: StartOptions) => string;
  setAnswer: (sessionId: string, answerId: string, text: string) => void;
  skip: (sessionId: string, answerId: string) => void;
  later: (sessionId: string, answerId: string) => void;
  // Swap: the same place in the session, another question.
  swap: (sessionId: string, answerId: string, q: PlannedQuestion) => void;
  addQuestion: (sessionId: string, q: PlannedQuestion) => string;
  removeQuestion: (sessionId: string, answerId: string) => void;
  setFollowUp: (sessionId: string, answerId: string, f: { id: string; question: string } | null) => void;
  setFollowUpAnswer: (sessionId: string, answerId: string, text: string) => void;
  goTo: (sessionId: string, position: number) => void;
  addTime: (sessionId: string, seconds: number) => void;
  setFeeling: (sessionId: string, when: 'before' | 'after', feelingId: string) => void;
  finish: (sessionId: string, closing: { takeaway?: string; tags: string[] }) => void;
  reopen: (sessionId: string) => void;
  rename: (sessionId: string, title: string) => void;
  setTakeaway: (sessionId: string, takeaway: string) => void;
  setTags: (sessionId: string, tags: string[]) => void;
  toggleFavorite: (sessionId: string, answerId?: string) => void;
  deleteSession: (sessionId: string) => void;
}

const now = () => new Date().toISOString();

function toAnswer(q: PlannedQuestion, againOf?: string): ReflectAnswer {
  return { id: genId('ranswer'), questionId: q.questionId, question: q.question, stage: q.stage, depth: q.depth, answer: '', ...(againOf ? { againOf } : {}) };
}

export const useReflectionStore = create<ReflectionState>()(
  immer((set) => {
    const edit = (sessionId: string, fn: (s: ReflectSession) => void) =>
      set((state) => {
        const s = state.sessions.find((x) => x.id === sessionId);
        if (!s) return;
        fn(s);
        s.updatedAt = now();
      });
    const editAnswer = (sessionId: string, answerId: string, fn: (a: ReflectAnswer, s: ReflectSession) => void) =>
      edit(sessionId, (s) => {
        const a = s.answers.find((x) => x.id === answerId);
        if (a) fn(a, s);
      });

    return {
      sessions: [],
      supportCardShownAt: undefined,
      setSupportCardShown: (date) =>
        set((state) => {
          state.supportCardShownAt = date;
        }),

      start: (o) => {
        const id = genId('reflection');
        const at = now();
        set((state) => {
          state.sessions.push({
            id,
            mode: o.mode,
            theme: o.theme,
            depth: o.depth,
            length: o.length,
            title: o.title,
            status: 'draft',
            startedAt: at,
            updatedAt: at,
            seconds: 0,
            answers: o.questions.map((q) => toAnswer(q, o.againOf)),
            position: 0,
            tags: [],
            ...(o.redoOf ? { redoOf: o.redoOf } : {}),
          });
        });
        return id;
      },

      setAnswer: (sessionId, answerId, text) =>
        editAnswer(sessionId, answerId, (a) => {
          a.answer = text;
          a.skipped = undefined;
          a.later = undefined;
          a.answeredAt = text.trim() ? now() : undefined;
        }),
      skip: (sessionId, answerId) =>
        editAnswer(sessionId, answerId, (a) => {
          a.skipped = true;
          a.later = undefined;
        }),
      later: (sessionId, answerId) =>
        editAnswer(sessionId, answerId, (a) => {
          a.later = true;
          a.skipped = undefined;
        }),
      swap: (sessionId, answerId, q) =>
        editAnswer(sessionId, answerId, (a) => {
          a.questionId = q.questionId;
          a.question = q.question;
          a.stage = q.stage;
          a.depth = q.depth;
          a.answer = '';
          a.skipped = undefined;
          a.later = undefined;
          a.followUp = undefined;
          a.followUpDeclined = undefined;
        }),
      addQuestion: (sessionId, q) => {
        const answer = toAnswer(q);
        edit(sessionId, (s) => {
          s.answers.push(answer);
        });
        return answer.id;
      },
      removeQuestion: (sessionId, answerId) =>
        edit(sessionId, (s) => {
          s.answers = s.answers.filter((a) => a.id !== answerId);
          s.position = Math.min(s.position, Math.max(0, s.answers.length - 1));
        }),
      setFollowUp: (sessionId, answerId, f) =>
        editAnswer(sessionId, answerId, (a) => {
          if (f) {
            a.followUp = { id: f.id, question: f.question, answer: a.followUp?.id === f.id ? a.followUp.answer : '' };
            a.followUpDeclined = undefined;
          } else {
            a.followUp = undefined;
            a.followUpDeclined = true;
          }
        }),
      setFollowUpAnswer: (sessionId, answerId, text) =>
        editAnswer(sessionId, answerId, (a) => {
          if (a.followUp) a.followUp.answer = text;
        }),
      goTo: (sessionId, position) =>
        edit(sessionId, (s) => {
          s.position = Math.max(0, Math.min(position, s.answers.length));
        }),
      addTime: (sessionId, seconds) =>
        set((state) => {
          // Not an edit: the time alone doesn't change updatedAt.
          const s = state.sessions.find((x) => x.id === sessionId);
          if (s) s.seconds += Math.max(0, Math.round(seconds));
        }),
      setFeeling: (sessionId, when, feelingId) =>
        edit(sessionId, (s) => {
          if (when === 'before') s.feelingBefore = feelingId;
          else s.feelingAfter = feelingId;
        }),
      finish: (sessionId, closing) =>
        edit(sessionId, (s) => {
          s.status = 'done';
          s.endedAt = s.endedAt ?? now();
          s.takeaway = closing.takeaway?.trim() || undefined;
          s.tags = closing.tags;
        }),
      reopen: (sessionId) =>
        edit(sessionId, (s) => {
          s.status = 'draft';
        }),
      rename: (sessionId, title) =>
        edit(sessionId, (s) => {
          if (title.trim()) s.title = title.trim();
        }),
      setTakeaway: (sessionId, takeaway) =>
        edit(sessionId, (s) => {
          s.takeaway = takeaway.trim() || undefined;
        }),
      setTags: (sessionId, tags) =>
        edit(sessionId, (s) => {
          s.tags = tags;
        }),
      toggleFavorite: (sessionId, answerId) =>
        edit(sessionId, (s) => {
          if (!answerId) {
            s.favorite = !s.favorite || undefined;
            return;
          }
          const a = s.answers.find((x) => x.id === answerId);
          if (a) a.favorite = !a.favorite || undefined;
        }),
      deleteSession: (sessionId) =>
        set((state) => {
          state.sessions = state.sessions.filter((s) => s.id !== sessionId);
        }),
    };
  })
);
