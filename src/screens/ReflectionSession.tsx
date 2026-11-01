// Reflection: setting up a guided session, the session itself (one question at
// a time), and its closing. Everything is saved as it's typed: a session is a
// draft until it's closed, so leaving, or Ona being killed, loses nothing.
import React, { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { Body, Caption, Eyebrow, ScreenTitle, SectionHeading } from '../components/Typography';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextInput } from '../components/TextInput';
import { ItemFeelingPrompt } from '../components/ItemFeelingSheet';
import { SupportLink } from '../components/SupportLink';
import { colors, radii, spacing, fontSizes } from '../theme';
import { themedStyles } from '../theme/runtime';
import { sectionAccents } from '../theme/accents';
import { useReflectionStore } from '../store/useReflectionStore';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { REFLECT_CLOSING } from '../content';
import { DEPTH_LABEL, LENGTH_LABEL, defaultTitle, followUpFor, laterAnswers, offerQuestion, planSession, swapFor, themeById, themesFor, writtenThemes } from '../reflect/questions';
import { pastAnswers, questionKey } from '../reflect/revisit';
import { formatDisplayDate } from '../utils/date';
import { isLive } from '../data/sectionsMeta';
import { openSection } from '../navigation/navigationRef';
import type { ReflectDepth, ReflectLength, ReflectSession } from '../types/sections';
import { PlusGate } from '../components/PlusGate';
import { isPlusNow, usePlus } from '../plans/access';

const accent = sectionAccents.reflection;

export const REFLECT_COPY = {
  guided: 'Guided',
  guidedLine: 'Pick a theme and a length',
  ask: 'Ask me anything',
  askLine: 'One question at a time; swap it, or ask your own',
  free: 'Blank page',
  freeLine: 'Your own question, your own answer',
  start: 'Start',
  arriving: 'How are you arriving?',
  arrivingContext: 'Before you start (optional)',
  leaving: 'How are you leaving?',
  leavingContext: 'After this session (optional)',
  skip: 'Skip',
  swap: 'Swap',
  later: 'Come back later',
  next: 'Next',
  finish: 'Finish',
  progress: (i: number, n: number) => `Question ${i} of ${n}`,
  answerPlaceholder: 'Write as much or as little as you like',
  ownQuestion: 'Write my own question',
  ownQuestionPlaceholder: 'Your question',
  addQuestion: 'Add another question',
  followUpIntro: 'One more, if you like',
  followUpYes: 'Answer it',
  followUpNo: 'No thanks',
  pastPrompt: (n: number) => `You've answered this before${n > 1 ? ` (${n} times)` : ''}. See it?`,
  pastHide: 'Hide',
  pastTitle: (date: string) => `You wrote, on ${date}:`,
  laterTitle: (n: number) => `You saved ${n === 1 ? 'a question' : `${n} questions`} for later`,
  laterLine: 'Answer them now, or leave them. Either is fine.',
  laterOpen: 'Go to it',
  tags: 'Tags (optional)',
  tagsPlaceholder: 'e.g. work, family',
  save: 'Save',
  savedDraft: 'Saved as a draft. Pick it up any time.',
  leaveForNow: 'Leave for now (it stays saved)',
  deleteDraft: 'Delete this draft',
  nothingYet: 'Nothing written yet. Saving it anyway keeps the questions.',
};

function Chip({ label, selected, onPress, testID }: { label: string; selected?: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && { backgroundColor: accent, borderColor: accent }]} accessibilityRole="radio" accessibilityState={{ selected: !!selected }} testID={testID}>
      <Body style={selected ? styles.chipTextActive : undefined}>{label}</Body>
    </Pressable>
  );
}

