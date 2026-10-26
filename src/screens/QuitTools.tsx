// The craving tools themselves (quit/toolkit.ts lists them, quit/toolContent.ts
// holds their words). Design rules: no fail states, no scores or clocks that
// punish, nothing based on chance; sound off until chosen; vibration optional
// and off; reduce motion respected; few words and big targets; leave any time.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from '../components/TextInput';
import { Card } from '../components/Card';
import { SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { TimerRing } from '../components/TimerRing';
import { useUi } from '../components/UiProvider';
import { colors, radii, spacing, fonts } from '../theme';
import { sectionAccents } from '../theme/accents';
import { themedStyles } from '../theme/runtime';
import { useQuitHabitsStore } from '../store/useQuitHabitsStore';
import { reasonTagOptions } from '../data/feelingsWheel';
import { formatRideTimer } from '../quit/journey';
import { TOOLKIT_COPY, type ToolDef } from '../quit/toolkit';
import { BREATHING_PATTERNS, BREATH_LABELS, GUIDED_STEPS, TOOL_VIEW_COPY as COPY } from '../quit/toolContent';
import { generateProblem, type MathProblem } from '../games/quickMath';
import { memoryDeck, type MemoryCard } from '../games/memoryMatch';
import { canSlide, isSolved, shuffledBoard, slide, type Board } from '../games/slidePuzzle';
import { onSoundsReplaced, playLayer, stopAllLayers, type SoundId } from '../utils/audioEngine';
import type { QuitCravingSession, QuitHabit } from '../types/sections';

const accent = sectionAccents.quitHabit;
// After this long in one tool, a quiet "How are you feeling now?" (once).
export const LONG_STAY_MS = 10 * 60_000;

// Ticks while mounted, so countdowns read from a saved start time stay right.
function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

// null until the system answers: treated as "reduce", so nothing animates
// before Ona knows.
function useReduceMotion(): boolean | null {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => alive && setReduce(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

const secondsLeft = (startedAt: string, total: number) => Math.max(0, Math.ceil(total - (Date.now() - new Date(startedAt).getTime()) / 1000));

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && { backgroundColor: accent, borderColor: accent }]} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={label}>
      <Body style={selected ? styles.chipTextActive : undefined}>{label}</Body>
    </Pressable>
  );
}

export function WhyLine({ tool }: { tool: ToolDef | undefined }) {
  if (!tool?.why) return null;
  return (
    <Caption style={styles.why}>
      {COPY.why}: {tool.why}
    </Caption>
  );
}

