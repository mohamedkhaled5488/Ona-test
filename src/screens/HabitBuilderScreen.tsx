import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { SheetModal } from '../components/SheetModal';
import { TimePickerModal } from '../components/TimePickerModal';
import { MonthCalendar } from '../components/MonthCalendar';
import { EntryDetailView } from '../components/EntryDetailView';
import { TimerRing } from '../components/TimerRing';
import { useStopwatch, formatClock } from '../hooks/useStopwatch';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, radii, spacing, fonts } from '../theme';
import { sectionAccents } from '../theme/accents';
import { withAlpha } from '../utils/color';
import { useBackHandler } from '../hooks/useBackHandler';
import { useUi } from '../components/UiProvider';
import { todayISO, formatDisplayDate, formatClockTime } from '../utils/date';
import { durationPresets, starterHabitIdeas } from '../data/habitPresets';
import { reasonTagOptions } from '../data/feelingsWheel';
import { BuildHabitAnalysisStage } from './BuildHabitAnalysis';
import { HabitLogDetail, type LeaveGuard } from './habits/HabitLogDetail';
import { SOFT_MISSED } from './habits/HabitPattern';
import { useQuitHabitsStore } from '../store/useQuitHabitsStore';
import { habitChain, needsReentry, isReviewDue, daysSinceLastActivity } from '../utils/habitStats';
import { frequencyLabel, isScheduledDay, weekStart } from '../utils/habitFrequency';
import {
  useHabitsStore,
  habitStreak,
  daysElapsed,
  habitMilestoneMessage,
  shouldResurfaceWhy,
  checkInsForHabit,
  type HabitInput,
} from '../store/useHabitsStore';
import type { Habit, HabitFrequency } from '../types/sections';
import { themedStyles } from '../theme/runtime';
import { successFeedback } from '../utils/haptics';
import { ItemFeelingPrompt } from '../components/ItemFeelingSheet';
import { shouldAskItemFeeling } from '../utils/itemFeelings';
import { useSettingsStore } from '../store/useSettingsStore';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { SeeHowItWorks } from '../discover/SeeHowItWorks';
import { parseWholeNumberInput } from '../utils/numberInput';

const accent = sectionAccents.habitBuilder;

type Props = NativeStackScreenProps<RootStackParamList, 'habitBuilder'>;

type ScreenState =
  | { kind: 'overview' }
  | { kind: 'folder'; habitId: string }
  | { kind: 'dayDetail'; habitId: string; date: string }
  | { kind: 'analysis'; habitId: string };

// "Every day at 08:00" vs. "Mon, Wed, Fri at 08:00" — weekday habits are only
// reminded on their scheduled days.
function reminderDaysLabel(habit: Habit): string {
  return habit.frequency?.kind === 'weekdays' ? frequencyLabel(habit.frequency) : 'Every day';
}

// ---------------------------------------------------------------------------
// Daily, specific weekdays, or "X times a week" — streaks, the calendar and
// Analysis all count against whichever is picked here.
const WEEKDAY_TOGGLES: { day: number; label: string }[] = [
  { day: 1, label: 'M' },
  { day: 2, label: 'T' },
  { day: 3, label: 'W' },
  { day: 4, label: 'T' },
  { day: 5, label: 'F' },
  { day: 6, label: 'S' },
  { day: 0, label: 'S' },
];

function FrequencyPicker({ value, onChange }: { value: HabitFrequency; onChange: (f: HabitFrequency) => void }) {
  const modes: { kind: HabitFrequency['kind']; label: string }[] = [
    { kind: 'daily', label: 'Every day' },
    { kind: 'weekdays', label: 'Specific days' },
    { kind: 'perWeek', label: 'Times a week' },
  ];
  const pickMode = (kind: HabitFrequency['kind']) => {
    if (kind === value.kind) return;
    if (kind === 'daily') onChange({ kind: 'daily' });
    if (kind === 'weekdays') onChange({ kind: 'weekdays', days: [1, 3, 5] });
    if (kind === 'perWeek') onChange({ kind: 'perWeek', count: 3 });
  };
  return (
    <View style={styles.frequencyWrap}>
      <View style={styles.chipRow}>
        {modes.map((m) => (
          <Pressable key={m.kind} onPress={() => pickMode(m.kind)} style={[styles.chip, value.kind === m.kind && { backgroundColor: accent }]}>
            <Body style={value.kind === m.kind ? styles.chipTextActive : undefined}>{m.label}</Body>
          </Pressable>
        ))}
      </View>
      {value.kind === 'weekdays' && (
        <View style={styles.weekdayRow}>
          {WEEKDAY_TOGGLES.map(({ day, label }) => {
            const on = value.days.includes(day);
            return (
              <Pressable
                key={day}
                accessibilityLabel={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}
                onPress={() => {
                  const days = on ? value.days.filter((d) => d !== day) : [...value.days, day];
                  if (days.length > 0) onChange({ kind: 'weekdays', days }); // at least one day stays picked
                }}
                style={[styles.weekdayToggle, on && { backgroundColor: accent, borderColor: accent }]}
              >
                <Body style={on ? styles.chipTextActive : undefined}>{label}</Body>
              </Pressable>
            );
          })}
        </View>
      )}
      {value.kind === 'perWeek' && (
        <View style={styles.chipRow}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Pressable key={n} onPress={() => onChange({ kind: 'perWeek', count: n })} style={[styles.chip, value.count === n && { backgroundColor: accent }]}>
              <Body style={value.count === n ? styles.chipTextActive : undefined}>{n}×</Body>
            </Pressable>
          ))}
        </View>
      )}
      <Caption style={styles.frequencyHint}>
        {value.kind === 'daily'
          ? 'Every day counts toward the streak.'
          : value.kind === 'weekdays'
            ? `Only ${frequencyLabel(value)} count — days off never break the streak.`
            : `Any ${value.count} days each week (Mon–Sun) — the streak counts weeks you hit it.`}
      </Caption>
    </View>
  );
}