// --- Guided: theme, length, depth -------------------------------------------
export function SetupStage({ onStart }: { onStart: (sessionId: string) => void }) {
  const sessions = useReflectionStore((s) => s.sessions);
  const start = useReflectionStore((s) => s.start);
  const plus = usePlus();
  const themes = themesFor(plus);
  const locked = writtenThemes().filter((t) => !themes.includes(t));
  const [theme, setTheme] = useState(themes[0]?.id);
  const [length, setLength] = useState<ReflectLength>('short');
  const [depth, setDepth] = useState<ReflectDepth>('light');
  const go = () => {
    if (!theme) return;
    const questions = planSession(theme, depth, length, sessions);
    onStart(start({ mode: 'guided', theme, depth, length, title: defaultTitle('guided', theme), questions }));
  };
  return (
    <View style={styles.gap}>
      <ScreenTitle>{REFLECT_COPY.guided}</ScreenTitle>
      <SectionHeading>Theme</SectionHeading>
      {themes.map((t) => (
        <Pressable key={t.id} onPress={() => setTheme(t.id)} accessibilityRole="radio" accessibilityState={{ selected: theme === t.id }} testID={`reflect-theme-${t.id}`}>
          <Card style={[styles.option, theme === t.id && { borderColor: accent }]}>
            <Body style={styles.bold}>{t.title}</Body>
            <Caption>{t.line}</Caption>
          </Card>
        </Pressable>
      ))}
      {locked.length > 0 && (
        <PlusGate feature="reflectAllThemes">
          <></>
        </PlusGate>
      )}
      <SectionHeading>Length</SectionHeading>
      <View style={styles.chipRow}>
        {(Object.keys(LENGTH_LABEL) as ReflectLength[]).map((l) => (
          <Chip key={l} label={LENGTH_LABEL[l].title} selected={length === l} onPress={() => setLength(l)} testID={`reflect-length-${l}`} />
        ))}
      </View>
      <Caption>{LENGTH_LABEL[length].line}</Caption>
      <SectionHeading>Depth</SectionHeading>
      <View style={styles.chipRow}>
        {(Object.keys(DEPTH_LABEL) as ReflectDepth[]).map((d) => (
          <Chip key={d} label={DEPTH_LABEL[d].title} selected={depth === d} onPress={() => setDepth(d)} testID={`reflect-depth-${d}`} />
        ))}
      </View>
      <Caption>{DEPTH_LABEL[depth].line}</Caption>
      <PrimaryButton label={REFLECT_COPY.start} onPress={go} disabled={!theme} style={styles.topGap} />
      <SupportLink />
    </View>
  );
}

// Counts the time spent on a session's pages while Ona is in front.
function useSessionTime(sessionId: string) {
  const addTime = useReflectionStore((s) => s.addTime);
  useEffect(() => {
    let last = Date.now();
    let active = AppState.currentState !== 'background';
    const tick = () => {
      const t = Date.now();
      if (active) addTime(sessionId, Math.min(60, (t - last) / 1000));
      last = t;
    };
    const id = setInterval(tick, 15_000);
    const sub = AppState.addEventListener('change', (s) => {
      tick();
      active = s === 'active';
    });
    return () => {
      tick();
      clearInterval(id);
      sub.remove();
    };
  }, [sessionId, addTime]);
}

