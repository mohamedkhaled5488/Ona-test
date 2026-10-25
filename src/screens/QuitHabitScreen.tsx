import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { SheetModal } from '../components/SheetModal';
import { FeelingPicker, isPersonalFeeling, type FeelingPickerStep, type PickedFeeling } from '../components/FeelingPicker';
import { BreathingExercise } from '../components/BreathingExercise';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, radii, spacing, fonts } from '../theme';
import { sectionAccents } from '../theme/accents';
import { withAlpha } from '../utils/color';
import { useBackHandler } from '../hooks/useBackHandler';
import { useUi } from '../components/UiProvider';
import { todayISO, formatDisplayDate } from '../utils/date';
import { feelings, zoneMeta, reasonTagOptions } from '../data/feelingsWheel';
import {
  useQuitHabitsStore,
  activeTrackFor,
  tracksForHabit,
  feelingEntriesForTrack,
  daysSinceTrackStart,
  quitMilestoneMessage,
  resistedUrgeEntriesForHabit,
  openCravingFor,
} from '../store/useQuitHabitsStore';
import { rotatingJourneyStat } from '../utils/habitStats';
import { QuitHabitAnalysisStage } from './QuitHabitAnalysis';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { useHabitsStore } from '../store/useHabitsStore';
import type { Feeling, FeelingSource, FeelingZone, QuitCravingSession, QuitHabit, QuitHabitType, QuitTrack } from '../types/sections';
import { formatRideTimer, journeyCounts, journeyHeadline, sessionSeconds } from '../quit/journey';
import type { RootStackParamList } from '../navigation/types';
import { themedStyles } from '../theme/runtime';
import { useSettingsStore } from '../store/useSettingsStore';
import { ItemFeelingPrompt } from '../components/ItemFeelingSheet';
import { shouldAskItemFeeling } from '../utils/itemFeelings';
import { logFeeling } from '../feelings/logFeeling';
import { SeeHowItWorks } from '../discover/SeeHowItWorks';
import { CravingMenu, HabitTypeChips, OwnToolView, ToolkitEntry, ToolkitOffer, ToolkitStage } from './QuitToolkit';
import { DEFAULT_TOOL, TOOLKIT_COPY, findTool, needsSubstanceNote } from '../quit/toolkit';

// "1 day", "5 days".
const dayCount = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

type Props = NativeStackScreenProps<RootStackParamList, 'quitHabit'>;

const accent = sectionAccents.quitHabit;

type ScreenState =
  | { kind: 'overview' }
  | { kind: 'journey'; habitId: string }
  | { kind: 'trackDetail'; habitId: string; trackId: string }
  | { kind: 'analysis'; habitId: string }
  | { kind: 'toolkit'; habitId: string };

function findFeeling(id: string): Feeling | undefined {
  return feelings.find((f) => f.id === id);
}

// ---------------------------------------------------------------------------
function AddQuitHabitSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (habitId: string) => void }) {
  const addQuitHabit = useQuitHabitsStore((s) => s.addQuitHabit);
  const setReplacementHabit = useQuitHabitsStore((s) => s.setReplacementHabit);
  const addHabit = useHabitsStore((s) => s.addHabit);
  const updateQuitHabit = useQuitHabitsStore((s) => s.updateQuitHabit);
  const { showDialog } = useUi();
  const [name, setName] = useState('');
  const [habitType, setHabitType] = useState<QuitHabitType | undefined>();
  const [why, setWhy] = useState('');
  const [instead, setInstead] = useState('');

  const reset = () => {
    setName('');
    setWhy('');
    setInstead('');
    setHabitType(undefined);
  };

  return (
    <SheetModal visible={visible} onClose={() => { reset(); onClose(); }}>
      <SectionHeading>What do you want to quit?</SectionHeading>
      <Eyebrow style={styles.fieldLabel}>Name it</Eyebrow>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. Smoking, nail biting, late-night scrolling" style={styles.sheetInput} />

      <Eyebrow style={styles.fieldLabel}>{TOOLKIT_COPY.typeHeading}</Eyebrow>
      <HabitTypeChips value={habitType} onChange={setHabitType} />

      <Eyebrow style={styles.fieldLabel}>Your why (optional, resurfaced later)</Eyebrow>
      <TextInput value={why} onChangeText={setWhy} placeholder="Your own reason for wanting this..." style={styles.notesInput} multiline />

      <Eyebrow style={styles.fieldLabel}>Want to pair this with something to do instead? (optional)</Eyebrow>
      <Caption style={styles.insteadHint}>Having something to do instead can help when an urge comes. This adds a small habit to Build, cued by the urge itself.</Caption>
      <TextInput value={instead} onChangeText={setInstead} placeholder="e.g. chew gum, take a short walk" style={styles.sheetInput} />

      <PrimaryButton
        label="Start"
        disabled={!name.trim()}
        onPress={() => {
          const { habitId } = addQuitHabit(name, why, habitType);
          if (instead.trim()) {
            const buildId = addHabit({
              name: instead,
              cueRoutine: `feel the urge for ${name.trim().toLowerCase()}`,
              targetDays: 30,
              pairedQuitHabitId: habitId,
            });
            setReplacementHabit(habitId, buildId);
          }
          reset();
          onClose();
          onCreated(habitId);
          // Once, when the habit is made: stopping some substances suddenly
          // can be risky.
          const made = useQuitHabitsStore.getState().habits.find((h) => h.id === habitId);
          if (made && needsSubstanceNote(made)) {
            updateQuitHabit(habitId, { substanceNoteShown: true });
            showDialog({ title: TOOLKIT_COPY.substanceTitle, message: TOOLKIT_COPY.substanceNote, actions: [{ label: 'OK', style: 'cancel' }] });
          }
        }}
        style={styles.sheetSubmit}
      />
    </SheetModal>
  );
}