// ---------------------------------------------------------------------------
function AddHabitSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const addHabit = useHabitsStore((s) => s.addHabit);
  const [name, setName] = useState('');
  const [cueRoutine, setCueRoutine] = useState('');
  const [targetDays, setTargetDays] = useState(21);
  const [customDays, setCustomDays] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [identity, setIdentity] = useState('');
  const [minimumVersion, setMinimumVersion] = useState('');
  const [why, setWhy] = useState('');
  const [showIdeas, setShowIdeas] = useState(false);
  const [frequency, setFrequency] = useState<HabitFrequency>({ kind: 'daily' });

  const reset = () => {
    setName('');
    setCueRoutine('');
    setTargetDays(21);
    setCustomDays('');
    setUseCustom(false);
    setIdentity('');
    setMinimumVersion('');
    setWhy('');
    setShowIdeas(false);
    setFrequency({ kind: 'daily' });
  };

  const effectiveDays = useCustom ? Math.max(1, parseWholeNumberInput(customDays) || 0) : targetDays;

  const input: HabitInput = {
    name,
    cueRoutine,
    identity,
    minimumVersion,
    why,
    targetDays: effectiveDays,
    frequency,
  };

  return (
    <SheetModal
      visible={visible}
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <SectionHeading>New habit</SectionHeading>

      <Eyebrow style={styles.fieldLabel}>After I... (the cue)</Eyebrow>
      <TextInput
        value={cueRoutine}
        onChangeText={setCueRoutine}
        placeholder="e.g. pour my morning coffee"
        placeholderTextColor={colors.inkSoft}
        style={styles.sheetInput}
      />

      <Eyebrow style={styles.fieldLabel}>...I will (the habit)</Eyebrow>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. write one journal line" placeholderTextColor={colors.inkSoft} style={styles.sheetInput} />

      <Pressable onPress={() => setShowIdeas(!showIdeas)}>
        <Caption style={styles.ideasLink}>{showIdeas ? 'Hide ideas' : 'Not sure? See some starter ideas'}</Caption>
      </Pressable>
      {showIdeas && (
        <View style={styles.chipRow}>
          {starterHabitIdeas.map((idea) => (
            <Pressable key={idea} onPress={() => setName(idea)} style={styles.chip}>
              <Body>{idea}</Body>
            </Pressable>
          ))}
        </View>
      )}

      <Eyebrow style={styles.fieldLabel}>How often</Eyebrow>
      <FrequencyPicker value={frequency} onChange={setFrequency} />

      <Eyebrow style={styles.fieldLabel}>Target duration</Eyebrow>
      <View style={styles.chipRow}>
        {durationPresets.map((p) => (
          <Pressable
            key={p.days}
            onPress={() => {
              setUseCustom(false);
              setTargetDays(p.days);
            }}
            style={[styles.chip, !useCustom && targetDays === p.days && { backgroundColor: accent }]}
          >
            <Body style={!useCustom && targetDays === p.days ? styles.chipTextActive : undefined}>{p.label}</Body>
          </Pressable>
        ))}
        <Pressable onPress={() => setUseCustom(true)} style={[styles.chip, useCustom && { backgroundColor: accent }]}>
          <Body style={useCustom ? styles.chipTextActive : undefined}>Custom</Body>
        </Pressable>
      </View>
      {useCustom && (
        <TextInput
          value={customDays}
          onChangeText={setCustomDays}
          placeholder="Number of days"
          placeholderTextColor={colors.inkSoft}
          style={styles.sheetInput}
          keyboardType="number-pad"
        />
      )}
      <Caption style={styles.noteText}>
        {durationPresets.find((p) => p.days === targetDays && !useCustom)?.blurb ??
          'Habit formation genuinely varies a lot person to person — not feeling automatic by your target day is completely normal, not a failure.'}
      </Caption>

      <Eyebrow style={styles.fieldLabel}>This is part of becoming someone who... (optional)</Eyebrow>
      <TextInput value={identity} onChangeText={setIdentity} placeholder="e.g. takes care of their body" placeholderTextColor={colors.inkSoft} style={styles.sheetInput} />

      <Eyebrow style={styles.fieldLabel}>Minimum version for hard days (optional)</Eyebrow>
      <TextInput value={minimumVersion} onChangeText={setMinimumVersion} placeholder="e.g. read one page instead of 30 min" placeholderTextColor={colors.inkSoft} style={styles.sheetInput} />

      <Eyebrow style={styles.fieldLabel}>Why do you want this? (optional, resurfaced later)</Eyebrow>
      <TextInput value={why} onChangeText={setWhy} placeholder="Your own reason..." placeholderTextColor={colors.inkSoft} style={styles.notesInput} multiline />

      <PrimaryButton
        label="Create habit"
        disabled={!name.trim() || effectiveDays < 1}
        onPress={() => {
          const id = addHabit(input);
          reset();
          onClose();
          onCreated(id);
        }}
        style={styles.sheetSubmit}
      />
    </SheetModal>
  );
}

// ---------------------------------------------------------------------------
function OverviewStage({ onOpenHabit }: { onOpenHabit: (habitId: string) => void }) {
  const habits = useHabitsStore((s) => s.habits);
  const checkIns = useHabitsStore((s) => s.checkIns);
  const [addOpen, setAddOpen] = useState(false);

  const active = habits.filter((h) => !h.archivedAt && (!h.graduationChoice || h.graduationChoice === 'maintenance'));
  const formed = habits.filter((h) => !h.archivedAt && h.graduationChoice === 'formed');
  const archived = habits.filter((h) => h.archivedAt);

  const renderCard = (habit: Habit) => {
    const { current, paused, unit } = habitStreak(checkIns, habit.id, todayISO(), habit.frequency);
    const elapsed = Math.min(daysElapsed(habit, todayISO()), habit.targetDays);
    return (
      <Pressable key={habit.id} onPress={() => onOpenHabit(habit.id)}>
        <Card style={[styles.habitCard, { borderLeftColor: accent, borderLeftWidth: 3 }]}>
          <View style={styles.habitCardBody}>
            <Body>{habit.name}</Body>
            <Caption>
              Day {elapsed} of {habit.targetDays}
              {current > 0 ? ` · ${paused ? 'paused at' : ''} ${current} ${unit}${current === 1 ? '' : 's'}${paused ? '' : ' streak'}` : ''}
              {habit.frequency ? ` · ${frequencyLabel(habit.frequency)}` : ''}
            </Caption>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
        </Card>
      </Pressable>
    );
  };

  return (
    <>
      <ScreenTitle>Habit Builder</ScreenTitle>
      <Caption style={styles.subtitle}>Small, consistent steps — grounded in how habits actually form, not the 21-day myth alone.</Caption>

      {habits.length === 0 && <Body style={styles.emptyText}>Nothing yet — build your first habit below.</Body>}
      {habits.length === 0 && <SeeHowItWorks sectionId="habitBuilder" />}

      {active.length > 0 && (
        <View style={styles.group}>
          {active.map(renderCard)}
        </View>
      )}

      {formed.length > 0 && (
        <View style={styles.group}>
          <Eyebrow style={styles.groupLabel}>Formed</Eyebrow>
          {formed.map(renderCard)}
        </View>
      )}

      {archived.length > 0 && (
        <View style={styles.group}>
          <Eyebrow style={styles.groupLabel}>Set aside</Eyebrow>
          {archived.map(renderCard)}
        </View>
      )}

      <PrimaryButton label="Build a new habit" onPress={() => setAddOpen(true)} style={styles.addButton} />
      <AddHabitSheet visible={addOpen} onClose={() => setAddOpen(false)} onCreated={onOpenHabit} />
    </>
  );
}