// --- One question at a time --------------------------------------------------
export function SessionStage({ sessionId, onClose, onLeave }: { sessionId: string; onClose: () => void; onLeave: () => void }) {
  const session = useReflectionStore((s) => s.sessions.find((x) => x.id === sessionId));
  const sessions = useReflectionStore((s) => s.sessions);
  const store = useReflectionStore();
  const [arrivingAsked, setArrivingAsked] = useState(() => !!session?.feelingBefore || (session?.answers.some((a) => a.answer.trim()) ?? false));
  const [showPast, setShowPast] = useState(false);
  const [ownDraft, setOwnDraft] = useState('');
  useSessionTime(sessionId);

  if (!session) return null;
  const n = session.answers.length;
  const atEnd = session.position >= n;
  const answer = atEnd ? undefined : session.answers[session.position];
  const theme = themeById(session.theme);
  const past = answer ? pastAnswers(questionKey(answer), sessions, answer.id) : [];
  const deep = answer?.depth === 'deep';
  const written = !!answer?.answer.trim();

  const goTo = (i: number) => {
    setShowPast(false);
    store.goTo(sessionId, i);
  };
  const next = () => {
    if (session.mode === 'ask' && session.position === n - 1) {
      // Ask me anything: another question, unless they finish.
      const q = offerQuestion({ theme: session.theme, depth: session.depth ?? 'light', exclude: session.answers.map((a) => a.questionId!).filter(Boolean), themes: themesFor(isPlusNow()).map((t) => t.id) }, sessions);
      if (q) store.addQuestion(sessionId, q);
    }
    goTo(session.position + 1);
  };
  const offerFollowUp = () => {
    if (!answer || answer.followUp || answer.followUpDeclined) return;
    const f = followUpFor(session, answer.id, sessions);
    if (f) store.setFollowUp(sessionId, answer.id, f);
  };

  return (
    <View style={styles.gap}>
      <ItemFeelingPrompt
        visible={!arrivingAsked}
        source={{ kind: 'reflect', refId: sessionId, phase: 'before' }}
        context={REFLECT_COPY.arrivingContext}
        heading={REFLECT_COPY.arriving}
        gentle
        onDone={() => setArrivingAsked(true)}
        onSaved={() => {
          const latest = useFeelingsStore.getState().entries.filter((e) => e.source?.kind === 'reflect' && e.source.refId === sessionId).pop();
          if (latest) store.setFeeling(sessionId, 'before', latest.id);
        }}
      />
      <Eyebrow>{theme?.title ?? session.title}</Eyebrow>
      {session.position === 0 && theme && <Caption>{theme.opening}</Caption>}

      {answer && (
        <>
          {n > 1 && <Caption accessibilityLabel={REFLECT_COPY.progress(session.position + 1, n)}>{REFLECT_COPY.progress(session.position + 1, n)}</Caption>}
          {deep && <Caption style={styles.note}>{REFLECT_CLOSING.deepNote}</Caption>}
          {session.mode === 'free' && !answer.question ? null : (
            <SectionHeading style={styles.question} accessibilityRole="header">
              {answer.question}
            </SectionHeading>
          )}
          <TextInput
            value={answer.answer}
            onChangeText={(t) => store.setAnswer(sessionId, answer.id, t)}
            onBlur={offerFollowUp}
            placeholder={REFLECT_COPY.answerPlaceholder}
            multiline
            textAlignVertical="top"
            style={styles.answer}
            accessibilityLabel={`Your answer to: ${answer.question}`}
            testID="reflect-answer"
          />
          {past.length > 0 &&
            (showPast ? (
              <PlusGate feature="reflectAnswerAgain">
              <Card style={styles.past}>
                {past.map((p) => (
                  <View key={p.answerId} style={styles.pastItem}>
                    <Caption>{REFLECT_COPY.pastTitle(formatDisplayDate(p.date))}</Caption>
                    <Body>{p.answer}</Body>
                  </View>
                ))}
                <Pressable onPress={() => setShowPast(false)} accessibilityRole="button" style={styles.link}>
                  <Caption>{REFLECT_COPY.pastHide}</Caption>
                </Pressable>
              </Card>
              </PlusGate>
            ) : (
              <Pressable onPress={() => setShowPast(true)} accessibilityRole="button" style={styles.link} testID="reflect-past">
                <Caption>{REFLECT_COPY.pastPrompt(past.length)}</Caption>
              </Pressable>
            ))}

          {answer.followUp ? (
            <Card style={styles.follow}>
              <Caption>{REFLECT_COPY.followUpIntro}</Caption>
              <Body style={styles.bold}>{answer.followUp.question}</Body>
              <TextInput
                value={answer.followUp.answer}
                onChangeText={(t) => store.setFollowUpAnswer(sessionId, answer.id, t)}
                placeholder={REFLECT_COPY.answerPlaceholder}
                multiline
                textAlignVertical="top"
                style={styles.followAnswer}
                accessibilityLabel={`Your answer to: ${answer.followUp.question}`}
              />
              {!answer.followUp.answer.trim() && (
                <Pressable onPress={() => store.setFollowUp(sessionId, answer.id, null)} accessibilityRole="button" style={styles.link}>
                  <Caption>{REFLECT_COPY.followUpNo}</Caption>
                </Pressable>
              )}
            </Card>
          ) : (
            written &&
            !answer.followUpDeclined && (
              <Pressable onPress={offerFollowUp} accessibilityRole="button" style={styles.link} testID="reflect-follow-up">
                <Caption>{REFLECT_COPY.followUpIntro}…</Caption>
              </Pressable>
            )
          )}

          <View style={styles.actions}>
            <Chip
              label={REFLECT_COPY.skip}
              testID="reflect-skip"
              onPress={() => {
                store.skip(sessionId, answer.id);
                next();
              }}
            />
            {answer.questionId && (
              <Chip
                label={REFLECT_COPY.swap}
                testID="reflect-swap"
                onPress={() => {
                  const q = swapFor(session, answer.id, sessions);
                  if (q) store.swap(sessionId, answer.id, q);
                }}
              />
            )}
            <Chip
              label={REFLECT_COPY.later}
              testID="reflect-later"
              onPress={() => {
                store.later(sessionId, answer.id);
                next();
              }}
            />
          </View>
          <PrimaryButton label={session.position < n - 1 || session.mode === 'ask' ? REFLECT_COPY.next : REFLECT_COPY.finish} onPress={next} testID="reflect-next" />
          {session.mode === 'ask' && (
            <Pressable onPress={() => goTo(n)} accessibilityRole="button" style={styles.link}>
              <Caption>{REFLECT_COPY.finish}</Caption>
            </Pressable>
          )}
        </>
      )}

      {/* The end of the questions, or a free page: one more question of your own. */}
      {(atEnd || session.mode === 'free') && (
        <Card style={styles.follow}>
          <Body style={styles.bold}>{session.mode === 'free' && n === 0 ? REFLECT_COPY.ownQuestion : REFLECT_COPY.addQuestion}</Body>
          <TextInput value={ownDraft} onChangeText={setOwnDraft} placeholder={REFLECT_COPY.ownQuestionPlaceholder} accessibilityLabel={REFLECT_COPY.ownQuestionPlaceholder} testID="reflect-own-question" />
          <PrimaryButton
            label={REFLECT_COPY.start}
            variant="outline"
            disabled={!ownDraft.trim()}
            onPress={() => {
              store.addQuestion(sessionId, { question: ownDraft.trim() });
              setOwnDraft('');
              goTo(n);
            }}
          />
        </Card>
      )}
      {atEnd && <PrimaryButton label={REFLECT_COPY.finish} onPress={onClose} testID="reflect-finish" />}
      <Pressable onPress={onLeave} accessibilityRole="button" style={styles.link} testID="reflect-leave">
        <Caption>{REFLECT_COPY.leaveForNow}</Caption>
      </Pressable>
      <SupportLink />
    </View>
  );
}