// ---------------------------------------------------------------------------
// A feeling + free-text capture, built on the shared Feelings Wheel picker —
// used both for "document how I feel right now" and inside the relapse flow.
function FeelingCapture({
  onSubmit,
  intro,
  noteLabel,
}: {
  onSubmit: (feeling: PickedFeeling, zone: FeelingZone, note: string) => void;
  intro?: React.ReactNode;
  noteLabel?: string;
}) {
  const [step, setStep] = useState<FeelingPickerStep>({ kind: 'zone' });
  const [chosen, setChosen] = useState<PickedFeeling | null>(null);
  const [note, setNote] = useState('');

  if (chosen) {
    return (
      <>
        <SectionHeading style={{ color: zoneMeta(chosen.zone).accent }}>{chosen.name}</SectionHeading>
        {!isPersonalFeeling(chosen) && <Body style={styles.definitionText}>{chosen.definition}</Body>}
        <Eyebrow style={styles.fieldLabel}>{noteLabel ?? 'Write as much or as little as you want (optional)'}</Eyebrow>
        <TextInput value={note} onChangeText={setNote} placeholder="What's going on..." style={styles.notesInput} multiline />
        <PrimaryButton label="Save" onPress={() => onSubmit(chosen, chosen.zone, note)} style={styles.sheetSubmit} />
        <Pressable onPress={() => setChosen(null)}>
          <Caption style={styles.changeFeelingLink}>Choose a different feeling</Caption>
        </Pressable>
      </>
    );
  }

  return (
    <>
      {intro}
      <FeelingPicker
        step={step}
        subtitle="Where are you right now?"
        onPickZone={(zone) => setStep({ kind: 'word', zone })}
        onBack={() => setStep({ kind: 'zone' })}
        onPickFeeling={(f) => setChosen(f)}
      />
    </>
  );
}

function FeelingSheet({ visible, onClose, onSubmit }: { visible: boolean; onClose: () => void; onSubmit: (feeling: PickedFeeling, zone: FeelingZone, note: string) => void }) {
  return (
    <SheetModal visible={visible} onClose={onClose}>
      <FeelingCapture
        onSubmit={(f, zone, note) => {
          onSubmit(f, zone, note);
          onClose();
        }}
      />
    </SheetModal>
  );
}

// After an urge or a slip: a gentle offer to note a feeling, never a step
// you have to go through. Skip and "Note a feeling" carry the same weight.
// With Settings on "Never", only a quiet link is shown.
function SoftFeelingOffer({ habit, source }: { habit: QuitHabit; source: FeelingSource }) {
  const mode = useSettingsStore((st) => st.quitFeelingAsk);
  const feelingLog = useFeelingsStore((st) => st.entries);
  const [ask] = useState(() => shouldAskItemFeeling(mode, feelingLog, 'quitHabit', habit.id, todayISO()));
  const [open, setOpen] = useState(false);
  const [noted, setNoted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const prompt = (
    <ItemFeelingPrompt
      visible={open}
      gentle
      heading="Want to note how you're feeling?"
      source={source}
      context={habit.name}
      onSaved={() => setNoted(true)}
      onDone={() => {
        setOpen(false);
        setDismissed(true);
      }}
    />
  );
  if (noted) return <Caption style={styles.softOfferDone}>Noted in your Feelings log.</Caption>;
  if (dismissed) return prompt;
  if (!ask) {
    return (
      <>
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.softOfferLink}>
          <Caption style={styles.changeFeelingLink}>Note how you're feeling (optional)</Caption>
        </Pressable>
        {prompt}
      </>
    );
  }
  return (
    <Card style={styles.softOffer}>
      <Body>Want to note how you're feeling?</Body>
      <Caption>Only if you want to. Skipping is just as fine.</Caption>
      <View style={styles.softOfferActions}>
        <PrimaryButton label="Skip" variant="outline" style={styles.softOfferAction} onPress={() => setDismissed(true)} />
        <PrimaryButton label="Note a feeling" variant="outline" style={styles.softOfferAction} onPress={() => setOpen(true)} />
      </View>
      {prompt}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// A hard day (a slip) — the part of this section that matters most to get
// right. No shame and no reset: it's marked on the journey, the journey's day
// count carries on, and starting a new chapter is an option afterwards, never
// the default. Crisis and support lines are one tap away.
function SupportLink() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Pressable onPress={() => navigation.navigate('settings', { page: 'safety' })} accessibilityRole="link" hitSlop={8} style={styles.supportLink}>
      <Ionicons name="call-outline" size={14} color={colors.inkSoft} />
      <Caption> Need to talk to someone now? Support lines</Caption>
    </Pressable>
  );
}

export const SLIP_COPY = {
  title: 'Slips happen',
  intro: (journeyDays: number) => `What matters is what you do next. A hard day doesn't erase day ${journeyDays} of your journey, or anything you've learned along the way.`,
  reflectHeading: "If you're up for it",
  reflectTags: 'What was happening before? (optional)',
  reflectText: 'Anything you want to remember about it (optional)',
  reflectPlaceholder: 'No pressure at all. Leave it blank if you’d rather not.',
  mark: 'Mark this hard day',
  doneTitle: 'Marked on your journey',
  done: (journeyDays: number) => `Day ${journeyDays} of your journey carries on. This day is on your journey, with what you wrote.`,
  back: 'Back to my journey',
  newChapter: 'Start a new chapter?',
  newChapterTitle: 'Start a new chapter?',
  newChapterMessage: 'This chapter ends today and a new one begins. Your journey, its days and everything in it stay as they are.',
  newChapterYes: 'Start a new chapter',
};