// ---------------------------------------------------------------------------
// The richer "Done" flow: documenting a day with an optional note and/or
// photo before confirming — same pattern as Skills' session logging. The
// user can also just tap Save immediately and skip documentation entirely.
function CheckInSheet({
  habitId,
  date,
  visible,
  initialDone,
  onClose,
}: {
  habitId: string;
  date: string | null;
  visible: boolean;
  initialDone?: boolean;
  onClose: () => void;
}) {
  const { showToast } = useUi();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const checkIns = useHabitsStore((s) => s.checkIns);
  const setCheckIn = useHabitsStore((s) => s.setCheckIn);
  const clearCheckIn = useHabitsStore((s) => s.clearCheckIn);
  const [done, setDone] = useState(true);
  const [minimum, setMinimum] = useState(false);
  const minimumVersion = useHabitsStore((s) => s.habits.find((h) => h.id === habitId)?.minimumVersion);
  const habitName = useHabitsStore((s) => s.habits.find((h) => h.id === habitId)?.name);
  const feelingAsk = useSettingsStore((s) => s.habitFeelingAsk);
  const feelingEntries = useFeelingsStore((s) => s.entries);
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  // Only asked when marking Missed — reuses the same reasonTagOptions as
  // Feelings, so skip patterns become analyzable the same way.
  const [reasonTags, setReasonTags] = useState<string[]>([]);
  // After a "Done" save, offer the optional feeling check as one more light
  // step rather than forcing it — Save already recorded completion, so
  // backing out of this prompt loses nothing.
  const [justSaved, setJustSaved] = useState(false);

  const existing = date ? checkIns.find((c) => c.habitId === habitId && c.date === date) : undefined;

  React.useEffect(() => {
    if (!visible) return;
    setDone(existing?.done ?? initialDone ?? true);
    setMinimum(!!existing?.minimum);
    setNote(existing?.note ?? '');
    setPhotoUri(existing?.photoUri);
    setReasonTags(existing?.reasonTags ?? []);
    setJustSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, date]);

  const toggleReasonTag = (tag: string) =>
    setReasonTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const pickPhoto = async (source: 'camera' | 'library') => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast({ message: 'Permission needed to use the camera/photos.' });
        return;
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
    } catch {
      showToast({ message: "Couldn't open the camera on this device." });
    }
  };

  if (!date) return null;

  if (justSaved) {
    return <ItemFeelingPrompt visible={visible} source={{ kind: 'habit', refId: habitId }} context={`Done: ${habitName ?? 'this habit'}`} onDone={onClose} />;
  }

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <SectionHeading>{formatDisplayDate(date)}</SectionHeading>
      <View style={styles.doneMissedRow}>
        <PrimaryButton label="Done" variant={done && !minimum ? 'primary' : 'outline'} style={styles.doneMissedButton} onPress={() => { setDone(true); setMinimum(false); }} />
        <PrimaryButton label="Missed" variant={!done ? 'primary' : 'outline'} style={styles.doneMissedButton} onPress={() => { setDone(false); setMinimum(false); }} />
      </View>
      {minimumVersion ? (
        <PrimaryButton
          label="Did the minimum version"
          variant={done && minimum ? 'primary' : 'outline'}
          style={styles.minimumButton}
          onPress={() => { setDone(true); setMinimum(true); }}
          accessibilityHint={`Counts as done: ${minimumVersion}`}
        />
      ) : null}
      {done && minimum && minimumVersion ? <Caption style={styles.minimumVersionText}>Still counts: {minimumVersion}</Caption> : null}

      {!done && (
        <>
          <Eyebrow style={styles.fieldLabel}>What got in the way? (optional)</Eyebrow>
          <View style={styles.chipRow}>
            {reasonTagOptions.map((tag) => (
              <Pressable key={tag} onPress={() => toggleReasonTag(tag)} style={[styles.chip, reasonTags.includes(tag) && { backgroundColor: accent }]}>
                <Body style={reasonTags.includes(tag) ? styles.chipTextActive : undefined}>{tag}</Body>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Eyebrow style={styles.fieldLabel}>Note (optional)</Eyebrow>
      <TextInput value={note} onChangeText={setNote} placeholder="How did it go?" style={styles.notesInput} multiline />

      <Eyebrow style={styles.fieldLabel}>Photo (optional)</Eyebrow>
      {photoUri ? (
        <View>
          <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
          <Pressable onPress={() => setPhotoUri(undefined)}>
            <Caption style={styles.removePhotoText}>Remove photo</Caption>
          </Pressable>
        </View>
      ) : (
        <View style={styles.photoButtons}>
          <PrimaryButton label="Take photo" variant="outline" onPress={() => pickPhoto('camera')} style={styles.photoButton} />
          <PrimaryButton label="Choose from library" variant="outline" onPress={() => pickPhoto('library')} style={styles.photoButton} />
        </View>
      )}

      <PrimaryButton
        label="Save"
        style={styles.sheetSubmit}
        onPress={() => {
          setCheckIn(habitId, date, done, note, photoUri, reasonTags, undefined, done && minimum);
          if (done) successFeedback();
          // The optional feeling sheet, per Settings (only for today: a feeling
          // logged now is about now).
          if (done && date === todayISO() && shouldAskItemFeeling(feelingAsk, feelingEntries, 'habit', habitId, todayISO())) {
            setJustSaved(true);
          } else {
            onClose();
          }
        }}
      />
      {existing && (
        <Pressable onPress={() => { clearCheckIn(habitId, date); onClose(); }}>
          <Caption style={styles.clearLink}>Clear this check-in</Caption>
        </Pressable>
      )}
    </SheetModal>
  );
}

// ---------------------------------------------------------------------------
function HabitCalendar({
  habitId,
  onOpenCheckIn,
  onOpenDetail,
}: {
  habitId: string;
  onOpenCheckIn: (date: string) => void;
  onOpenDetail: (date: string) => void;
}) {
  const checkIns = useHabitsStore((s) => s.checkIns);
  const habits = useHabitsStore((s) => s.habits);
  const habit = habits.find((h) => h.id === habitId);
  const [month, setMonth] = useState(todayISO());
  const byDate = useMemo(() => {
    const map: Record<string, (typeof checkIns)[number]> = {};
    for (const c of checkInsForHabit(checkIns, habitId)) map[c.date] = c;
    return map;
  }, [checkIns, habitId]);

  const cellColor = (date: string) => {
    const entry = byDate[date];
    if (!entry) return undefined;
    return entry.done ? (entry.minimum ? withAlpha(accent, 0.45) : accent) : SOFT_MISSED;
  };

  return (
    <Card style={styles.section}>
      <Eyebrow style={{ color: accent }}>Your days</Eyebrow>
      <MonthCalendar
        accent={accent}
        month={month}
        onMonthChange={setMonth}
        getDayColor={cellColor}
        onDayPress={(date) => {
          // A logged day opens its own page; an empty one opens the check-in.
          if (byDate[date]) onOpenDetail(date);
          else onOpenCheckIn(date);
        }}
      />
      <Caption>Tap a day to check in, or to see and edit what you logged. A missed day pauses a streak; it never resets it.</Caption>
      {habit?.frequency && <Caption style={styles.scheduleNote}>Scheduled: {frequencyLabel(habit.frequency)}</Caption>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
function GraduationSheet({ habit, visible, onClose }: { habit: Habit; visible: boolean; onClose: () => void }) {
  const chooseGraduation = useHabitsStore((s) => s.chooseGraduation);
  const extendTarget = useHabitsStore((s) => s.extendTarget);
  const [mode, setMode] = useState<'choices' | 'reflect' | 'extend'>('choices');
  const [reflection, setReflection] = useState('');

  const close = () => {
    setMode('choices');
    setReflection('');
    onClose();
  };

  return (
    <SheetModal visible={visible} onClose={close}>
      {mode === 'choices' && (
        <>
          <SectionHeading>You reached day {habit.targetDays}</SectionHeading>
          <Body style={styles.graduationIntro}>
            However this felt, showing up for {habit.targetDays} days is real. What now?
          </Body>
          <PrimaryButton
            label="Keep tracking as maintenance"
            variant="outline"
            style={styles.graduationChoiceButton}
            onPress={() => {
              chooseGraduation(habit.id, 'maintenance');
              close();
            }}
          />
          <PrimaryButton
            label="Mark it formed & archive"
            variant="outline"
            style={styles.graduationChoiceButton}
            onPress={() => setMode('reflect')}
          />
          <PrimaryButton
            label="It doesn't feel automatic yet — extend"
            variant="outline"
            style={styles.graduationChoiceButton}
            onPress={() => setMode('extend')}
          />
        </>
      )}
      {mode === 'reflect' && (
        <>
          <SectionHeading>A short reflection</SectionHeading>
          <Caption>Optional — what worked, what you'd tell yourself starting out.</Caption>
          <TextInput
            value={reflection}
            onChangeText={setReflection}
            placeholder="Your reflection..."
            placeholderTextColor={colors.inkSoft}
            style={styles.notesInput}
            multiline
          />
          <PrimaryButton
            label="Mark formed"
            style={styles.sheetSubmit}
            onPress={() => {
              chooseGraduation(habit.id, 'formed', reflection);
              close();
            }}
          />
        </>
      )}
      {mode === 'extend' && (
        <>
          <SectionHeading>Extend your target</SectionHeading>
          <Caption>Add more days and keep going.</Caption>
          <View style={styles.chipRow}>
            {durationPresets.map((p) => (
              <Pressable
                key={p.days}
                onPress={() => {
                  extendTarget(habit.id, p.days);
                  close();
                }}
                style={styles.chip}
              >
                <Body>+{p.days} days</Body>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </SheetModal>
  );
}

// ---------------------------------------------------------------------------
// The small "adjust" sheet behind both the weekly review prompt and the
// long-gap re-entry screen — straight into the fields worth changing.
function EditHabitSheet({
  habit,
  visible,
  onClose,
  onSaved,
  onChangeReminder,
}: {
  habit: Habit;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  onChangeReminder: () => void;
}) {
  const updateHabit = useHabitsStore((s) => s.updateHabit);
  const setReminder = useHabitsStore((s) => s.setReminder);
  const [cue, setCue] = useState(habit.cueRoutine ?? '');
  const [targetText, setTargetText] = useState(String(habit.targetDays));
  const [frequency, setFrequency] = useState<HabitFrequency>(habit.frequency ?? { kind: 'daily' });

  React.useEffect(() => {
    if (!visible) return;
    setCue(habit.cueRoutine ?? '');
    setTargetText(String(habit.targetDays));
    setFrequency(habit.frequency ?? { kind: 'daily' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const target = parseWholeNumberInput(targetText);

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <SectionHeading>Adjust {habit.name}</SectionHeading>

      <Eyebrow style={styles.fieldLabel}>After I... (the cue)</Eyebrow>
      <TextInput value={cue} onChangeText={setCue} placeholder="e.g. pour my morning coffee" placeholderTextColor={colors.inkSoft} style={styles.sheetInput} />

      <Eyebrow style={styles.fieldLabel}>How often</Eyebrow>
      <FrequencyPicker value={frequency} onChange={setFrequency} />

      <Eyebrow style={styles.fieldLabel}>Target (days)</Eyebrow>
      <View style={styles.chipRow}>
        {durationPresets.map((p) => (
          <Pressable key={p.days} onPress={() => setTargetText(String(p.days))} style={[styles.chip, target === p.days && { backgroundColor: accent }]}>
            <Body style={target === p.days ? styles.chipTextActive : undefined}>{p.label}</Body>
          </Pressable>
        ))}
      </View>
      <TextInput value={targetText} onChangeText={setTargetText} keyboardType="number-pad" placeholder="Number of days" placeholderTextColor={colors.inkSoft} style={styles.sheetInput} />

      <Eyebrow style={styles.fieldLabel}>Reminder time</Eyebrow>
      <Pressable onPress={onChangeReminder}>
        <Caption style={styles.addNoteLink}>{habit.reminderEnabled && habit.reminderTime ? `${reminderDaysLabel(habit)} at ${formatClockTime(habit.reminderTime)} — change` : 'No reminder — set one'}</Caption>
      </Pressable>

      <PrimaryButton
        label="Save"
        disabled={!(target >= 1)}
        style={styles.sheetSubmit}
        onPress={() => {
          const frequencyChanged = JSON.stringify(frequency) !== JSON.stringify(habit.frequency ?? { kind: 'daily' });
          updateHabit(habit.id, { cueRoutine: cue, targetDays: target, frequency });
          // Weekday reminders are scheduled per chosen day, so a schedule
          // change needs them rescheduled to match.
          if (frequencyChanged && habit.reminderEnabled && habit.reminderTime) void setReminder(habit.id, habit.reminderTime, true);
          onSaved();
        }}
      />
    </SheetModal>
  );
}

// ---------------------------------------------------------------------------
// Habit stacking drawn as an actual sequence (cue → … → this habit) instead
// of a sentence — and when the cue is another of the user's habits, the
// chain keeps going back through it.
function HabitChainView({ habits, habit }: { habits: Habit[]; habit: Habit }) {
  const steps = habitChain(habits, habit);
  return (
    <View style={styles.chainWrap}>
      <Caption style={styles.chainLabel}>Your chain</Caption>
      <View style={styles.chainRow}>
        {steps.map((step, i) => {
          const isThis = step.habitId === habit.id;
          return (
            <React.Fragment key={`${step.label}-${i}`}>
              {i > 0 && <Ionicons name="arrow-forward" size={14} color={colors.inkSoft} />}
              <View style={[styles.chainStep, isThis && styles.chainStepThis, !isThis && step.habitId && styles.chainStepHabit]}>
                <Caption style={isThis ? styles.chainStepThisText : undefined}>{step.label}</Caption>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Optional alternative to the plain "Done" tap — for habits with a real time
// component (meditating, reading, exercising). Reuses the shared TimerRing
// presentation (also used by Study Session/Book) and the stopwatch logic
// extracted from Skills' session timer, rather than building a third one.
function SessionTimerSheet({ visible, onClose, onFinish }: { visible: boolean; onClose: () => void; onFinish: (minutes: number, note: string) => void }) {
  const { running, paused, elapsedSeconds, start, togglePause, stop } = useStopwatch();
  const [note, setNote] = useState('');

  React.useEffect(() => {
    if (visible && !running) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const close = () => {
    stop();
    setNote('');
    onClose();
  };

  const finish = () => {
    stop();
    onFinish(Math.max(1, Math.round(elapsedSeconds / 60)), note);
    setNote('');
  };

  return (
    <SheetModal visible={visible} onClose={close}>
      <SectionHeading>Session</SectionHeading>
      <TimerRing caption="Stay with it" timeText={formatClock(elapsedSeconds)} primaryLabel={paused ? 'Resume' : 'Pause'} onPrimary={togglePause} />
      <Eyebrow style={styles.fieldLabel}>Notes as you go (optional)</Eyebrow>
      <TextInput value={note} onChangeText={setNote} placeholder="Jot something down..." style={styles.notesInput} multiline />
      <PrimaryButton label="End session" onPress={finish} style={styles.sheetSubmit} />
    </SheetModal>
  );
}

// ---------------------------------------------------------------------------
function FolderStage({
  habitId,
  onBack,
  onOpenDetail,
  onOpenAnalysis,
  onRequestCheckIn,
}: {
  habitId: string;
  onBack: () => void;
  onOpenDetail: (date: string) => void;
  onOpenAnalysis: () => void;
  onRequestCheckIn: (date: string, initialDone: boolean) => void;
}) {
  const { requestDelete } = useUi();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const habits = useHabitsStore((s) => s.habits);
  const quitHabits = useQuitHabitsStore((s) => s.habits);
  const checkIns = useHabitsStore((s) => s.checkIns);
  const deleteHabit = useHabitsStore((s) => s.deleteHabit);
  const setCheckIn = useHabitsStore((s) => s.setCheckIn);
  const setReminder = useHabitsStore((s) => s.setReminder);
  const acknowledgeReentry = useHabitsStore((s) => s.acknowledgeReentry);
  const archiveHabit = useHabitsStore((s) => s.archiveHabit);
  const unarchiveHabit = useHabitsStore((s) => s.unarchiveHabit);
  const markReviewed = useHabitsStore((s) => s.markReviewed);

  const habit = habits.find((h) => h.id === habitId);

  const [reminderPickerOpen, setReminderPickerOpen] = useState(false);
  const [graduationOpen, setGraduationOpen] = useState(false);
  const [editReason, setEditReason] = useState<'review' | 'reentry' | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  // After a timed session ends, offer the same optional feeling check as the
  // plain Done flow — the session is already saved by this point.
  const [postSessionPrompt, setPostSessionPrompt] = useState(false);
  const feelingAsk = useSettingsStore((s) => s.habitFeelingAsk);
  const feelingEntries = useFeelingsStore((s) => s.entries);

  if (!habit) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Back</Caption>
        </Pressable>
        <Body>This habit isn't in your list anymore.</Body>
      </>
    );
  }

  const today = todayISO();
  const elapsed = daysElapsed(habit, today);
  const cappedElapsed = Math.min(elapsed, habit.targetDays);
  const { current, paused, unit } = habitStreak(checkIns, habitId, today, habit.frequency);
  const milestone = habitMilestoneMessage(elapsed, habit.targetDays);
  const resurfaceWhy = habit.why && shouldResurfaceWhy(checkIns, habitId, today, habit.frequency);
  const scheduledToday = isScheduledDay(habit.frequency, today);
  const doneThisWeek =
    habit.frequency?.kind === 'perWeek'
      ? checkIns.filter((c) => c.habitId === habitId && c.done && c.date >= weekStart(today) && c.date <= today).length
      : 0;
  const todayEntry = checkIns.find((c) => c.habitId === habitId && c.date === today);
  const reachedTarget = elapsed >= habit.targetDays && !habit.graduationChoice;
  const pairedQuit = habit.pairedQuitHabitId ? quitHabits.find((q) => q.id === habit.pairedQuitHabitId) : undefined;
  const reentry = needsReentry(habit, checkIns, today);
  const reviewDue = isReviewDue(habit, checkIns, today);

  const removeHabit = () => {
    requestDelete({
      message: `Delete "${habit.name}" and its whole history? This can't be undone. Feelings you logged with it stay in your Feelings log.`,
      perform: () => {
        deleteHabit(habitId);
        onBack();
      },
    });
  };

  const sheets = (
    <>
      <EditHabitSheet
        habit={habit}
        visible={editReason !== null}
        onClose={() => setEditReason(null)}
        onSaved={() => {
          // Adjusting counts as dealing with the gap / doing the review.
          if (editReason === 'reentry') acknowledgeReentry(habitId);
          markReviewed(habitId);
          setEditReason(null);
        }}
        onChangeReminder={() => {
          setEditReason(null);
          setReminderPickerOpen(true);
        }}
      />
      <TimePickerModal
        visible={reminderPickerOpen}
        value={habit.reminderTime}
        title={`Cue reminder for ${habit.name}`}
        onClose={() => setReminderPickerOpen(false)}
        onPick={(time) => setReminder(habitId, time, !!time)}
      />
    </>
  );

  // Two weeks or more with nothing logged: never silently resume as if
  // nothing happened — a gentle re-entry screen comes first.
  if (reentry) {
    const gap = daysSinceLastActivity(habit, checkIns, today);
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Habits</Caption>
        </Pressable>
        <ScreenTitle>Welcome back</ScreenTitle>
        <Body style={styles.reentryText}>
          It's been {gap} days since anything was logged for {habit.name}. Gaps are a normal part of building any
          habit — nothing here is lost, and your streak is paused, not reset. How do you want to pick this up?
        </Body>
        {habit.why && (
          <Card style={[styles.whyCard, { borderLeftColor: accent }]}>
            <Eyebrow style={{ color: accent }}>Why you started</Eyebrow>
            <Body style={styles.whyText}>{habit.why}</Body>
          </Card>
        )}
        <PrimaryButton label="Pick up where I left off" style={styles.reentryButton} onPress={() => acknowledgeReentry(habitId)} />
        <PrimaryButton label="Adjust it first" variant="outline" style={styles.reentryButton} onPress={() => setEditReason('reentry')} />
        <PrimaryButton
          label="Set it aside for now"
          variant="outline"
          style={styles.reentryButton}
          onPress={() => {
            archiveHabit(habitId);
            onBack();
          }}
        />
        <Caption style={styles.reentryHint}>Setting it aside keeps its whole history — you can bring it back any time from your list.</Caption>
        {sheets}
      </>
    );
  }

  return (
    <>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Habits</Caption>
        </Pressable>
        <Pressable onPress={removeHabit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete habit">
          <Ionicons name="trash-outline" size={18} color={colors.inkSoft} />
        </Pressable>
      </View>

      <SectionHeading>{habit.name}</SectionHeading>
      {habit.cueRoutine && <HabitChainView habits={habits} habit={habit} />}
      {pairedQuit && (
        <Caption style={styles.identityLine}>Doing this instead of {pairedQuit.name.toLowerCase()}.</Caption>
      )}
      {habit.identity && <Caption style={styles.identityLine}>Part of becoming someone who {habit.identity}.</Caption>}

      {habit.archivedAt && (
        <Card style={styles.badgeCard}>
          <Caption>Set aside on {formatDisplayDate(habit.archivedAt)} — its history is all still here.</Caption>
          <PrimaryButton label="Bring it back" variant="outline" style={styles.reviewButton} onPress={() => unarchiveHabit(habitId)} />
        </Card>
      )}

      {reviewDue && (
        <Card style={[styles.reviewCard, { borderLeftColor: accent }]}>
          <Eyebrow style={{ color: accent }}>Weekly check-in</Eyebrow>
          <Body>How's this habit going? Want to adjust the time, cue, or target?</Body>
          <View style={styles.reviewRow}>
            <PrimaryButton label="Adjust" variant="outline" style={styles.reviewButton} onPress={() => setEditReason('review')} />
            <PrimaryButton label="It's going fine" variant="outline" style={styles.reviewButton} onPress={() => markReviewed(habitId)} />
          </View>
        </Card>
      )}

      {habit.graduationChoice === 'maintenance' && (
        <Card style={styles.badgeCard}>
          <Caption>In maintenance since {formatDisplayDate(habit.graduatedAt!)}</Caption>
        </Card>
      )}
      {habit.graduationChoice === 'formed' && (
        <Card style={[styles.badgeCard, { borderLeftColor: accent, borderLeftWidth: 3 }]}>
          <Eyebrow style={{ color: accent }}>Formed on {formatDisplayDate(habit.graduatedAt!)}</Eyebrow>
          {habit.graduationReflection && <Body>{habit.graduationReflection}</Body>}
        </Card>
      )}

      <View style={styles.progressWrap}>
        <Caption>Day {cappedElapsed} of {habit.targetDays}</Caption>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(100, (cappedElapsed / habit.targetDays) * 100)}%` }]} />
        </View>
        <Caption>
          {current > 0
            ? `${paused ? 'Paused at ' : ''}${current} ${unit}${current === 1 ? '' : 's'}${paused ? '' : ' streak'}`
            : 'No streak yet — today is a good day to start'}
        </Caption>
      </View>

      {milestone && (
        <Card style={styles.milestoneCard}>
          <Ionicons name="sparkles-outline" size={16} color={colors.amber} />
          <Body style={styles.milestoneText}>{milestone}</Body>
        </Card>
      )}

      {resurfaceWhy && (
        <Card style={[styles.whyCard, { borderLeftColor: accent }]}>
          <Eyebrow style={{ color: accent }}>Remember why you started</Eyebrow>
          <Body style={styles.whyText}>{habit.why}</Body>
        </Card>
      )}

      {reachedTarget && (
        <Card style={styles.graduationBanner}>
          <Eyebrow style={{ color: accent }}>You reached your target</Eyebrow>
          <Body>Decide what's next for this habit.</Body>
          <PrimaryButton label="Choose what's next" onPress={() => setGraduationOpen(true)} style={styles.graduationButton} />
        </Card>
      )}

      <Card style={styles.section}>
        <Eyebrow>Today</Eyebrow>
        {habit.frequency?.kind === 'weekdays' && !scheduledToday && (
          <Caption style={styles.scheduleNote}>Not on your schedule today ({frequencyLabel(habit.frequency)}) — checking in anyway still counts as a bonus.</Caption>
        )}
        {habit.frequency?.kind === 'perWeek' && (
          <Caption style={styles.scheduleNote}>
            {doneThisWeek >= habit.frequency.count
              ? `${doneThisWeek} of ${habit.frequency.count} this week — this week's target is met.`
              : `${doneThisWeek} of ${habit.frequency.count} this week.`}
          </Caption>
        )}
        {todayEntry && (
          <Caption>
            Marked {todayEntry.done ? 'done' : 'missed'}
            {(todayEntry.note || todayEntry.photoUri) ? ' — documented' : ''} today.
          </Caption>
        )}
        <View style={styles.doneMissedRow}>
          <PrimaryButton
            label="Done"
            variant={todayEntry?.done ? 'primary' : 'outline'}
            style={styles.doneMissedButton}
            onPress={() => onRequestCheckIn(today, true)}
          />
          <PrimaryButton
            label="Missed"
            variant={todayEntry && !todayEntry.done ? 'primary' : 'outline'}
            style={styles.doneMissedButton}
            onPress={() => setCheckIn(habitId, today, false)}
          />
        </View>
        <Pressable onPress={() => setSessionOpen(true)} style={styles.startSessionLink}>
          <Ionicons name="timer-outline" size={14} color={accent} />
          <Caption style={{ color: accent }}> Or start a timed session instead</Caption>
        </Pressable>
        {habit.minimumVersion && (
          <Caption style={styles.minimumVersionText}>Hard day? The minimum version still counts: {habit.minimumVersion}</Caption>
        )}
        {todayEntry && (todayEntry.note || todayEntry.photoUri) && (
          <Pressable onPress={() => onOpenDetail(today)}>
            <Caption style={styles.addNoteLink}>See what you documented today</Caption>
          </Pressable>
        )}
        {todayEntry?.durationMinutes && (
          <Caption style={styles.sessionDurationText}>Session logged: {todayEntry.durationMinutes} min</Caption>
        )}
      </Card>

      <SessionTimerSheet
        visible={sessionOpen}
        onClose={() => setSessionOpen(false)}
        onFinish={(minutes, note) => {
          setCheckIn(habitId, today, true, note, undefined, undefined, minutes);
          successFeedback();
          setSessionOpen(false);
          if (shouldAskItemFeeling(feelingAsk, feelingEntries, 'habit', habitId, today)) setPostSessionPrompt(true);
        }}
      />

      <ItemFeelingPrompt
        visible={postSessionPrompt}
        source={{ kind: 'habit', refId: habitId }}
        context={`Done: ${habit.name}`}
        onDone={() => setPostSessionPrompt(false)}
      />

      <HabitCalendar
        habitId={habitId}
        onOpenCheckIn={(date) => {
          const entry = checkIns.find((c) => c.habitId === habitId && c.date === date);
          onRequestCheckIn(date, entry?.done ?? true);
        }}
        onOpenDetail={onOpenDetail}
      />

      <Pressable onPress={onOpenAnalysis}>
        <Card style={[styles.section, styles.analysisEntry]}>
          <Ionicons name="analytics-outline" size={20} color={accent} />
          <View style={styles.analysisEntryText}>
            <Body>Analysis</Body>
            <Caption>Stats, chart, patterns and your full history for this habit</Caption>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
        </Card>
      </Pressable>

      <Card style={styles.section}>
        <Eyebrow>Cue reminder</Eyebrow>
        <View style={styles.reminderRow}>
          <Body>{habit.reminderEnabled && habit.reminderTime ? `${reminderDaysLabel(habit)} at ${formatClockTime(habit.reminderTime)}` : 'Off'}</Body>
          <PrimaryButton label={habit.reminderEnabled ? 'Change' : 'Set time'} variant="outline" onPress={() => setReminderPickerOpen(true)} />
        </View>
        {habit.reminderEnabled && (
          <Pressable onPress={() => setReminder(habitId, undefined, false)}>
            <Caption style={styles.turnOffLink}>Turn off reminder</Caption>
          </Pressable>
        )}
      </Card>

      <GraduationSheet habit={habit} visible={graduationOpen} onClose={() => setGraduationOpen(false)} />
      {sheets}
    </>
  );
}

// ---------------------------------------------------------------------------
// `header`: the Habits hub's title and Build/Quit switch, drawn inside this
// screen's own scroll so there is only one scrolling area.
export function HabitBuilderScreen({ route, header }: Props & { header?: React.ReactNode }) {
  const { openHabitId, openDate } = route.params ?? {};
  const { showDialog } = useUi();
  const [stack, setStack] = useState<ScreenState[]>(() => {
    if (openHabitId && openDate) {
      return [{ kind: 'overview' }, { kind: 'folder', habitId: openHabitId }, { kind: 'dayDetail', habitId: openHabitId, date: openDate }];
    }
    if (openHabitId) return [{ kind: 'overview' }, { kind: 'folder', habitId: openHabitId }];
    return [{ kind: 'overview' }];
  });
  const current = stack[stack.length - 1];
  const push = (s: ScreenState) => setStack((prev) => [...prev, s]);
  const stepBack = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));

  // Owned here, not inside FolderStage/DayDetailStage, so "Edit" from a
  // day's detail view can reopen the exact same sheet those two screens share.
  const [checkInTarget, setCheckInTarget] = useState<{ habitId: string; date: string; initialDone: boolean } | null>(null);

  // A day's page with unsaved edits asks Save / Discard / Keep editing.
  const [guard, setGuard] = useState<LeaveGuard | null>(null);
  useBackHandler({ stepBack: stack.length > 1 ? stepBack : undefined, dirty: !!guard?.dirty, onSave: () => guard?.save() });

  // Coming back to a list (the logs) lands where you were.
  const scrollRef = React.useRef<ScrollView>(null);
  const scrollY = React.useRef(0);
  const saved = React.useRef<number[]>([]);
  const depth = React.useRef(stack.length);
  React.useEffect(() => {
    const was = depth.current;
    depth.current = stack.length;
    if (stack.length > was) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    const y = saved.current[stack.length] ?? 0;
    const id = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 50);
    return () => clearTimeout(id);
  }, [stack.length]);
  const pushKeepingScroll = (st: ScreenState) => {
    saved.current[stack.length] = scrollY.current;
    push(st);
  };

  return (
    <Screen scrollRef={scrollRef} onScroll={(y) => (scrollY.current = y)}>
      {header}
      {current.kind === 'overview' && <OverviewStage onOpenHabit={(habitId) => push({ kind: 'folder', habitId })} />}
      {current.kind === 'folder' && (
        <FolderStage
          habitId={current.habitId}
          onBack={stepBack}
          onOpenDetail={(date) => pushKeepingScroll({ kind: 'dayDetail', habitId: current.habitId, date })}
          onOpenAnalysis={() => pushKeepingScroll({ kind: 'analysis', habitId: current.habitId })}
          onRequestCheckIn={(date, initialDone) => setCheckInTarget({ habitId: current.habitId, date, initialDone })}
        />
      )}
      {current.kind === 'analysis' && (
        <BuildHabitAnalysisStage habitId={current.habitId} onBack={stepBack} onOpenLog={(date) => pushKeepingScroll({ kind: 'dayDetail', habitId: current.habitId, date })} />
      )}
      {current.kind === 'dayDetail' && (
        <HabitLogDetail
          habitId={current.habitId}
          date={current.date}
          accent={accent}
          setGuard={setGuard}
          onBack={() => {
            // The on-screen back link asks too, like the header's.
            if (guard?.dirty) {
              showDialog({
                title: 'Save your changes before leaving?',
                actions: [
                  { label: 'Keep editing', style: 'cancel' },
                  { label: 'Discard', style: 'destructive', onPress: () => { setGuard(null); stepBack(); } },
                  { label: 'Save', style: 'default', onPress: () => { guard.save(); setGuard(null); stepBack(); } },
                ],
              });
            } else stepBack();
          }}
        />
      )}

      <CheckInSheet
        habitId={checkInTarget?.habitId ?? ''}
        date={checkInTarget?.date ?? null}
        initialDone={checkInTarget?.initialDone}
        visible={checkInTarget !== null}
        onClose={() => setCheckInTarget(null)}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  emptyText: {
    color: colors.inkSoft,
    marginBottom: spacing.md,
  },
  group: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  groupLabel: {
    marginBottom: 2,
  },
  habitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  habitCardBody: {
    flex: 1,
    gap: 2,
  },
  addButton: {
    marginBottom: spacing.xl,
  },
  fieldLabel: {
    marginTop: spacing.sm,
  },
  feelingPromptText: {
    color: colors.inkSoft,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  startSessionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  sessionDurationText: {
    color: colors.inkSoft,
    marginTop: 2,
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
    minHeight: 60,
    textAlignVertical: 'top',
  },
  sheetSubmit: {
    marginTop: spacing.md,
  },
  ideasLink: {
    color: accent,
    marginTop: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.stone,
  },
  chipTextActive: {
    color: colors.white,
  },
  noteText: {
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  frequencyWrap: {
    gap: spacing.sm,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekdayToggle: {
    width: 38,
    height: 38,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  frequencyHint: {
    color: colors.inkSoft,
  },
  scheduleNote: {
    color: colors.inkSoft,
    marginTop: 2,
  },
  reentryText: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  reentryButton: {
    marginBottom: spacing.sm,
  },
  reentryHint: {
    color: colors.inkSoft,
    marginTop: spacing.xs,
  },
  reviewCard: {
    borderLeftWidth: 3,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  reviewRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reviewButton: {
    flex: 1,
  },
  chainWrap: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  chainLabel: {
    color: colors.inkSoft,
  },
  chainRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chainStep: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chainStepHabit: {
    borderColor: accent,
  },
  chainStepThis: {
    backgroundColor: accent,
    borderColor: accent,
  },
  chainStepThisText: {
    color: colors.white,
  },
  identityLine: {
    marginTop: 2,
    fontStyle: 'italic',
  },
  badgeCard: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  progressWrap: {
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  progressTrack: {
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.stone,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: accent,
    borderRadius: radii.full,
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
  whyText: {
    fontStyle: 'italic',
  },
  graduationBanner: {
    gap: spacing.sm,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: accent,
  },
  graduationButton: {
    marginTop: spacing.xs,
  },
  graduationIntro: {
    marginBottom: spacing.sm,
  },
  graduationChoiceButton: {
    marginBottom: spacing.sm,
  },
  section: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  doneMissedRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  doneMissedButton: {
    flex: 1,
  },
  minimumButton: { marginTop: spacing.sm },
  minimumVersionText: {
    fontStyle: 'italic',
  },
  addNoteLink: {
    color: accent,
  },
  clearLink: {
    color: colors.inkSoft,
    textDecorationLine: 'underline',
    marginTop: spacing.sm,
  },
  photoButtons: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  photoButton: {},
  photoPreview: {
    width: '100%',
    height: 160,
    borderRadius: radii.md,
    backgroundColor: colors.stone,
    marginBottom: spacing.xs,
  },
  removePhotoText: {
    color: colors.inkSoft,
    textDecorationLine: 'underline',
    marginBottom: spacing.sm,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  turnOffLink: {
    color: colors.inkSoft,
    textDecorationLine: 'underline',
  },
}));
