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
} from '../store/useQuitHabitsStore';
import { rotatingJourneyStat } from '../utils/habitStats';
import { QuitHabitAnalysisStage } from './QuitHabitAnalysis';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { useHabitsStore } from '../store/useHabitsStore';
import type { Feeling, FeelingSource, FeelingZone, QuitHabit, QuitTrack } from '../types/sections';
import type { RootStackParamList } from '../navigation/types';
import { themedStyles } from '../theme/runtime';
import { useSettingsStore } from '../store/useSettingsStore';
import { ItemFeelingPrompt } from '../components/ItemFeelingSheet';
import { logItemFeeling, shouldAskItemFeeling } from '../utils/itemFeelings';
import { SeeHowItWorks } from '../discover/SeeHowItWorks';

type Props = NativeStackScreenProps<RootStackParamList, 'quitHabit'>;

const accent = sectionAccents.quitHabit;

type ScreenState =
  | { kind: 'overview' }
  | { kind: 'journey'; habitId: string }
  | { kind: 'trackDetail'; habitId: string; trackId: string }
  | { kind: 'analysis'; habitId: string };

function findFeeling(id: string): Feeling | undefined {
  return feelings.find((f) => f.id === id);
}

// ---------------------------------------------------------------------------
function AddQuitHabitSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (habitId: string) => void }) {
  const addQuitHabit = useQuitHabitsStore((s) => s.addQuitHabit);
  const setReplacementHabit = useQuitHabitsStore((s) => s.setReplacementHabit);
  const addHabit = useHabitsStore((s) => s.addHabit);
  const [name, setName] = useState('');
  const [why, setWhy] = useState('');
  const [instead, setInstead] = useState('');

  const reset = () => {
    setName('');
    setWhy('');
    setInstead('');
  };

  return (
    <SheetModal visible={visible} onClose={() => { reset(); onClose(); }}>
      <SectionHeading>What do you want to quit?</SectionHeading>
      <Eyebrow style={styles.fieldLabel}>Name it</Eyebrow>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. Smoking, nail biting, late-night scrolling" style={styles.sheetInput} />

      <Eyebrow style={styles.fieldLabel}>Your why (optional, resurfaced later)</Eyebrow>
      <TextInput value={why} onChangeText={setWhy} placeholder="Your own reason for wanting this..." style={styles.notesInput} multiline />

      <Eyebrow style={styles.fieldLabel}>Want to pair this with something to do instead? (optional)</Eyebrow>
      <Caption style={styles.insteadHint}>Having something to do instead can help when an urge comes. This adds a small habit to Build, cued by the urge itself.</Caption>
      <TextInput value={instead} onChangeText={setInstead} placeholder="e.g. chew gum, take a short walk" style={styles.sheetInput} />

      <PrimaryButton
        label="Start"
        disabled={!name.trim()}
        onPress={() => {
          const { habitId } = addQuitHabit(name, why);
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
// The relapse flow — the part of this section that matters most to get
// right. Nothing here calls it a failure; the old track is never deleted.
function RelapseStage({
  habit,
  track,
  onBack,
  onDone,
}: {
  habit: QuitHabit;
  track: QuitTrack;
  onBack: () => void;
  onDone: () => void;
}) {
  const addFeelingEntry = useQuitHabitsStore((s) => s.addFeelingEntry);
  const archiveTrack = useQuitHabitsStore((s) => s.archiveTrack);
  const startNewTrack = useQuitHabitsStore((s) => s.startNewTrack);

  // No feeling step: how you feel is a gentle offer inside "reflect".
  const [phase, setPhase] = useState<'intro' | 'reflect' | 'done'>('intro');
  const [reflection, setReflection] = useState('');
  // Same reasonTagOptions list as Feelings/Habits — what was going on when
  // this track ended, for the "What was going on" card in Analysis.
  const [reasonTags, setReasonTags] = useState<string[]>([]);
  const toggleReasonTag = (tag: string) =>
    setReasonTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const elapsed = daysSinceTrackStart(track, todayISO());

  // Documents this chapter and archives it — but doesn't decide what
  // happens next. Starting a new track is a separate, later choice.
  const document = () => {
    archiveTrack(track.id, reflection, reasonTags.length > 0 ? reasonTags : undefined);
    setPhase('done');
  };

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
          <ScreenTitle>This isn't a failure</ScreenTitle>
          <Body style={styles.relapseIntroText}>
            Going back to {habit.name.toLowerCase()} doesn't erase day {elapsed} — or anything you felt and learned
            along the way. Let's take a moment to understand this together, then start fresh whenever you're ready.
          </Body>
          {habit.why && (
            <Card style={[styles.whyCard, { borderLeftColor: accent }]}>
              <Eyebrow style={{ color: accent }}>Remember why you started</Eyebrow>
              <Body>{habit.why}</Body>
            </Card>
          )}
          <PrimaryButton label="Continue" onPress={() => setPhase('reflect')} style={styles.sheetSubmit} />
        </>
      )}

      {phase === 'reflect' && (
        <>
          <SectionHeading>One more thing, if you're up for it</SectionHeading>
          <Eyebrow style={styles.fieldLabel}>What was going on? (entirely optional)</Eyebrow>
          <View style={styles.chipRow}>
            {reasonTagOptions.map((tag) => (
              <Pressable key={tag} onPress={() => toggleReasonTag(tag)} style={[styles.chip, reasonTags.includes(tag) && { backgroundColor: accent }]}>
                <Body style={reasonTags.includes(tag) ? styles.chipTextActive : undefined}>{tag}</Body>
              </Pressable>
            ))}
          </View>
          <Eyebrow style={styles.fieldLabel}>What led to this, if you're able to name it? (entirely optional)</Eyebrow>
          <TextInput
            value={reflection}
            onChangeText={setReflection}
            placeholder="No pressure at all — leave blank and continue if you'd rather not."
            style={styles.notesInput}
            multiline
          />
          <SoftFeelingOffer habit={habit} source={{ kind: 'quitHabit', refId: habit.id, trackId: track.id, slip: true }} />
          <PrimaryButton label="Save this chapter" onPress={document} style={styles.sheetSubmit} />
        </>
      )}

      {phase === 'done' && (
        <>
          <ScreenTitle>This chapter is saved</ScreenTitle>
          <Body style={styles.relapseIntroText}>
            Everything you just documented is part of your journey now, not erased. Start a new track whenever
            you're ready — right now, or later.
          </Body>
          <PrimaryButton
            label="Start a new track now"
            onPress={() => {
              startNewTrack(track.quitHabitId);
              onDone();
            }}
            style={styles.sheetSubmit}
          />
          <Pressable onPress={onDone}>
            <Caption style={styles.changeFeelingLink}>Not right now — I'll start when I'm ready</Caption>
          </Pressable>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Short, concrete things to do instead of acting on the urge — generic in
// this first version, no personalization needed.
const REPLACEMENT_SUGGESTIONS = [
  'Drink a glass of water',
  'Step outside for a minute',
  'Stretch',
  'Splash cold water on your face',
];

const URGE_TIMER_MINUTES = [5, 10, 15, 20];

// The urge-surfing timer — a countdown paired with the existing guided
// breathing exercise. Ending early is always available; the point of the
// whole flow is the attempt, not completing a fixed duration.
function UrgeTimer({ onFinish }: { onFinish: () => void }) {
  const [durationMin, setDurationMin] = useState(() => useSettingsStore.getState().quitUrgeMinutes);
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(durationMin * 60);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    setSecondsLeft(durationMin * 60);
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onFinish();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  React.useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  if (!running) {
    return (
      <>
        <SectionHeading>Let's ride this out together</SectionHeading>
        <Body style={styles.relapseIntroText}>
          Urges pass, usually within minutes, whether or not you act on them. Pick a length and give this one a
          chance to pass on its own.
        </Body>
        <Eyebrow style={styles.fieldLabel}>Timer length</Eyebrow>
        <View style={styles.durationRow}>
          {URGE_TIMER_MINUTES.map((m) => (
            <Pressable key={m} onPress={() => setDurationMin(m)} style={[styles.durationChip, durationMin === m && { backgroundColor: accent }]}>
              <Body style={durationMin === m ? styles.durationChipTextActive : undefined}>{m} min</Body>
            </Pressable>
          ))}
        </View>
        <PrimaryButton label="Start" onPress={start} style={styles.sheetSubmit} />
      </>
    );
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <>
      <SectionHeading>{mm}:{ss}</SectionHeading>
      <BreathingExercise accent={accent} />
      <PrimaryButton
        label="I'm done waiting"
        variant="outline"
        onPress={() => {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onFinish();
        }}
        style={styles.sheetSubmit}
      />
    </>
  );
}

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
        Message or call someone — you don't have to say why, or say much at all. Just not being alone with this
        for a few minutes can be enough.
      </Body>
      <PrimaryButton
        label="Open Messages"
        variant="outline"
        onPress={() => { Linking.openURL('sms:').catch(() => {}); }}
        style={styles.actionButton}
      />
      <PrimaryButton label="I reached out" onPress={onDone} style={styles.sheetSubmit} />
      <Pressable onPress={onDone}>
        <Caption style={styles.changeFeelingLink}>I'll just wait it out here instead</Caption>
      </Pressable>
    </>
  );
}

type UrgeApproach = 'rideItOut' | 'doSomethingInstead' | 'checkFacts' | 'reachOut';
const APPROACH_LABELS: Record<UrgeApproach, string> = {
  rideItOut: 'Riding it out',
  doSomethingInstead: 'Doing something instead',
  checkFacts: 'Checking the facts',
  reachOut: 'Reaching out',
};

// The resisted-urge flow — feeling, then a menu of evidence-based approaches
// (not just one timer), then a no-judgment check-in. Logged as a resisted
// urge regardless of outcome; the point is the attempt, not a pass/fail
// grade — but the outcome and chosen approach are both saved so Analysis can
// learn what's actually worked for this specific user over time.
function UrgeStage({ habit, track, onDone }: { habit: QuitHabit; track: QuitTrack; onBack: () => void; onDone: () => void }) {
  const addFeelingEntry = useQuitHabitsStore((s) => s.addFeelingEntry);
  const feelingEntries = useQuitHabitsStore((s) => s.feelingEntries);
  const tracks = useQuitHabitsStore((s) => s.tracks);

  // Straight to what might help; noting a feeling is offered at the end.
  const [phase, setPhase] = useState<'menu' | 'approach' | 'outcome' | 'done'>('menu');
  const [urgeEntryId, setUrgeEntryId] = useState<string | null>(null);
  const [approach, setApproach] = useState<UrgeApproach | null>(null);
  const [approachDetail, setApproachDetail] = useState<string | null>(null);

  const finish = (urgePassed: boolean) => {
    const label = approachDetail ?? (approach ? APPROACH_LABELS[approach] : undefined);
    setUrgeEntryId(addFeelingEntry(track.id, undefined, undefined, undefined, false, true, label, urgePassed));
    setPhase('done');
  };

  const resistedCount = resistedUrgeEntriesForHabit(feelingEntries, tracks, habit.id).length;

  return (
    <>
      {phase === 'menu' && (
        <>
          <SectionHeading>What would help right now?</SectionHeading>
          <Caption style={styles.subtitle}>Pick whatever feels right — there's no wrong choice here.</Caption>
          <Pressable onPress={() => { setApproach('rideItOut'); setPhase('approach'); }}>
            <Card style={styles.approachCard}>
              <Body>Ride it out</Body>
              <Caption>A short timer with guided breathing while the urge passes on its own.</Caption>
            </Card>
          </Pressable>
          <Pressable onPress={() => { setApproach('doSomethingInstead'); setPhase('approach'); }}>
            <Card style={styles.approachCard}>
              <Body>Do something instead</Body>
              <Caption>A few quick, concrete things to do right now.</Caption>
            </Card>
          </Pressable>
          <Pressable onPress={() => { setApproach('checkFacts'); setPhase('approach'); }}>
            <Card style={styles.approachCard}>
              <Body>Check the facts</Body>
              <Caption>A short guided look at what's actually true right now.</Caption>
            </Card>
          </Pressable>
          <Pressable onPress={() => { setApproach('reachOut'); setPhase('approach'); }}>
            <Card style={styles.approachCard}>
              <Body>Reach out</Body>
              <Caption>Message or call someone — you don't have to be alone with this.</Caption>
            </Card>
          </Pressable>
        </>
      )}

      {phase === 'approach' && approach === 'rideItOut' && <UrgeTimer onFinish={() => setPhase('outcome')} />}

      {phase === 'approach' && approach === 'doSomethingInstead' && (
        <>
          <SectionHeading>Pick one</SectionHeading>
          <View style={styles.list}>
            {REPLACEMENT_SUGGESTIONS.map((s) => (
              <Pressable key={s} onPress={() => { setApproachDetail(s); setPhase('outcome'); }}>
                <Card style={styles.approachCard}>
                  <Body>{s}</Body>
                </Card>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {phase === 'approach' && approach === 'checkFacts' && <CheckTheFacts onDone={() => setPhase('outcome')} />}

      {phase === 'approach' && approach === 'reachOut' && <ReachOut onDone={() => setPhase('outcome')} />}

      {phase === 'outcome' && (
        <>
          <SectionHeading>Did the urge pass?</SectionHeading>
          <Body style={styles.relapseIntroText}>Either way, you rode it out instead of acting on it — that counts.</Body>
          <PrimaryButton label="Yes, it passed" onPress={() => finish(true)} style={styles.sheetSubmit} />
          <PrimaryButton label="Not really, but I didn't act on it" variant="outline" onPress={() => finish(false)} style={styles.actionButton} />
        </>
      )}

      {phase === 'done' && (
        <>
          <ScreenTitle>Urge resisted</ScreenTitle>
          <Body style={styles.relapseIntroText}>
            You've resisted {resistedCount} {resistedCount === 1 ? 'urge' : 'urges'} on {habit.name.toLowerCase()} so far.
          </Body>
          {urgeEntryId && <SoftFeelingOffer habit={habit} source={{ kind: 'quitHabit', refId: habit.id, linkId: urgeEntryId }} />}
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
}: {
  habitId: string;
  onBack: () => void;
  onOpenTrack: (trackId: string) => void;
  onOpenAnalysis: () => void;
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
  // Captures the track being relapsed on at the moment "I went back to it" is
  // tapped — archiving it mid-flow makes activeTrackFor() stop finding it,
  // and RelapseStage must keep rendering (through its "chapter saved" step)
  // regardless of that, so it can't be re-derived live from the store.
  const [relapsingTrack, setRelapsingTrack] = useState<QuitTrack | null>(null);
  const [urgingTrack, setUrgingTrack] = useState<QuitTrack | null>(null);

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

  if (relapsingTrack) {
    return (
      <RelapseStage
        habit={habit}
        track={relapsingTrack}
        onBack={() => setRelapsingTrack(null)}
        onDone={() => setRelapsingTrack(null)}
      />
    );
  }

  if (urgingTrack) {
    return <UrgeStage habit={habit} track={urgingTrack} onBack={() => setUrgingTrack(null)} onDone={() => setUrgingTrack(null)} />;
  }

  const ascendingTracks = tracksForHabit(tracks, habitId);
  const numberedTracks = ascendingTracks.map((t, i) => ({ track: t, number: i + 1 })).reverse();
  const elapsed = active ? daysSinceTrackStart(active, today) : 0;
  const milestone = active ? quitMilestoneMessage(elapsed) : undefined;
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

      {active ? (
        <>
          <StreakVisual elapsed={elapsed} />
          <Caption style={styles.sinceText}>Since {formatDisplayDate(active.startDate)}</Caption>

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
              onPress={() => setUrgingTrack(active)}
              style={styles.secondaryActionButton}
            />
            <PrimaryButton
              label="I went back to it"
              variant="outline"
              onPress={() => setRelapsingTrack(active)}
              style={styles.secondaryActionButton}
            />
          </View>
        </>
      ) : (
        <>
          <Body style={styles.emptyText}>No active track right now — start whenever you're ready.</Body>
          <PrimaryButton label="Start a new track" onPress={() => startNewTrack(habitId)} style={styles.actionButton} />
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
                  <Caption>{daysSinceTrackStart(track, track.endDate!)} days</Caption>
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
          onSubmit={(feeling, zone, note) => logItemFeeling({ source: { kind: 'quitHabit', refId: habitId, trackId: active.id }, zone, feelingIds: [feeling.id], note })}
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
        {track.status === 'active' ? ` · Day ${daysSinceTrackStart(track, today)}` : ` · ${daysSinceTrackStart(track, track.endDate!)} days`}
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
          const active = activeTrackFor(tracks, h.id);
          const elapsed = active ? daysSinceTrackStart(active, today) : 0;
          const attempts = tracksForHabit(tracks, h.id).length;
          return (
            <Pressable key={h.id} onPress={() => onOpenHabit(h.id)}>
              <Card style={[styles.habitCard, { borderLeftColor: accent, borderLeftWidth: 3 }]}>
                <Body>{h.name}</Body>
                <Caption>
                  {active ? `Day ${elapsed}` : 'No active track'}
                  {attempts > 1 ? ` · ${attempts} chapters so far` : ''}
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
        />
      )}
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
}));