// --- Closing ------------------------------------------------------------------
export function ClosingStage({ sessionId, onSaved, onGoTo }: { sessionId: string; onSaved: () => void; onGoTo: (position: number) => void }) {
  const session = useReflectionStore((s) => s.sessions.find((x) => x.id === sessionId));
  const finish = useReflectionStore((s) => s.finish);
  const setFeeling = useReflectionStore((s) => s.setFeeling);
  const [takeaway, setTakeaway] = useState(session?.takeaway ?? '');
  const [tags, setTags] = useState((session?.tags ?? []).join(', '));
  const [askLeaving, setAskLeaving] = useState(false);
  const later = useMemo(() => (session ? laterAnswers(session) : []), [session]);
  if (!session) return null;
  const theme = themeById(session.theme);
  const nothing = !session.answers.some((a) => a.answer.trim());
  const save = () => {
    finish(sessionId, { takeaway, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) });
    onSaved();
  };
  return (
    <View style={styles.gap}>
      <ItemFeelingPrompt
        visible={askLeaving}
        source={{ kind: 'reflect', refId: sessionId, phase: 'after' }}
        context={REFLECT_COPY.leavingContext}
        heading={REFLECT_COPY.leaving}
        gentle
        onDone={() => {
          setAskLeaving(false);
          save();
        }}
        onSaved={() => {
          const latest = useFeelingsStore.getState().entries.filter((e) => e.source?.kind === 'reflect' && e.source.refId === sessionId).pop();
          if (latest) setFeeling(sessionId, 'after', latest.id);
        }}
      />
      {theme && <Body>{theme.closing}</Body>}
      {later.length > 0 && (
        <Card style={styles.follow}>
          <Body style={styles.bold}>{REFLECT_COPY.laterTitle(later.length)}</Body>
          <Caption>{REFLECT_COPY.laterLine}</Caption>
          {later.map((a) => (
            <Pressable key={a.id} onPress={() => onGoTo(session.answers.indexOf(a))} accessibilityRole="button" style={styles.link}>
              <Caption>{a.question}</Caption>
            </Pressable>
          ))}
        </Card>
      )}
      <SectionHeading>{REFLECT_CLOSING.takeaway}</SectionHeading>
      <TextInput value={takeaway} onChangeText={setTakeaway} placeholder={REFLECT_CLOSING.takeawayHint} accessibilityLabel={REFLECT_CLOSING.takeaway} testID="reflect-takeaway" />
      <SectionHeading>{REFLECT_COPY.tags}</SectionHeading>
      <TextInput value={tags} onChangeText={setTags} placeholder={REFLECT_COPY.tagsPlaceholder} accessibilityLabel={REFLECT_COPY.tags} />
      {nothing && <Caption>{REFLECT_COPY.nothingYet}</Caption>}
      {!nothing && isLive('letters') && <LetterFromAnswer session={session} />}
      <PrimaryButton label={REFLECT_COPY.save} onPress={() => (session.feelingAfter ? save() : setAskLeaving(true))} testID="reflect-save" />
      <SupportLink />
    </View>
  );
}

