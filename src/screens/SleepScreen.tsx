import { FREE_SLEEP_SOUNDS, PLUS_FEATURES, PLUS_NAME } from '../config/plans';
import { usePaywallStore } from '../store/usePaywallStore';
import { usePlus } from '../plans/access';
import { ReminderSoundPicker } from '../components/ReminderSoundPicker';
import { PHONE_CLOCK_NOTE, WAKE_REMINDER } from '../config/reminderWording';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { BreathingExercise } from '../components/BreathingExercise';
import { TimePickerModal } from '../components/TimePickerModal';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, radii, sectionAccents, spacing, fonts } from '../theme';
import { withAlpha } from '../utils/color';
import { useUi } from '../components/UiProvider';
import { useBackHandler } from '../hooks/useBackHandler';
import { useSleepStore, averageSleepQuality } from '../store/useSleepStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { EXTEND_MINUTES, FADE_CHOICES, MAX_CUSTOM_MINUTES, TIMER_CHOICES, extendSleepTimer, formatStopsIn, setSleepFade, setSleepTimer, sleepTimeLeft, startSleepSession, stopSleepSession } from '../audio/sleepSession';
import { BackgroundAudioToggle } from '../components/BackgroundAudioToggle';
import { sleepSounds } from '../data/sleepSounds';
import { todayISO, addDaysISO, formatDisplayDate, formatClockTime } from '../utils/date';
import type { RootStackParamList } from '../navigation/types';
import type { SleepSoundId } from '../types/sections';
import { themedStyles } from '../theme/runtime';

type Props = NativeStackScreenProps<RootStackParamList, 'sleep'>;

const ACCENT = sectionAccents.sleep;
const QUALITY_LABELS: Record<number, string> = { 1: 'Rough', 2: 'Poor', 3: 'Okay', 4: 'Good', 5: 'Great' };

export const SLEEP_TIMER_COPY = {
  allNight: 'All night',
  custom: 'Custom',
  stopsIn: (t: string) => `Stops in ${t}`,
  fading: (t: string) => `Fading out · stops in ${t}`,
  noTimer: 'Plays until you stop it',
  extend: `+${EXTEND_MINUTES} min`,
  cancel: 'No timer',
  fadeLabel: 'Fade at the end',
  fadeNote: 'With the phone locked, the volume steps down rather than gliding; the sound always stops on time.',
  replacedStudy: "Study's sound stopped: one sound at a time.",
};

const fadeLabel = (sec: number) => (sec < 60 ? `${sec} s` : `${sec / 60} min`);