// "How are you feeling now?" after a long time in one tool: once, no nagging.
export function LongStayCheck({ since, onOkay }: { since: string; onOkay: () => void }) {
  useTick(15_000);
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (dismissed === since || Date.now() - new Date(since).getTime() < LONG_STAY_MS) return null;
  return (
    <Card style={[styles.check, { borderLeftColor: accent }]}>
      <Body>{COPY.longStay}</Body>
      <View style={styles.row}>
        <PrimaryButton label={COPY.longStayKeep} variant="outline" style={styles.flex} onPress={() => setDismissed(since)} />
        <PrimaryButton label={COPY.longStayOkay} variant="outline" style={styles.flex} onPress={onOkay} />
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Paced breathing: three patterns, runs until paused. The phase is read from
// the clock, so it stays in step however the screen redraws.
export function PacedBreathing() {
  const reduceMotion = useReduceMotion();
  const [patternId, setPatternId] = useState(BREATHING_PATTERNS[0].id);
  const [startedAt, setStartedAt] = useState<number | null>(() => Date.now());
  const [vibrate, setVibrate] = useState(false);
  const scale = useRef(new Animated.Value(0.6)).current;
  const lastPhase = useRef<string>('');
  const pattern = BREATHING_PATTERNS.find((p) => p.id === patternId) ?? BREATHING_PATTERNS[0];
  useTick(250);

  const cycle = pattern.phases.reduce((n, p) => n + p.seconds, 0);
  let current = pattern.phases[0];
  let index = 0;
  if (startedAt !== null) {
    let t = ((Date.now() - startedAt) / 1000) % cycle;
    for (let i = 0; i < pattern.phases.length; i++) {
      if (t < pattern.phases[i].seconds) {
        current = pattern.phases[i];
        index = i;
        break;
      }
      t -= pattern.phases[i].seconds;
    }
  }
  const phaseKey = startedAt === null ? 'paused' : `${patternId}:${index}:${Math.floor((Date.now() - startedAt) / 1000 / cycle)}`;

  useEffect(() => {
    if (phaseKey === lastPhase.current || startedAt === null) return;
    lastPhase.current = phaseKey;
    const target = current.phase === 'in' ? 1 : current.phase === 'out' ? 0.6 : null;
    if (target !== null) {
      if (reduceMotion !== false) scale.setValue(target);
      else Animated.timing(scale, { toValue: target, duration: current.seconds * 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
    }
    if (vibrate) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [phaseKey, startedAt, current, reduceMotion, vibrate, scale]);

  return (
    <View style={styles.breathing}>
      <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel={COPY.pattern}>
        {BREATHING_PATTERNS.map((p) => (
          <Chip key={p.id} label={p.name} selected={p.id === patternId} onPress={() => { setPatternId(p.id); setStartedAt(Date.now()); }} />
        ))}
      </View>
      <Caption>{pattern.line}</Caption>
      <View style={styles.circleWrap} accessibilityLiveRegion="polite">
        <Animated.View style={[styles.circle, { backgroundColor: accent, transform: [{ scale }] }]} />
        <Body style={styles.phaseLabel}>{startedAt === null ? '' : BREATH_LABELS[current.phase]}</Body>
      </View>
      <PrimaryButton label={startedAt === null ? COPY.startBreathing : COPY.pauseBreathing} variant="outline" onPress={() => setStartedAt(startedAt === null ? Date.now() : null)} />
      <Pressable onPress={() => setVibrate(!vibrate)} style={styles.toggle} accessibilityRole="switch" accessibilityLabel={COPY.vibration} accessibilityState={{ checked: vibrate }}>
        <Ionicons name={vibrate ? 'radio-button-on' : 'radio-button-off'} size={20} color={vibrate ? accent : colors.inkSoft} />
        <Caption>{COPY.vibration}</Caption>
      </Pressable>
    </View>
  );
}

// One step at a time, back and forth, "Done" at the end.
export function GuidedSteps({ steps, onDone }: { steps: { title: string; body: string }[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;
  return (
    <Card style={styles.stepCard}>
      {steps.length > 1 && <Caption>{COPY.step(i + 1, steps.length)}</Caption>}
      <SectionHeading accessibilityRole="header">{step.title}</SectionHeading>
      <Body>{step.body}</Body>
      <View style={styles.row}>
        {i > 0 && <PrimaryButton label={COPY.back} variant="outline" style={styles.flex} onPress={() => setI(i - 1)} />}
        <PrimaryButton label={last ? COPY.done : COPY.next} style={styles.flex} onPress={() => (last ? onDone() : setI(i + 1))} />
      </View>
    </Card>
  );
}

function CountBreaths() {
  const [n, setN] = useState(0);
  return (
    <View style={styles.center}>
      <Pressable
        onPress={() => setN(n >= 10 ? 1 : n + 1)}
        style={[styles.countCircle, { borderColor: accent }]}
        accessibilityRole="button"
        accessibilityLabel={COPY.countTap}
        accessibilityValue={{ text: n ? COPY.countOf(n) : undefined }}
      >
        <SectionHeading>{n || ''}</SectionHeading>
      </Pressable>
      <Caption>{n >= 10 ? COPY.countAgain : n ? COPY.countOf(n) : COPY.countTap}</Caption>
    </View>
  );
}

function Countdown({ startedAt, seconds, caption, doneCaption, onDone }: { startedAt: string; seconds: number; caption: string; doneCaption: string; onDone: () => void }) {
  useTick();
  const left = secondsLeft(startedAt, seconds);
  return <TimerRing caption={left > 0 ? caption : doneCaption} timeText={formatRideTimer(left)} primaryLabel={COPY.done} onPrimary={onDone} />;
}

const SOUNDS: { id: SoundId; label: string }[] = [
  { id: 'rain', label: 'Rain' },
  { id: 'ocean-waves', label: 'Waves' },
  { id: 'brown-noise', label: 'Brown noise' },
  { id: 'pink-noise', label: 'Pink noise' },
];
const OWNER_NAMES = { sleep: 'Sleep', study: 'Study' } as const;

// Off until one is chosen; stops when you leave the tool.
function CalmSounds() {
  const { showToast } = useUi();
  const [playing, setPlaying] = useState<SoundId | null>(null);
  useEffect(() => onSoundsReplaced((owner) => owner === 'quit' && setPlaying(null)), []);
  useEffect(() => () => stopAllLayers('quit'), []);
  const choose = async (id: SoundId) => {
    stopAllLayers('quit');
    if (playing === id) return setPlaying(null);
    const r = await playLayer(id, 0.5, 'quit');
    if (!r.ok) return showToast({ message: COPY.soundError });
    setPlaying(id);
    if (r.replaced && r.replaced !== 'quit') showToast({ message: COPY.soundsReplaced(OWNER_NAMES[r.replaced]) });
  };
  return (
    <>
      <Caption style={styles.note}>{COPY.soundsLine}</Caption>
      <View style={styles.chipRow}>
        {SOUNDS.map((s) => (
          <Chip key={s.id} label={s.label} selected={playing === s.id} onPress={() => void choose(s.id)} />
        ))}
      </View>
      {playing && (
        <PrimaryButton
          label={COPY.soundStop}
          variant="outline"
          onPress={() => {
            stopAllLayers('quit');
            setPlaying(null);
          }}
        />
      )}
    </>
  );
}

// Memory Match, gently: no move count, no result saved, mismatches simply
// turn back over. When every pair is found: a quiet "nice" and another round.
function GentleMemory() {
  const [cards, setCards] = useState<MemoryCard[]>(() => memoryDeck(6));
  const [flipped, setFlipped] = useState<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const done = cards.every((c) => c.matched);
  const tap = (i: number) => {
    if (flipped.length === 2 || flipped.includes(i) || cards[i].matched) return;
    const next = [...flipped, i];
    setFlipped(next);
    if (next.length < 2) return;
    const [a, b] = next;
    if (cards[a].icon === cards[b].icon) {
      setCards(cards.map((c, k) => (k === a || k === b ? { ...c, matched: true } : c)));
      setFlipped([]);
    } else timer.current = setTimeout(() => setFlipped([]), 900);
  };
  return (
    <>
      <View style={styles.memoryGrid}>
        {cards.map((card, i) => {
          const up = card.matched || flipped.includes(i);
          return (
            <Pressable key={card.key} onPress={() => tap(i)} style={styles.memoryCard} accessibilityRole="button" accessibilityLabel={up ? card.icon : `Card ${i + 1}, face down`}>
              <View style={[styles.memoryInner, up && styles.memoryUp]}>{up && <Ionicons name={card.icon as never} size={22} color={card.matched ? accent : colors.ink} />}</View>
            </Pressable>
          );
        })}
      </View>
      {done && (
        <>
          <Body style={styles.centerText}>{COPY.memoryNice}</Body>
          <PrimaryButton label={COPY.memoryAgain} variant="outline" onPress={() => setCards(memoryDeck(6))} />
        </>
      )}
    </>
  );
}

// The slide puzzle: tap a tile next to the gap to slide it. No move count,
// no clock; solved: a quiet "nice" and another one.
const SLIDE_SIZE = 3;
function SlidePuzzle() {
  const [board, setBoard] = useState<Board>(() => shuffledBoard(SLIDE_SIZE));
  const done = isSolved(board);
  return (
    <>
      <View style={styles.slideGrid}>
        {board.map((n, i) =>
          n === 0 ? (
            <View key="gap" style={styles.slideCell} />
          ) : (
            <Pressable
              key={n}
              onPress={() => setBoard(slide(board, i, SLIDE_SIZE))}
              disabled={done}
              style={[styles.slideCell, styles.slideTile, { borderColor: accent }]}
              accessibilityRole="button"
              accessibilityLabel={COPY.slideTile(n, !done && canSlide(board, i, SLIDE_SIZE))}
            >
              <SectionHeading>{n}</SectionHeading>
            </Pressable>
          )
        )}
      </View>
      {done && (
        <>
          <Body style={styles.centerText}>{COPY.slideNice}</Body>
          <PrimaryButton label={COPY.slideAgain} variant="outline" onPress={() => setBoard(shuffledBoard(SLIDE_SIZE))} />
        </>
      )}
    </>
  );
}

// Quick Math, gently: easy sums, no clock, no count; a wrong answer just
// shows the right one and moves on.
function GentleMath() {
  const [problem, setProblem] = useState<MathProblem>(() => generateProblem('easy'));
  const [line, setLine] = useState('');
  const answer = (choice: number) => {
    setLine(choice === problem.answer ? COPY.mathNice : COPY.mathShow(problem.answer));
    setProblem(generateProblem('easy'));
  };
  return (
    <>
      <Card style={styles.mathCard}>
        <SectionHeading style={styles.centerText}>{problem.question} = ?</SectionHeading>
      </Card>
      <View style={styles.mathChoices}>
        {problem.choices.map((c) => (
          <Pressable key={c} onPress={() => answer(c)} style={styles.mathChoice} accessibilityRole="button" accessibilityLabel={String(c)}>
            <Body>{c}</Body>
          </Pressable>
        ))}
      </View>
      <Caption style={styles.centerText} accessibilityLiveRegion="polite">{line}</Caption>
    </>
  );
}

// My reasons: the why from the start, the user's own list, a note to their
// future self and an optional photo. Edits save as they're made.
function MyReasons({ habit }: { habit: QuitHabit }) {
  const update = useQuitHabitsStore((s) => s.updateQuitHabit);
  const { showToast } = useUi();
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState(habit.futureNote ?? '');
  const reasons = habit.reasons ?? [];
  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (!r.canceled && r.assets[0]) update(habit.id, { photoUri: r.assets[0].uri });
    } catch {
      showToast({ message: "Couldn't open your photos on this device." });
    }
  };
  return (
    <>
      {habit.why && (
        <Card style={[styles.reasonCard, { borderLeftColor: accent }]}>
          <Eyebrow style={{ color: accent }}>Your why</Eyebrow>
          <Body>{habit.why}</Body>
        </Card>
      )}
      {reasons.length === 0 && !habit.why && <Caption style={styles.note}>{COPY.reasonsEmpty}</Caption>}
      {reasons.map((r, i) => (
        <Card key={`${i}-${r}`} style={styles.listRow}>
          <Body style={styles.flex}>{r}</Body>
          <Pressable onPress={() => update(habit.id, { reasons: reasons.filter((_, k) => k !== i) })} hitSlop={8} accessibilityRole="button" accessibilityLabel={TOOLKIT_COPY.remove(r)}>
            <Ionicons name="close" size={18} color={colors.inkSoft} />
          </Pressable>
        </Card>
      ))}
      <TextInput value={draft} onChangeText={setDraft} placeholder={COPY.reasonsPlaceholder} style={styles.input} accessibilityLabel={COPY.reasonsAdd} />
      <PrimaryButton
        label={COPY.reasonsAdd}
        variant="outline"
        disabled={!draft.trim()}
        onPress={() => {
          update(habit.id, { reasons: [...reasons, draft.trim()] });
          setDraft('');
        }}
      />
      <Eyebrow style={styles.label}>{COPY.reasonsNote}</Eyebrow>
      <TextInput
        value={note}
        onChangeText={setNote}
        onBlur={() => update(habit.id, { futureNote: note.trim() || undefined })}
        placeholder={COPY.reasonsNotePlaceholder}
        style={[styles.input, styles.multiline]}
        multiline
        accessibilityLabel={COPY.reasonsNote}
      />
      {habit.photoUri ? (
        <>
          <Image source={{ uri: habit.photoUri }} style={styles.photo} accessibilityLabel={COPY.reasonsTitle} />
          <View style={styles.row}>
            <PrimaryButton label={COPY.reasonsPhotoChange} variant="outline" style={styles.flex} onPress={() => void pickPhoto()} />
            <PrimaryButton label={COPY.reasonsPhotoRemove} variant="outline" style={styles.flex} onPress={() => update(habit.id, { photoUri: undefined })} />
          </View>
        </>
      ) : (
        <PrimaryButton label={COPY.reasonsPhoto} variant="outline" onPress={() => void pickPhoto()} style={styles.label} />
      )}
    </>
  );
}

// Name the craving: a few words, and what set it off (one tag, for Analysis).
function NameCraving({ session }: { session: QuitCravingSession }) {
  const updateCraving = useQuitHabitsStore((s) => s.updateCraving);
  const [text, setText] = useState(session.note ?? '');
  return (
    <>
      <Eyebrow style={styles.label}>{COPY.nameFeeling}</Eyebrow>
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={() => updateCraving(session.id, { note: text.trim() || undefined })}
        placeholder={COPY.nameFeelingPlaceholder}
        style={styles.input}
        accessibilityLabel={COPY.nameFeeling}
      />
      <Eyebrow style={styles.label}>{COPY.nameTrigger}</Eyebrow>
      <View style={styles.chipRow}>
        {reasonTagOptions.map((tag) => (
          <Chip key={tag} label={tag} selected={session.triggerTag === tag} onPress={() => updateCraving(session.id, { triggerTag: session.triggerTag === tag ? undefined : tag })} />
        ))}
      </View>
    </>
  );
}

// The tools that have their own view here (the first four keep theirs in
// QuitHabitScreen).
export const TOOL_VIEWS = new Set(['grounding', 'bodyScan', 'muscleRelax', 'countBreaths', 'noticeFive', 'oneObject', 'mindfulMinute', 'sounds', 'memoryMatch', 'slidePuzzle', 'gentleMath', 'walk', 'stretches', 'myReasons', 'delayIt', 'nameCraving', 'urgeSurfing', 'textFriend', 'sayHi']);

export function ToolView({ tool, habit, session, startedAt, onDone }: { tool: ToolDef; habit: QuitHabit; session: QuitCravingSession; startedAt: string; onDone: () => void }) {
  const steps = GUIDED_STEPS[tool.id];
  return (
    <>
      <SectionHeading>{tool.title}</SectionHeading>
      {steps ? (
        <GuidedSteps steps={steps} onDone={onDone} />
      ) : tool.id === 'countBreaths' ? (
        <CountBreaths />
      ) : tool.id === 'mindfulMinute' ? (
        <>
          <Caption style={styles.note}>{COPY.mindful}</Caption>
          <Countdown startedAt={startedAt} seconds={60} caption={COPY.mindful} doneCaption={COPY.mindfulDone} onDone={onDone} />
        </>
      ) : tool.id === 'delayIt' ? (
        <>
          <Caption style={styles.note}>{COPY.delayLine}</Caption>
          <Countdown startedAt={startedAt} seconds={600} caption={COPY.delayCaption} doneCaption={COPY.delayDone} onDone={onDone} />
        </>
      ) : tool.id === 'sounds' ? (
        <CalmSounds />
      ) : tool.id === 'memoryMatch' ? (
        <GentleMemory />
      ) : tool.id === 'slidePuzzle' ? (
        <SlidePuzzle />
      ) : tool.id === 'gentleMath' ? (
        <GentleMath />
      ) : tool.id === 'myReasons' ? (
        <MyReasons habit={habit} />
      ) : tool.id === 'nameCraving' ? (
        <NameCraving session={session} />
      ) : null}
    </>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  center: { alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md },
  centerText: { textAlign: 'center' },
  label: { marginTop: spacing.md, marginBottom: spacing.xs },
  note: { color: colors.inkSoft, marginBottom: spacing.sm },
  why: { color: colors.inkSoft, marginTop: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: { minHeight: 44, justifyContent: 'center', paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipTextActive: { color: colors.white },
  check: { gap: spacing.xs, marginTop: spacing.md, borderLeftWidth: 3 },
  breathing: { alignItems: 'center', gap: spacing.sm },
  circleWrap: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center', marginVertical: spacing.sm },
  circle: { position: 'absolute', width: 150, height: 150, borderRadius: 75, opacity: 0.35 },
  phaseLabel: { fontFamily: fonts.bodyMedium },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, paddingHorizontal: spacing.sm },
  stepCard: { gap: spacing.sm, marginTop: spacing.sm },
  countCircle: { width: 160, height: 160, borderRadius: 80, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  memoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginVertical: spacing.md },
  memoryCard: { width: 72, height: 72 },
  memoryInner: { flex: 1, borderRadius: radii.md, backgroundColor: colors.stone, alignItems: 'center', justifyContent: 'center' },
  memoryUp: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  slideGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 3 * 84, alignSelf: 'center', marginVertical: spacing.md },
  slideCell: { width: 76, height: 76, margin: 4, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  slideTile: { backgroundColor: colors.surface, borderWidth: 1.5 },
  mathCard: { alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.sm },
  mathChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginVertical: spacing.md },
  mathChoice: { minWidth: 72, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  reasonCard: { gap: spacing.xs, marginBottom: spacing.sm, borderLeftWidth: 3 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  input: { fontFamily: fonts.body, fontSize: 15, color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  photo: { width: '100%', height: 200, borderRadius: radii.md, marginTop: spacing.sm },
}));