// "Turn one of today's answers into a letter": pick an answer, and Letters
// opens a new letter with it as the start (still the person's to change).
function LetterFromAnswer({ session }: { session: ReflectSession }) {
  const [open, setOpen] = useState(false);
  const answered = session.answers.filter((a) => a.answer.trim());
  return (
    <View style={styles.follow}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.link} testID="reflect-to-letter">
        <Caption style={{ color: accent }}>{REFLECT_CLOSING.letterOffer}</Caption>
      </Pressable>
      {open &&
        answered.map((a) => (
          <Pressable key={a.id} onPress={() => openSection('letters', { draftText: a.answer.trim(), fromReflection: session.id })} accessibilityRole="button" style={styles.link}>
            <Caption numberOfLines={2}>{a.answer.trim()}</Caption>
          </Pressable>
        ))}
    </View>
  );
}

// The draft's own line on the home page: "Know myself · 2 of 6".
export function draftLine(s: ReflectSession): string {
  const answered = s.answers.filter((a) => a.answer.trim()).length;
  return `${formatDisplayDate(s.startedAt.slice(0, 10))} · ${answered} of ${s.answers.length} answered`;
}

const styles = themedStyles(() => ({
  gap: { gap: spacing.md },
  topGap: { marginTop: spacing.md },
  bold: { fontWeight: '600' as const },
  option: { gap: spacing.xs, borderWidth: 1, borderColor: colors.line },
  chipRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
  chip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, minHeight: 40, justifyContent: 'center' as const },
  chipTextActive: { color: colors.white },
  note: { fontStyle: 'italic' as const },
  question: { fontSize: fontSizes.lg, lineHeight: fontSizes.lg * 1.4 },
  answer: { minHeight: 180, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, fontSize: fontSizes.base },
  followAnswer: { minHeight: 100, padding: spacing.sm, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.line },
  past: { gap: spacing.sm },
  pastItem: { gap: spacing.xs },
  follow: { gap: spacing.sm },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
  link: { minHeight: 40, justifyContent: 'center' as const },
}));