function SoundMixerCard() {
  const mix = useSleepStore((s) => s.mix);
  const isPlaying = useSleepStore((s) => s.isPlaying);
  const endsAt = useSleepStore((s) => s.endsAt);
  const fadeMs = useSleepStore((s) => s.fadeMs);
  const timerChoice = useSettingsStore((s) => s.defaultSleepTimerMinutes);
  const fadeSeconds = useSettingsStore((s) => s.sleepFadeSeconds);
  const addSoundToMix = useSleepStore((s) => s.addSoundToMix);
  const removeSoundFromMix = useSleepStore((s) => s.removeSoundFromMix);
  const setLayerVolume = useSleepStore((s) => s.setLayerVolume);
  const { showToast } = useUi();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  // Only for the "Stops in" line: the session itself runs in audio/sleepSession.ts.
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!isPlaying || endsAt === null) return;
    const t = setInterval(() => redraw((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isPlaying, endsAt]);

  const play = () =>
    void startSleepSession().then((r) => {
      setLoadError(r.ok ? null : r.error);
      if (r.ok && r.replacedStudy) showToast({ message: SLEEP_TIMER_COPY.replacedStudy });
    });
  const chooseTimer = (minutes: number | null) => setSleepTimer(minutes);
  const saveCustom = () => {
    const n = Math.round(Number(customText));
    if (!Number.isFinite(n) || n < 1 || n > MAX_CUSTOM_MINUTES) return showToast({ message: `Between 1 and ${MAX_CUSTOM_MINUTES} minutes.` });
    setCustomOpen(false);
    setCustomText('');
    chooseTimer(n);
  };
  const timerMs = timerChoice === null ? null : timerChoice * 60_000;
  const left = sleepTimeLeft();
  const isCustom = timerChoice !== null && !TIMER_CHOICES.includes(timerChoice);

  const plus = usePlus();
  const { showDialog } = useUi();
  const openPlans = usePaywallStore((s) => s.open);
  // Free: the first FREE_SLEEP_SOUNDS sounds. One already in the mix (from
  // a trial) keeps playing and can still be removed.
  const locked = (id: SleepSoundId) => !plus && sleepSounds.findIndex((s) => s.id === id) >= FREE_SLEEP_SOUNDS;
  const toggleSound = (id: SleepSoundId) => {
    if (mix.some((l) => l.soundId === id)) return removeSoundFromMix(id);
    if (locked(id)) {
      showDialog({
        title: PLUS_FEATURES.sleepAllSounds.title,
        message: `${PLUS_FEATURES.sleepAllSounds.line} The first ${FREE_SLEEP_SOUNDS} are free.`,
        actions: [
          { label: 'Not now', style: 'cancel' },
          { label: `See ${PLUS_NAME}`, style: 'default', onPress: () => void openPlans('userOpened') },
        ],
      });
      return;
    }
    addSoundToMix(id);
  };

  return (
    <Card style={[styles.card, { borderLeftColor: ACCENT, borderLeftWidth: 3 }]}>
      <Eyebrow style={{ color: ACCENT }}>Ambient sounds</Eyebrow>
      <Caption style={styles.hint}>Tap to layer sounds together, then adjust each one's volume.</Caption>

      <View style={styles.soundGrid}>
        {sleepSounds.map((sound) => {
          const active = mix.some((l) => l.soundId === sound.id);
          return (
            <Pressable key={sound.id} onPress={() => toggleSound(sound.id)} style={[styles.soundChip, active && { backgroundColor: withAlpha(ACCENT, 0.18), borderColor: ACCENT }]}>
              <Body style={active ? { color: ACCENT } : undefined}>{sound.label}</Body>
              <Caption>{locked(sound.id) && !active ? PLUS_NAME : sound.description}</Caption>
            </Pressable>
          );
        })}
      </View>

      {mix.length > 0 && (
        <View style={styles.mixList}>
          <Eyebrow style={{ color: ACCENT }}>Your mix</Eyebrow>
          {mix.map((layer) => {
            const sound = sleepSounds.find((s) => s.id === layer.soundId)!;
            return (
              <View key={layer.soundId} style={styles.mixRow}>
                <Body style={styles.mixLabel}>{sound.label}</Body>
                <View style={styles.volumeTrack}>
                  {[0.25, 0.5, 0.75, 1].map((step) => (
                    <Pressable
                      key={step}
                      onPress={() => setLayerVolume(layer.soundId, step)}
                      style={[styles.volumeDot, layer.volume >= step && { backgroundColor: ACCENT }]}
                    />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Eyebrow style={[{ color: ACCENT }, styles.timerLabel]}>Sleep timer</Eyebrow>
      <View style={styles.timerRow}>
        {TIMER_CHOICES.map((mins) => {
          const on = timerChoice === mins;
          return (
            <Pressable key={String(mins)} onPress={() => chooseTimer(mins)} style={[styles.timerChip, on && { backgroundColor: ACCENT }]} accessibilityRole="button" accessibilityState={{ selected: on }}>
              <Body style={on ? styles.timerChipTextActive : undefined}>{mins === null ? SLEEP_TIMER_COPY.allNight : `${mins}m`}</Body>
            </Pressable>
          );
        })}
        <Pressable onPress={() => setCustomOpen((o) => !o)} style={[styles.timerChip, isCustom && { backgroundColor: ACCENT }]} accessibilityRole="button" accessibilityState={{ selected: isCustom }}>
          <Body style={isCustom ? styles.timerChipTextActive : undefined}>{isCustom ? `${timerChoice}m` : SLEEP_TIMER_COPY.custom}</Body>
        </Pressable>
      </View>
      {customOpen && (
        <View style={styles.fadeRow}>
          <TextInput value={customText} onChangeText={setCustomText} placeholder="Minutes" keyboardType="number-pad" style={styles.customInput} accessibilityLabel="Timer length in minutes" onSubmitEditing={saveCustom} />
          <PrimaryButton label="Set" onPress={saveCustom} variant="outline" />
        </View>
      )}
      {timerMs !== null && (
        <View style={styles.fadeRow}>
          <Caption>{SLEEP_TIMER_COPY.fadeLabel}</Caption>
          {FADE_CHOICES.map((sec) => {
            const tooLong = sec * 1000 > timerMs;
            const on = fadeSeconds === sec;
            return (
              <Pressable key={sec} disabled={tooLong} onPress={() => setSleepFade(sec)} style={[styles.fadeChip, on && { borderColor: ACCENT }, tooLong && styles.chipDisabled]} accessibilityRole="button" accessibilityState={{ selected: on, disabled: tooLong }}>
                <Caption style={on ? { color: ACCENT } : undefined}>{fadeLabel(sec)}</Caption>
              </Pressable>
            );
          })}
        </View>
      )}

      <PrimaryButton
        label={isPlaying ? 'Stop' : mix.length === 0 ? 'Pick a sound first' : 'Play mix'}
        disabled={!isPlaying && mix.length === 0}
        variant={isPlaying ? 'outline' : 'primary'}
        onPress={isPlaying ? stopSleepSession : play}
        style={styles.playButton}
      />
      {isPlaying && (
        <View style={styles.sessionRow}>
          <Caption style={styles.countdown} accessibilityLiveRegion="none">
            {left === null ? SLEEP_TIMER_COPY.noTimer : left <= fadeMs ? SLEEP_TIMER_COPY.fading(formatStopsIn(left)) : SLEEP_TIMER_COPY.stopsIn(formatStopsIn(left))}
          </Caption>
          {left !== null && (
            <>
              <Pressable onPress={() => extendSleepTimer()} accessibilityRole="button" hitSlop={8}>
                <Caption style={{ color: ACCENT }}>{SLEEP_TIMER_COPY.extend}</Caption>
              </Pressable>
              <Pressable onPress={() => chooseTimer(null)} accessibilityRole="button" hitSlop={8}>
                <Caption style={{ color: ACCENT }}>{SLEEP_TIMER_COPY.cancel}</Caption>
              </Pressable>
            </>
          )}
        </View>
      )}
      {isPlaying && fadeMs > 0 && <Caption style={styles.hint}>{SLEEP_TIMER_COPY.fadeNote}</Caption>}
      {loadError && <Caption style={styles.loadError}>{loadError}</Caption>}
      <BackgroundAudioToggle accent={ACCENT} />
    </Card>
  );
}

function WindDownCard() {
  const items = useSleepStore((s) => s.windDownItems);
  const toggleWindDownItem = useSleepStore((s) => s.toggleWindDownItem);
  const addWindDownItem = useSleepStore((s) => s.addWindDownItem);
  const removeWindDownItem = useSleepStore((s) => s.removeWindDownItem);
  const resetWindDownForTonight = useSleepStore((s) => s.resetWindDownForTonight);
  const bedtime = useSleepStore((s) => s.bedtime);
  const setBedtime = useSleepStore((s) => s.setBedtime);
  const { requestDelete } = useUi();

  const [newItem, setNewItem] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const remove = (id: string, label: string) => {
    const previous = useSleepStore.getState().windDownItems;
    requestDelete({
      message: `Remove "${label}" from your wind-down checklist?`,
      toastMessage: 'Removed',
      perform: () => removeWindDownItem(id),
      restore: () => useSleepStore.setState({ windDownItems: previous }),
    });
  };

  return (
    <Card style={[styles.card, { borderLeftColor: ACCENT, borderLeftWidth: 3 }]}>
      <View style={styles.headerRow}>
        <Eyebrow style={{ color: ACCENT }}>Wind-down checklist</Eyebrow>
        <Pressable accessibilityRole="button" accessibilityLabel="Reset tonight's checklist" onPress={resetWindDownForTonight} hitSlop={8}>
          <Ionicons name="refresh-outline" size={16} color={colors.inkSoft} />
        </Pressable>
      </View>

      <View style={styles.checklist}>
        {items.map((item) => (
          <View key={item.id} style={styles.checklistRow}>
            <Pressable onPress={() => toggleWindDownItem(item.id)} style={styles.checklistToggle} hitSlop={8}>
              <Ionicons name={item.done ? 'checkbox' : 'square-outline'} size={20} color={item.done ? ACCENT : colors.inkSoft} />
              <Body style={item.done ? styles.checklistDone : undefined}>{item.label}</Body>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.label}`} onPress={() => remove(item.id, item.label)} hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.inkSoft} />
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.addRow}>
        <TextInput
          value={newItem}
          onChangeText={setNewItem}
          placeholder="Add a step..."
          placeholderTextColor={colors.inkSoft}
          style={styles.addInput}
          onSubmitEditing={() => {
            if (newItem.trim()) {
              addWindDownItem(newItem);
              setNewItem('');
            }
          }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Add to checklist"
          onPress={() => {
            if (newItem.trim()) {
              addWindDownItem(newItem);
              setNewItem('');
            }
          }}
          hitSlop={8}
        >
          <Ionicons name="add-circle" size={26} color={ACCENT} />
        </Pressable>
      </View>

      <View style={styles.reminderRow}>
        <View style={styles.reminderText}>
          <Body>Bedtime reminder</Body>
          <Caption>{bedtime.enabled && bedtime.time ? `Every night at ${formatClockTime(bedtime.time)}` : 'Off'}</Caption>
        </View>
        <PrimaryButton
          label={bedtime.enabled ? 'Change' : 'Set time'}
          variant="outline"
          onPress={() => setPickerOpen(true)}
        />
      </View>
      {bedtime.enabled && (
        <Pressable onPress={() => setBedtime(undefined, false)}>
          <Caption style={styles.turnOffLink}>Turn off reminder</Caption>
        </Pressable>
      )}

      <TimePickerModal
        visible={pickerOpen}
        value={bedtime.time}
        title="Bedtime reminder"
        onClose={() => setPickerOpen(false)}
        onPick={(time) => setBedtime(time, !!time)}
      />
    </Card>
  );
}

function BreathingCard() {
  return (
    <Card style={[styles.card, { borderLeftColor: ACCENT, borderLeftWidth: 3 }]}>
      <BreathingExercise accent={ACCENT} />
    </Card>
  );
}

function SleepLogCard() {
  const logs = useSleepStore((s) => s.logs);
  const logSleep = useSleepStore((s) => s.logSleep);
  const [quality, setQuality] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [note, setNote] = useState('');

  const lastNight = addDaysISO(todayISO(), -1);
  const existing = logs.find((l) => l.date === lastNight);
  const avg = averageSleepQuality(logs, addDaysISO(todayISO(), -7));
  const recent = [...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

  return (
    <Card style={[styles.card, { borderLeftColor: ACCENT, borderLeftWidth: 3 }]}>
      <Eyebrow style={{ color: ACCENT }}>How did you sleep last night?</Eyebrow>
      <Caption style={styles.hint}>{formatDisplayDate(lastNight)} — a quick 1-5, not a tracker.</Caption>

      <View style={styles.qualityRow}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = (quality ?? existing?.quality) === n;
          return (
            <Pressable key={n} onPress={() => setQuality(n as 1 | 2 | 3 | 4 | 5)} style={[styles.qualityChip, active && { backgroundColor: ACCENT }]}>
              <Body style={active ? styles.timerChipTextActive : undefined}>{n}</Body>
              <Caption style={active ? styles.timerChipTextActive : undefined}>{QUALITY_LABELS[n]}</Caption>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="One line about last night (optional)"
        placeholderTextColor={colors.inkSoft}
        style={styles.noteInput}
      />

      <PrimaryButton
        label={existing ? 'Update log' : 'Save log'}
        disabled={quality === null && !existing}
        onPress={() => {
          const q = quality ?? existing?.quality;
          if (q) logSleep(lastNight, q, note || existing?.note);
        }}
        style={styles.playButton}
      />

      {avg !== undefined && (
        <Caption style={styles.avgText}>7-night average: {avg.toFixed(1)} / 5</Caption>
      )}

      {recent.length > 0 && (
        <View style={styles.trendRow}>
          {recent.slice().reverse().map((l) => (
            <View key={l.id} style={styles.trendBarWrap}>
              <View style={[styles.trendBar, { height: 8 + l.quality * 8, backgroundColor: ACCENT }]} />
              <Caption style={styles.trendDay}>{formatDisplayDate(l.date).slice(0, 3)}</Caption>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

// A gentle wake-up reminder: a notification that plays its sound once at the
// chosen time. Not an alarm (src/config/reminderWording.ts).
function WakeAlarmCard() {
  const wakeAlarm = useSleepStore((s) => s.wakeAlarm);
  const setWakeAlarm = useSleepStore((s) => s.setWakeAlarm);
  const setWakeSound = useSleepStore((s) => s.setWakeSound);
  const [pickerOpen, setPickerOpen] = useState(false);
  const on = wakeAlarm.enabled && !!wakeAlarm.time;

  return (
    <Card style={[styles.card, { borderLeftColor: ACCENT, borderLeftWidth: 3 }]}>
      <Eyebrow style={{ color: ACCENT }}>{WAKE_REMINDER.title}</Eyebrow>
      <Caption style={styles.hint}>{WAKE_REMINDER.hint}</Caption>

      <View style={styles.reminderRow}>
        <View style={styles.reminderText}>
          <Body>{on ? formatClockTime(wakeAlarm.time!) : WAKE_REMINDER.notSet}</Body>
          <Caption>{on ? WAKE_REMINDER.repeats : WAKE_REMINDER.off}</Caption>
        </View>
        <PrimaryButton label={on ? WAKE_REMINDER.change : WAKE_REMINDER.set} variant="outline" onPress={() => setPickerOpen(true)} />
      </View>
      {on && (
        <>
          <Caption style={styles.soundLabel}>{WAKE_REMINDER.soundLabel}</Caption>
          <ReminderSoundPicker value={wakeAlarm.sound} onChange={(id) => void setWakeSound(id)} testID="wake-reminder-sound" />
          <Pressable onPress={() => setWakeAlarm(undefined, false)} accessibilityRole="button">
            <Caption style={styles.turnOffLink}>{WAKE_REMINDER.turnOff}</Caption>
          </Pressable>
        </>
      )}
      <Caption style={styles.clockNote}>{PHONE_CLOCK_NOTE}</Caption>

      <TimePickerModal
        visible={pickerOpen}
        value={wakeAlarm.time}
        title={WAKE_REMINDER.title}
        onClose={() => setPickerOpen(false)}
        onPick={(time) => setWakeAlarm(time, !!time)}
      />
    </Card>
  );
}

export function SleepScreen(_props: Props) {
  useBackHandler({});

  return (
    <Screen>
      <ScreenTitle>Sleep</ScreenTitle>
      <Caption style={styles.subtitle}>Wind down, drift off, and get a gentle reminder in the morning.</Caption>

      <SoundMixerCard />
      <WindDownCard />
      <BreathingCard />
      <SleepLogCard />
      <WakeAlarmCard />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  card: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  hint: {},
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  soundGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  soundChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.stone,
    minWidth: '30%',
    gap: 2,
  },
  mixList: {
    gap: spacing.xs,
  },
  mixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mixLabel: {
    flex: 1,
  },
  volumeTrack: {
    flexDirection: 'row',
    gap: 6,
  },
  volumeDot: {
    width: 16,
    height: 16,
    borderRadius: radii.full,
    backgroundColor: colors.line,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  customInput: {
    flex: 1,
    minWidth: 100,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  timerLabel: {
    marginTop: spacing.xs,
  },
  timerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  timerChip: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.stone,
    borderWidth: 1,
    borderColor: colors.line,
  },
  timerChipTextActive: {
    color: colors.white,
  },
  fadeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fadeChip: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
  },
  playButton: {
    marginTop: spacing.xs,
  },
  countdown: {
    textAlign: 'center',
  },
  loadError: {
    color: '#C97B5A',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  checklist: {
    gap: spacing.xs,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checklistToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  checklistDone: {
    textDecorationLine: 'line-through',
    color: colors.inkSoft,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.xs,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  reminderText: {
    gap: 2,
  },
  soundLabel: { marginTop: spacing.md },
  clockNote: { color: colors.inkSoft, marginTop: spacing.md },
  turnOffLink: {
    color: colors.inkSoft,
    textDecorationLine: 'underline',
  },
  qualityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  qualityChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.stone,
    borderWidth: 1,
    borderColor: colors.line,
  },
  noteInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
  },
  avgText: {
    textAlign: 'center',
  },
  trendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 60,
    marginTop: spacing.xs,
  },
  trendBarWrap: {
    alignItems: 'center',
    gap: 4,
  },
  trendBar: {
    width: 10,
    borderRadius: 4,
  },
  trendDay: {
    fontSize: 10,
  },
}));