function SlipStage({ habit, track, cravingSessionId, onBack, onDone }: { habit: QuitHabit; track: QuitTrack; cravingSessionId?: string; onBack: () => void; onDone: () => void }) {
  const markHardDay = useQuitHabitsStore((s) => s.markHardDay);
  const startNewChapter = useQuitHabitsStore((s) => s.startNewChapter);
  const endCraving = useQuitHabitsStore((s) => s.endCraving);
  const tracks = useQuitHabitsStore((s) => s.tracks);
  const slips = useQuitHabitsStore((s) => s.slips);
  const { showDialog } = useUi();
  const [phase, setPhase] = useState<'intro' | 'reflect' | 'done'>('intro');
  const [reflection, setReflection] = useState('');
  const [reasonTags, setReasonTags] = useState<string[]>([]);
  const [slipId, setSlipId] = useState<string | null>(null);
  const toggleReasonTag = (tag: string) => setReasonTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  const counts = journeyCounts(tracks, slips, habit.id, todayISO());

  const mark = () => {
    const id = markHardDay(habit.id, track.id, { reflection, reasonTags, cravingSessionId });
    if (cravingSessionId) endCraving(cravingSessionId, 'slipped', { slipId: id });
    setSlipId(id);
    setPhase('done');
  };
  const askNewChapter = () =>
    showDialog({
      title: SLIP_COPY.newChapterTitle,
      message: SLIP_COPY.newChapterMessage,
      actions: [
        { label: 'Not now', style: 'cancel' },
        {
          label: SLIP_COPY.newChapterYes,
          style: 'default',
          onPress: () => {
            if (slipId) startNewChapter(habit.id, slipId);
            onDone();
          },
        },
      ],
    });

  return (
    <>
      {phase !== 'done' && (
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Cancel</Caption>
        </Pressable>
      )}

      {phase === 'intro' && (
        <>
          <ScreenTitle>{SLIP_COPY.title}</ScreenTitle>
          <Body style={styles.relapseIntroText}>{SLIP_COPY.intro(counts.journeyDays)}</Body>
          {habit.why && (
            <Card style={[styles.whyCard, { borderLeftColor: accent }]}>
              <Eyebrow style={{ color: accent }}>Remember why you started</Eyebrow>
              <Body>{habit.why}</Body>
            </Card>
          )}
          <PrimaryButton label="Continue" onPress={() => setPhase('reflect')} style={styles.sheetSubmit} />
          <SupportLink />
        </>
      )}

      {phase === 'reflect' && (
        <>
          <SectionHeading>{SLIP_COPY.reflectHeading}</SectionHeading>
          <Eyebrow style={styles.fieldLabel}>{SLIP_COPY.reflectTags}</Eyebrow>
          <View style={styles.chipRow}>
            {reasonTagOptions.map((tag) => (
              <Pressable key={tag} onPress={() => toggleReasonTag(tag)} style={[styles.chip, reasonTags.includes(tag) && { backgroundColor: accent }]} accessibilityRole="checkbox" accessibilityState={{ checked: reasonTags.includes(tag) }}>
                <Body style={reasonTags.includes(tag) ? styles.chipTextActive : undefined}>{tag}</Body>
              </Pressable>
            ))}
          </View>
          <Eyebrow style={styles.fieldLabel}>{SLIP_COPY.reflectText}</Eyebrow>
          <TextInput value={reflection} onChangeText={setReflection} placeholder={SLIP_COPY.reflectPlaceholder} style={styles.notesInput} multiline />
          <SoftFeelingOffer habit={habit} source={{ kind: 'quitHabit', refId: habit.id, trackId: track.id, slip: true }} />
          <PrimaryButton label={SLIP_COPY.mark} onPress={mark} style={styles.sheetSubmit} />
          <SupportLink />
        </>
      )}

      {phase === 'done' && (
        <>
          <ScreenTitle>{SLIP_COPY.doneTitle}</ScreenTitle>
          <Body style={styles.relapseIntroText}>{SLIP_COPY.done(counts.journeyDays)}</Body>
          <PrimaryButton label={SLIP_COPY.back} onPress={onDone} style={styles.sheetSubmit} />
          <PrimaryButton label={SLIP_COPY.newChapter} variant="outline" onPress={askNewChapter} style={styles.actionButton} />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Short, concrete things to do instead of acting on the urge. Nothing based on
// shock or pain (no cold water).
const REPLACEMENT_SUGGESTIONS = ['Drink a glass of water', 'Step outside for a minute', 'Stretch', 'Make a cup of tea'];

// DBT's "Check the Facts" technique — three short optional prompts rather
// than a single free-text box, since naming each question separately is
// what actually makes the technique work.
function CheckTheFacts({ onDone }: { onDone: () => void }) {
  const [whatsTrue, setWhatsTrue] = useState('');
  const [urgeSaying, setUrgeSaying] = useState('');
  const [ifWait, setIfWait] = useState('');
  return (
    <>
      <SectionHeading>Check the facts</SectionHeading>
      <Caption style={styles.subtitle}>Answer as much or as little as helps — there's no wrong amount.</Caption>
      <Eyebrow style={styles.fieldLabel}>What's actually true right now?</Eyebrow>
      <TextInput value={whatsTrue} onChangeText={setWhatsTrue} placeholder="Just the facts, not the story around them..." style={styles.notesInput} multiline />
      <Eyebrow style={styles.fieldLabel}>What is the urge telling you?</Eyebrow>
      <TextInput value={urgeSaying} onChangeText={setUrgeSaying} placeholder="What it's promising, or what it says will happen if you don't act..." style={styles.notesInput} multiline />
      <Eyebrow style={styles.fieldLabel}>What happens if you wait 15 more minutes?</Eyebrow>
      <TextInput value={ifWait} onChangeText={setIfWait} placeholder="Probably less than the urge is telling you..." style={styles.notesInput} multiline />
      <PrimaryButton label="Continue" onPress={onDone} style={styles.sheetSubmit} />
    </>
  );
}

// No built-in contact shortcut (trusted-contact quick actions are explicitly
// excluded) — just the encouragement, and a plain path to the phone's own
// messaging app with nobody pre-filled.
function ReachOut({ onDone }: { onDone: () => void }) {
  return (
    <>
      <SectionHeading>Reach out</SectionHeading>
      <Body style={styles.relapseIntroText}>
        Message or call someone — you don't have to say why, or say much at all. Not being alone with this for a few minutes can help.
      </Body>
      <PrimaryButton label="Open Messages" variant="outline" onPress={() => { Linking.openURL('sms:').catch(() => {}); }} style={styles.actionButton} />
      <PrimaryButton label="I reached out" onPress={onDone} style={styles.sheetSubmit} />
    </>
  );
}

export const CRAVING_COPY = {
  title: "You're doing something hard. Let's ride this out.",
  rate: 'How strong is it? (optional)',
  skip: 'Skip',
  timer: (t: string) => `Riding it out: ${t}`,
  pick: 'What might help right now?',
  tryElse: 'Try something else',
  okay: "I'm okay now",
  rideLine: 'Cravings rise, peak and fade, often within a short time.',
  afterTitle: 'How strong is it now? (optional)',
  passed: 'It passed',
  stillHere: 'Still here',
  slipped: 'I slipped',
  stillHereLine: "That's okay. Try another, or keep breathing. The timer keeps going.",
  passedTitle: 'It passed',
  passedLine: (n: number, habit: string) => `That's ${n} ${n === 1 ? 'urge' : 'urges'} ridden out on ${habit.toLowerCase()}.`,
  resume: (t: string) => `Riding it out: ${t}. Continue`,
};

function RatingChips({ value, onChange, label }: { value?: number; onChange: (n: number) => void; label: string }) {
  return (
    <View style={styles.ratingRow} accessibilityLabel={label}>
      {Array.from({ length: 11 }, (_, n) => (
        <Pressable key={n} onPress={() => onChange(n)} style={[styles.ratingChip, value === n && { backgroundColor: accent }]} accessibilityRole="button" accessibilityLabel={`${n} out of 10`} accessibilityState={{ selected: value === n }}>
          <Body style={value === n ? styles.chipTextActive : undefined}>{n}</Body>
        </Pressable>
      ))}
    </View>
  );
}

// "Riding it out: 4:12", always visible, read from when the session started
// (right after the phone was locked or Ona was closed).
function RideTimer({ session }: { session: QuitCravingSession }) {
  const [, tick] = useState(0);
  React.useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Caption style={styles.rideTimer} accessibilityLiveRegion="none">
      {CRAVING_COPY.timer(formatRideTimer(sessionSeconds(session, Date.now())))}
    </Caption>
  );
}

// Tapping "I'm craving it": the session going on for this habit, or a new one.
function startOrResumeCraving(habitId: string, trackId: string): string {
  const store = useQuitHabitsStore.getState();
  return openCravingFor(store.cravingSessions, habitId)?.id ?? store.startCraving(habitId, trackId);
}

// "I'm craving it": an optional rating, a tool (switch any time, the timer
// keeps going), then how it went. It passed: a resisted urge, counted quietly.
// Still here: back to the tools. I slipped: the hard-day flow, with no shame.
function CravingStage({ habit, track, onDone, onSlipped }: { habit: QuitHabit; track: QuitTrack; onDone: () => void; onSlipped: (sessionId: string) => void }) {
  const store = useQuitHabitsStore.getState();
  const sessions = useQuitHabitsStore((s) => s.cravingSessions);
  const feelingEntries = useQuitHabitsStore((s) => s.feelingEntries);
  const tracks = useQuitHabitsStore((s) => s.tracks);
  // Started when "I'm craving it" was tapped (startOrResumeCraving); reopening
  // brings the same session back, with its timer right.
  const [sessionId] = useState(() => openCravingFor(useQuitHabitsStore.getState().cravingSessions, habit.id)?.id ?? '');
  const session = sessions.find((s) => s.id === sessionId);
  const [phase, setPhase] = useState<'rate' | 'tools' | 'tool' | 'after' | 'passed'>(() => (session && session.tools.length ? 'tools' : 'rate'));
  const [tool, setTool] = useState<string | null>(null);
  const [doneEntryId, setDoneEntryId] = useState<string | null>(null);
  const [stillHere, setStillHere] = useState(false);
  if (!session) return null;

  const pick = (t: string) => {
    store.tryCravingTool(sessionId, t);
    setTool(t);
    setPhase('tool');
  };
  const passed = () => {
    const last = session.tools[session.tools.length - 1]?.toolId ?? tool ?? DEFAULT_TOOL;
    const entryId = store.addFeelingEntry(track.id, undefined, undefined, undefined, false, true, findTool(habit, last)?.label ?? last, true);
    store.endCraving(sessionId, 'passed', { resistedEntryId: entryId });
    setDoneEntryId(entryId);
    setPhase('passed');
  };
  const resisted = resistedUrgeEntriesForHabit(feelingEntries, tracks, habit.id).length;
  const picked = tool ? findTool(habit, tool) : undefined;
  const ownTool = picked?.category === 'own' ? picked : undefined;
  const footer = (
    <View style={styles.cravingFooter}>
      <PrimaryButton label={CRAVING_COPY.tryElse} variant="outline" onPress={() => setPhase('tools')} style={styles.secondaryActionButton} />
      <PrimaryButton label={CRAVING_COPY.okay} variant="outline" onPress={() => setPhase('after')} style={styles.secondaryActionButton} />
    </View>
  );

  return (
    <>
      {phase !== 'passed' && <RideTimer session={session} />}

      {phase === 'rate' && (
        <>
          <ScreenTitle>{CRAVING_COPY.title}</ScreenTitle>
          <Eyebrow style={styles.fieldLabel}>{CRAVING_COPY.rate}</Eyebrow>
          <RatingChips
            label={CRAVING_COPY.rate}
            value={session.ratingBefore}
            onChange={(n) => {
              store.updateCraving(sessionId, { ratingBefore: n });
              setPhase('tools');
            }}
          />
          <Pressable onPress={() => setPhase('tools')} accessibilityRole="button" hitSlop={8}>
            <Caption style={styles.changeFeelingLink}>{CRAVING_COPY.skip}</Caption>
          </Pressable>
          <SupportLink />
        </>
      )}

      {phase === 'tools' && (
        <>
          <SectionHeading>{CRAVING_COPY.pick}</SectionHeading>
          {stillHere && <Caption style={styles.subtitle}>{CRAVING_COPY.stillHereLine}</Caption>}
          <CravingMenu habit={habit} session={session} onPick={pick} />
          <Pressable onPress={() => setPhase('after')} accessibilityRole="button" hitSlop={8}>
            <Caption style={styles.changeFeelingLink}>{CRAVING_COPY.okay}</Caption>
          </Pressable>
          <SupportLink />
        </>
      )}

      {phase === 'tool' && tool === 'rideItOut' && (
        <>
          <SectionHeading>{findTool(habit, 'rideItOut')?.title}</SectionHeading>
          <Caption style={styles.subtitle}>{CRAVING_COPY.rideLine}</Caption>
          <BreathingExercise accent={accent} />
          {footer}
        </>
      )}

      {phase === 'tool' && tool === 'doSomethingInstead' && (
        <>
          <SectionHeading>Pick one</SectionHeading>
          <View style={styles.list}>
            {REPLACEMENT_SUGGESTIONS.map((s) => (
              <Pressable key={s} onPress={() => setPhase('after')} accessibilityRole="button">
                <Card style={styles.approachCard}>
                  <Body>{s}</Body>
                </Card>
              </Pressable>
            ))}
          </View>
          {footer}
        </>
      )}

      {phase === 'tool' && tool === 'checkFacts' && (
        <>
          <CheckTheFacts onDone={() => setPhase('after')} />
          {footer}
        </>
      )}

      {phase === 'tool' && tool === 'reachOut' && (
        <>
          <ReachOut onDone={() => setPhase('after')} />
          {footer}
        </>
      )}

      {phase === 'tool' && ownTool && (
        <>
          <OwnToolView tool={ownTool} startedAt={session.tools[session.tools.length - 1]?.startedAt ?? session.startedAt} onDone={() => setPhase('after')} />
          {footer}
        </>
      )}

      {phase === 'after' && (
        <>
          <SectionHeading>{CRAVING_COPY.afterTitle}</SectionHeading>
          <RatingChips label={CRAVING_COPY.afterTitle} value={session.ratingAfter} onChange={(n) => store.updateCraving(sessionId, { ratingAfter: n })} />
          <PrimaryButton label={CRAVING_COPY.passed} onPress={passed} style={styles.sheetSubmit} />
          <PrimaryButton
            label={CRAVING_COPY.stillHere}
            variant="outline"
            onPress={() => {
              store.endCraving(sessionId, 'stillHere');
              setStillHere(true);
              setPhase('tools');
            }}
            style={styles.actionButton}
          />
          <PrimaryButton label={CRAVING_COPY.slipped} variant="outline" onPress={() => onSlipped(sessionId)} style={styles.actionButton} />
          <SupportLink />
        </>
      )}

      {phase === 'passed' && (
        <>
          <ScreenTitle>{CRAVING_COPY.passedTitle}</ScreenTitle>
          <Body style={styles.relapseIntroText}>{CRAVING_COPY.passedLine(resisted, habit.name)}</Body>
          {doneEntryId && <SoftFeelingOffer habit={habit} source={{ kind: 'quitHabit', refId: habit.id, linkId: doneEntryId }} />}
          <PrimaryButton label="Done" onPress={onDone} style={styles.sheetSubmit} />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The streak as something to actually look at, not just a number — the
// centerpiece of the Journey home view. A warm, simple ring plus a progress
// track toward the next real milestone; no game-like meter, no loss framing.
const QUIT_MILESTONE_DAYS = [1, 7, 14, 30, 60, 90, 180, 365];

function StreakVisual({ elapsed }: { elapsed: number }) {
  const next = QUIT_MILESTONE_DAYS.find((d) => d > elapsed);
  const progress = next ? Math.min(1, elapsed / next) : 1;
  return (
    <View style={styles.streakVisualWrap}>
      <View style={styles.streakRing}>
        <ScreenTitle style={{ color: accent }}>{elapsed}</ScreenTitle>
        <Caption>{elapsed === 1 ? 'day' : 'days'}</Caption>
      </View>
      {next && (
        <>
          <View style={styles.streakProgressTrack}>
            <View style={[styles.streakProgressFill, { width: `${progress * 100}%`, backgroundColor: accent }]} />
          </View>
          <Caption>{next - elapsed} {next - elapsed === 1 ? 'day' : 'days'} to day {next}</Caption>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The first thing shown when opening an active Quit track — a genuinely
// motivating home view built from real, honest data (streak, why, a rotating
// true stat), not dark patterns: no streak-loss anxiety, no notification
// nagging, no manufactured urgency. One clear action (logging how you feel)
// sits right here too, so this view and the actual logging aren't two
// separate places to navigate between.
function JourneyStage({
  habitId,
  onBack,
  onOpenTrack,
  onOpenAnalysis,
  onOpenToolkit,
}: {
  habitId: string;
  onBack: () => void;
  onOpenTrack: (trackId: string) => void;
  onOpenAnalysis: () => void;
  onOpenToolkit: () => void;
}) {
  const { requestDelete } = useUi();
  const habits = useQuitHabitsStore((s) => s.habits);
  const tracks = useQuitHabitsStore((s) => s.tracks);
  const feelingEntries = useQuitHabitsStore((s) => s.feelingEntries);
  const deleteQuitHabit = useQuitHabitsStore((s) => s.deleteQuitHabit);
  const addFeelingEntry = useQuitHabitsStore((s) => s.addFeelingEntry);

  const startNewTrack = useQuitHabitsStore((s) => s.startNewTrack);
  const buildHabits = useHabitsStore((s) => s.habits);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [feelingSheetOpen, setFeelingSheetOpen] = useState(false);
  // The chapter a hard day is being marked in, captured when tapped: starting
  // a new chapter from the slip flow mustn't make the flow lose its place.
  const [slipping, setSlipping] = useState<{ track: QuitTrack; cravingSessionId?: string } | null>(null);
  const [urgingTrack, setUrgingTrack] = useState<QuitTrack | null>(null);
  const slips = useQuitHabitsStore((s) => s.slips);
  const cravingSessions = useQuitHabitsStore((s) => s.cravingSessions);
  const primary = useSettingsStore((s) => s.quitPrimaryNumber);

  const habit = habits.find((h) => h.id === habitId);

  if (!habit) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Back</Caption>
        </Pressable>
        <Body>This one isn't in your list anymore.</Body>
      </>
    );
  }

  const today = todayISO();
  const active = activeTrackFor(tracks, habitId);

  if (slipping) {
    return <SlipStage habit={habit} track={slipping.track} cravingSessionId={slipping.cravingSessionId} onBack={() => setSlipping(null)} onDone={() => setSlipping(null)} />;
  }

  if (urgingTrack) {
    return (
      <CravingStage
        habit={habit}
        track={urgingTrack}
        onDone={() => setUrgingTrack(null)}
        onSlipped={(cravingSessionId) => {
          setUrgingTrack(null);
          setSlipping({ track: urgingTrack, cravingSessionId });
        }}
      />
    );
  }

  const ascendingTracks = tracksForHabit(tracks, habitId);
  const numberedTracks = ascendingTracks.map((t, i) => ({ track: t, number: i + 1 })).reverse();
  const counts = journeyCounts(tracks, slips, habitId, today);
  const headline = journeyHeadline(counts, primary);
  const shownNumber = primary === 'clean' ? counts.cleanDays : primary === 'run' ? counts.currentRun : counts.journeyDays;
  const journeyStart = ascendingTracks.reduce((min, t) => (t.startDate < min ? t.startDate : min), ascendingTracks[0]?.startDate ?? today);
  const milestone = active ? quitMilestoneMessage(counts.journeyDays) : undefined;
  const openCraving = openCravingFor(cravingSessions, habitId);
  const rotatingStat = active ? rotatingJourneyStat(feelingEntries, tracks, habitId, today) : undefined;
  const pairedHabit = habit.replacementHabitId ? buildHabits.find((h) => h.id === habit.replacementHabitId) : undefined;

  const removeHabit = () => {
    requestDelete({
      message: `Delete "${habit.name}" and its whole journey, every track and urge? This can't be undone. Feelings you noted stay in your Feelings log.`,
      perform: () => {
        deleteQuitHabit(habitId);
        onBack();
      },
    });
  };

  return (
    <>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Quit a Habit</Caption>
        </Pressable>
        <Pressable onPress={removeHabit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete quit habit">
          <Ionicons name="trash-outline" size={18} color={colors.inkSoft} />
        </Pressable>
      </View>

      <SectionHeading>{habit.name}</SectionHeading>

      {ascendingTracks.length > 0 && (
        <>
          <StreakVisual elapsed={shownNumber} />
          <Body style={styles.journeyHeadline} accessibilityRole="header">{headline.headline}</Body>
          <Caption style={styles.sinceText}>{headline.smaller.join(' · ')}</Caption>
          <Caption style={styles.sinceText}>Since {formatDisplayDate(journeyStart)}</Caption>
        </>
      )}

      {active ? (
        <>
          {openCraving && (
            <Pressable onPress={() => setUrgingTrack(active)} accessibilityRole="button">
              <Card style={[styles.rotatingStatCard, { borderLeftColor: accent }]}>
                <Caption style={{ color: accent }}>{CRAVING_COPY.resume(formatRideTimer(sessionSeconds(openCraving, Date.now())))}</Caption>
              </Card>
            </Pressable>
          )}

          {milestone && (
            <Card style={styles.milestoneCard}>
              <Ionicons name="sparkles-outline" size={16} color={colors.amber} />
              <Body style={styles.milestoneText}>{milestone}</Body>
            </Card>
          )}

          {habit.why && (
            <Card style={[styles.whyCard, { borderLeftColor: accent }]}>
              <Eyebrow style={{ color: accent }}>Your why</Eyebrow>
              <Body>{habit.why}</Body>
            </Card>
          )}

          {rotatingStat && (
            <Card style={[styles.rotatingStatCard, { borderLeftColor: accent }]}>
              <Caption style={{ color: accent }}>{rotatingStat}</Caption>
            </Card>
          )}

          <PrimaryButton label="Log how I feel right now" onPress={() => setFeelingSheetOpen(true)} style={styles.actionButton} />

          <View style={styles.secondaryActionsRow}>
            <PrimaryButton
              label="I'm craving it"
              variant="outline"
              onPress={() => {
                startOrResumeCraving(habitId, active.id);
                setUrgingTrack(active);
              }}
              style={styles.secondaryActionButton}
            />
            <PrimaryButton
              label="I had a hard day"
              variant="outline"
              onPress={() => setSlipping({ track: active })}
              style={styles.secondaryActionButton}
            />
          </View>

          {/* Below the actions: someone opening Ona mid-craving finds
              "I'm craving it" where it always is. */}
          <ToolkitOffer habit={habit} onOpen={onOpenToolkit} />
        </>
      ) : (
        <>
          <Body style={styles.emptyText}>No chapter going on right now. Start one whenever you're ready; your journey carries on either way.</Body>
          <PrimaryButton label="Start a new chapter" onPress={() => startNewTrack(habitId)} style={styles.actionButton} />
        </>
      )}

      {pairedHabit && (
        <Pressable onPress={() => navigation.push('habitBuilder', { openHabitId: pairedHabit.id })}>
          <Card style={[styles.pairedCard, { borderLeftColor: accent, borderLeftWidth: 3 }]}>
            <Ionicons name="swap-horizontal-outline" size={20} color={accent} />
            <View style={styles.analysisEntryText}>
              <Eyebrow style={{ color: accent }}>Doing instead</Eyebrow>
              <Body>{pairedHabit.name}</Body>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
          </Card>
        </Pressable>
      )}

      <ToolkitEntry onOpen={onOpenToolkit} />

      <Pressable onPress={onOpenAnalysis}>
        <Card style={[styles.section, styles.analysisEntry]}>
          <Ionicons name="analytics-outline" size={20} color={accent} />
          <View style={styles.analysisEntryText}>
            <Body>Analysis</Body>
            <Caption>Stats, your whole journey charted, patterns and the full log</Caption>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
        </Card>
      </Pressable>

      <Card style={styles.safeguardCard}>
        <Eyebrow style={styles.safeguardLabel}>A quiet note</Eyebrow>
        <Body>
          If what you're working on involves substance use or another habit with real health risk, this section
          isn't a substitute for professional support — reaching out to someone qualified can genuinely help,
          whenever you're ready.
        </Body>
      </Card>

      <Eyebrow style={styles.journeyHeading}>Your journey</Eyebrow>
      <Caption style={styles.journeySubtitle}>Every chapter, not just the current one.</Caption>
      <View style={styles.list}>
        {numberedTracks.map(({ track, number }) => (
          <Pressable key={track.id} onPress={() => onOpenTrack(track.id)}>
            <Card style={[styles.trackCard, track.status === 'active' && { borderLeftColor: accent, borderLeftWidth: 3 }]}>
              <View style={styles.trackHeader}>
                <Body>Track {number}</Body>
                {track.status === 'active' ? (
                  <Caption style={{ color: accent }}>Ongoing — Day {daysSinceTrackStart(track, today)}</Caption>
                ) : (
                  <Caption>{dayCount(daysSinceTrackStart(track, track.endDate!))}</Caption>
                )}
              </View>
              <Caption>
                {formatDisplayDate(track.startDate)}
                {track.endDate ? ` – ${formatDisplayDate(track.endDate)}` : ' – present'}
              </Caption>
            </Card>
          </Pressable>
        ))}
      </View>

      {active && (
        <FeelingSheet
          visible={feelingSheetOpen}
          onClose={() => setFeelingSheetOpen(false)}
          onSubmit={(feeling, zone, note) => logFeeling({ source: { kind: 'quitHabit', refId: habitId, trackId: active.id }, zone, feelingIds: [feeling.id], note })}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
function TrackDetailStage({ habitId, trackId, onBack }: { habitId: string; trackId: string; onBack: () => void }) {
  const habits = useQuitHabitsStore((s) => s.habits);
  const tracks = useQuitHabitsStore((s) => s.tracks);
  const feelingEntries = useQuitHabitsStore((s) => s.feelingEntries);
  const personalFeelings = useFeelingsStore((s) => s.personalFeelings);

  const habit = habits.find((h) => h.id === habitId);
  const track = tracks.find((t) => t.id === trackId);

  if (!habit || !track) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Back</Caption>
        </Pressable>
        <Body>This track isn't around anymore.</Body>
      </>
    );
  }

  const ascendingTracks = tracksForHabit(tracks, habitId);
  const trackNumber = ascendingTracks.findIndex((t) => t.id === trackId) + 1;
  const entries = feelingEntriesForTrack(feelingEntries, trackId);
  const today = todayISO();

  return (
    <>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
        <Caption> {habit.name}</Caption>
      </Pressable>

      <SectionHeading>Track {trackNumber}</SectionHeading>
      <Caption style={styles.subtitle}>
        {formatDisplayDate(track.startDate)}
        {track.endDate ? ` – ${formatDisplayDate(track.endDate)}` : ' – present'}
        {track.status === 'active' ? ` · Day ${daysSinceTrackStart(track, today)}` : ` · ${dayCount(daysSinceTrackStart(track, track.endDate!))}`}
      </Caption>

      <View style={styles.list}>
        {entries.length === 0 && <Body style={styles.emptyText}>Nothing documented in this track yet.</Body>}
        {entries.map((e) => {
          const feeling = e.feelingId ? findFeeling(e.feelingId) ?? personalFeelings.find((p) => p.id === e.feelingId) : undefined;
          const meta = e.zone ? zoneMeta(e.zone) : undefined;
          const title = feeling?.name ?? meta?.label ?? (e.isResistedUrge ? 'Resisted an urge' : 'Noted');
          return (
            <Card key={e.id} style={[styles.timelineCard, { borderLeftColor: meta?.accent ?? colors.amber, borderLeftWidth: 3 }]}>
              <View style={styles.trackHeader}>
                <Body style={{ color: meta?.accent ?? colors.amber }}>{title}</Body>
                <Caption>{formatDisplayDate(e.createdAt.slice(0, 10))}</Caption>
              </View>
              {e.isRelapseMoment && <Caption style={styles.relapseTag}>Documented as this track ended</Caption>}
              {e.note && <Body>{e.note}</Body>}
            </Card>
          );
        })}
      </View>

      {track.relapseReflection && (
        <Card style={[styles.whyCard, { borderLeftColor: accent }]}>
          <Eyebrow style={{ color: accent }}>What led to this</Eyebrow>
          <Body>{track.relapseReflection}</Body>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
function OverviewStage({ onOpenHabit }: { onOpenHabit: (habitId: string) => void }) {
  const habits = useQuitHabitsStore((s) => s.habits);
  const tracks = useQuitHabitsStore((s) => s.tracks);
  const slips = useQuitHabitsStore((s) => s.slips);
  const [addOpen, setAddOpen] = useState(false);
  const today = todayISO();

  return (
    <>
      <ScreenTitle>Quit a Habit</ScreenTitle>
      <Caption style={styles.subtitle}>A journey, not a single unbroken streak.</Caption>

      {habits.length === 0 && <Body style={styles.emptyText}>Nothing yet — start below, whenever you're ready.</Body>}
      {habits.length === 0 && <SeeHowItWorks sectionId="quitHabit" />}

      <View style={styles.list}>
        {habits.map((h) => {
          const counts = journeyCounts(tracks, slips, h.id, today);
          const attempts = tracksForHabit(tracks, h.id).length;
          return (
            <Pressable key={h.id} onPress={() => onOpenHabit(h.id)}>
              <Card style={[styles.habitCard, { borderLeftColor: accent, borderLeftWidth: 3 }]}>
                <Body>{h.name}</Body>
                <Caption>
                  {`Day ${counts.journeyDays} of your journey`}
                  {attempts > 1 ? ` · ${attempts} chapters` : ''}
                </Caption>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <PrimaryButton label="Start quitting something" onPress={() => setAddOpen(true)} style={styles.addButton} />
      <AddQuitHabitSheet visible={addOpen} onClose={() => setAddOpen(false)} onCreated={onOpenHabit} />
    </>
  );
}

// ---------------------------------------------------------------------------
export function QuitHabitScreen({ route, header }: Props & { header?: React.ReactNode }) {
  const { openHabitId } = route.params ?? {};
  const [stack, setStack] = useState<ScreenState[]>(() =>
    openHabitId ? [{ kind: 'overview' }, { kind: 'journey', habitId: openHabitId }] : [{ kind: 'overview' }]
  );
  const current = stack[stack.length - 1];
  const push = (s: ScreenState) => setStack((prev) => [...prev, s]);
  const stepBack = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));

  useBackHandler({ stepBack: stack.length > 1 ? stepBack : undefined });

  return (
    <Screen>
      {header}
      {current.kind === 'overview' && <OverviewStage onOpenHabit={(habitId) => push({ kind: 'journey', habitId })} />}
      {current.kind === 'journey' && (
        <JourneyStage
          habitId={current.habitId}
          onBack={stepBack}
          onOpenTrack={(trackId) => push({ kind: 'trackDetail', habitId: current.habitId, trackId })}
          onOpenAnalysis={() => push({ kind: 'analysis', habitId: current.habitId })}
          onOpenToolkit={() => push({ kind: 'toolkit', habitId: current.habitId })}
        />
      )}
      {current.kind === 'toolkit' && <ToolkitStage habitId={current.habitId} onBack={stepBack} />}
      {current.kind === 'analysis' && <QuitHabitAnalysisStage habitId={current.habitId} onBack={stepBack} />}
      {current.kind === 'trackDetail' && <TrackDetailStage habitId={current.habitId} trackId={current.trackId} onBack={stepBack} />}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  softOffer: { marginTop: spacing.md, gap: spacing.xs },
  softOfferActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  softOfferAction: { flex: 1 },
  softOfferLink: { marginTop: spacing.md, minHeight: 40, justifyContent: 'center' },
  softOfferDone: { marginTop: spacing.md, color: colors.inkSoft },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  emptyText: {
    color: colors.inkSoft,
    marginBottom: spacing.md,
  },
  list: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  habitCard: {
    gap: 2,
  },
  addButton: {
    marginBottom: spacing.xl,
  },
  fieldLabel: {
    marginTop: spacing.sm,
  },
  sheetInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
  },
  notesInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  sheetSubmit: {
    marginTop: spacing.md,
  },
  definitionText: {
    marginBottom: spacing.xs,
  },
  changeFeelingLink: {
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  activeCard: {
    gap: 2,
    marginBottom: spacing.md,
  },
  milestoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: withAlpha(colors.amber, 0.1),
    marginBottom: spacing.md,
  },
  milestoneText: {
    flex: 1,
  },
  whyCard: {
    gap: spacing.xs,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
  },
  actionButton: {
    marginBottom: spacing.sm,
  },
  safeguardCard: {
    backgroundColor: colors.stone,
    borderLeftWidth: 3,
    borderLeftColor: colors.amber,
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  safeguardLabel: {
    color: colors.amber,
  },
  journeyHeading: {
    marginTop: spacing.xs,
  },
  journeySubtitle: {
    marginBottom: spacing.sm,
  },
  trackCard: {
    gap: 2,
  },
  trackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timelineCard: {
    gap: 4,
  },
  relapseTag: {
    fontStyle: 'italic',
  },
  relapseIntroText: {
    marginBottom: spacing.md,
  },
  durationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  durationChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  durationChipTextActive: {
    color: colors.white,
  },
  suggestionList: {
    gap: 2,
    marginBottom: spacing.lg,
  },
  suggestionItem: {
    color: colors.inkSoft,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipTextActive: {
    color: colors.white,
  },
  section: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  insteadHint: {
    color: colors.inkSoft,
  },
  pairedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  analysisEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  analysisEntryText: {
    flex: 1,
    gap: 2,
  },
  approachCard: {
    gap: 2,
    marginBottom: spacing.sm,
  },
  streakVisualWrap: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  streakRing: {
    width: 140,
    height: 140,
    borderRadius: radii.full,
    borderWidth: 6,
    borderColor: accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sinceText: {
    textAlign: 'center',
    color: colors.inkSoft,
    marginBottom: spacing.md,
  },
  streakProgressTrack: {
    width: '100%',
    height: 6,
    borderRadius: radii.full,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  streakProgressFill: {
    height: '100%',
  },
  rotatingStatCard: {
    borderLeftWidth: 3,
    marginBottom: spacing.md,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  secondaryActionButton: {
    flex: 1,
  },
  journeyHeadline: {
    textAlign: 'center',
    marginTop: spacing.sm,
    fontFamily: fonts.bodyMedium,
  },
  supportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: spacing.lg,
    minHeight: 44,
  },
  ratingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  ratingChip: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  rideTimer: {
    alignSelf: 'center',
    color: colors.inkSoft,
    marginBottom: spacing.sm,
  },
  cravingFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
}));
