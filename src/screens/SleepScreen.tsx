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
import { playLayer, stopLayer, stopAllLayers, fadeOutAllLayers } from '../utils/audioEngine';
import { BackgroundAudioToggle } from '../components/BackgroundAudioToggle';
import { sleepSounds } from '../data/sleepSounds';
import { todayISO, addDaysISO, formatDisplayDate, formatClockTime } from '../utils/date';
import type { RootStackParamList } from '../navigation/types';
import type { SleepSoundId } from '../types/sections';
import { themedStyles } from '../theme/runtime';

type Props = NativeStackScreenProps<RootStackParamList, 'sleep'>;

const ACCENT = sectionAccents.sleep;
const TIMER_OPTIONS = [15, 30, 45, 60, 90];
const QUALITY_LABELS: Record<number, string> = { 1: 'Rough', 2: 'Poor', 3: 'Okay', 4: 'Good', 5: 'Great' };

function SoundMixerCard() {
  const mix = useSleepStore((s) => s.mix);
  const isPlaying = useSleepStore((s) => s.isPlaying);
  const timerMinutes = useSleepStore((s) => s.timerMinutes);
  const fadeOutMinutes = useSleepStore((s) => s.fadeOutMinutes);
  const addSoundToMix = useSleepStore((s) => s.addSoundToMix);
  const removeSoundFromMix = useSleepStore((s) => s.removeSoundFromMix);
  const setLayerVolume = useSleepStore((s) => s.setLayerVolume);
  const togglePlaying = useSleepStore((s) => s.togglePlaying);
  const setTimerMinutes = useSleepStore((s) => s.setTimerMinutes);
  const setFadeOutMinutes = useSleepStore((s) => s.setFadeOutMinutes);

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevMixIdsRef = useRef<Set<SleepSoundId>>(new Set());

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // Keeps real playback in sync with the mix: starts newly-added layers,
  // updates volume on existing ones (playLayer is a no-op restart when a
  // layer's already active), and stops layers removed from the mix.
  useEffect(() => {
    if (!isPlaying) {
      void stopAllLayers();
      prevMixIdsRef.current = new Set();
      setLoadError(null);
      return;
    }
    const currentIds = new Set(mix.map((l) => l.soundId));
    for (const id of prevMixIdsRef.current) {
      if (!currentIds.has(id)) void stopLayer(id);
    }
    for (const layer of mix) {
      void playLayer(layer.soundId, layer.volume).then((result) => {
        if (!result.ok) setLoadError(`${result.error} (${sleepSounds.find((s) => s.id === layer.soundId)?.label ?? layer.soundId}).`);
      });
    }
    prevMixIdsRef.current = currentIds;
  }, [isPlaying, mix]);

  useEffect(() => {
    if (!isPlaying || timerMinutes === null) {
      if (tickRef.current) clearInterval(tickRef.current);
      setSecondsLeft(null);
      setFading(false);
      return;
    }
    setSecondsLeft(timerMinutes * 60);
    setFading(false);
    const fadeThresholdSeconds = fadeOutMinutes * 60;
    let fadeStarted = false;
    tickRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev === null) return prev;
        const next = prev - 1;
        if (fadeThresholdSeconds > 0 && next <= fadeThresholdSeconds && next > 0 && !fadeStarted) {
          fadeStarted = true;
          setFading(true);
          void fadeOutAllLayers(fadeThresholdSeconds * 1000);
        }
        if (next <= 0) {
          if (tickRef.current) clearInterval(tickRef.current);
          if (!fadeStarted) void stopAllLayers();
          togglePlaying();
          return null;
        }
        return next;
      });
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, timerMinutes]);

  const toggleSound = (id: SleepSoundId) => {
    if (mix.some((l) => l.soundId === id)) removeSoundFromMix(id);
    else addSoundToMix(id);
  };

  const mm = secondsLeft !== null ? Math.floor(secondsLeft / 60) : null;
  const ss = secondsLeft !== null ? secondsLeft % 60 : null;

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
              <Caption>{sound.description}</Caption>
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
        {TIMER_OPTIONS.map((mins) => (
          <Pressable key={mins} onPress={() => setTimerMinutes(timerMinutes === mins ? null : mins)} style={[styles.timerChip, timerMinutes === mins && { backgroundColor: ACCENT }]}>
            <Body style={timerMinutes === mins ? styles.timerChipTextActive : undefined}>{mins}m</Body>
          </Pressable>
        ))}
      </View>
      <View style={styles.fadeRow}>
        <Caption>Fade out over</Caption>
        {[0, 5, 10].map((mins) => (
          <Pressable key={mins} onPress={() => setFadeOutMinutes(mins)} style={[styles.fadeChip, fadeOutMinutes === mins && { borderColor: ACCENT }]}>
            <Caption style={fadeOutMinutes === mins ? { color: ACCENT } : undefined}>{mins === 0 ? 'Off' : `${mins}m`}</Caption>
          </Pressable>
        ))}
      </View>

      <PrimaryButton
        label={isPlaying ? 'Stop' : mix.length === 0 ? 'Pick a sound first' : 'Play mix'}
        disabled={!isPlaying && mix.length === 0}
        variant={isPlaying ? 'outline' : 'primary'}
        onPress={togglePlaying}
        style={styles.playButton}
      />
      {isPlaying && secondsLeft !== null && (
        <Caption style={styles.countdown}>
          {fading ? 'Fading out… ' : ''}
          {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')} left
        </Caption>
      )}
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

function WakeAlarmCard() {
  const wakeAlarm = useSleepStore((s) => s.wakeAlarm);
  const setWakeAlarm = useSleepStore((s) => s.setWakeAlarm);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <Card style={[styles.card, { borderLeftColor: ACCENT, borderLeftWidth: 3 }]}>
      <Eyebrow style={{ color: ACCENT }}>Gentle wake alarm</Eyebrow>
      <Caption style={styles.hint}>Fades in over {wakeAlarm.fadeInMinutes} minutes instead of jolting you awake.</Caption>

      <View style={styles.reminderRow}>
        <View style={styles.reminderText}>
          <Body>{wakeAlarm.enabled && wakeAlarm.time ? formatClockTime(wakeAlarm.time) : 'Not set'}</Body>
          <Caption>{wakeAlarm.enabled ? 'Repeats every day' : 'Off'}</Caption>
        </View>
        <PrimaryButton label={wakeAlarm.enabled ? 'Change' : 'Set alarm'} variant="outline" onPress={() => setPickerOpen(true)} />
      </View>
      {wakeAlarm.enabled && (
        <Pressable onPress={() => setWakeAlarm(undefined, false)}>
          <Caption style={styles.turnOffLink}>Turn off alarm</Caption>
        </Pressable>
      )}

      <TimePickerModal
        visible={pickerOpen}
        value={wakeAlarm.time}
        title="Wake alarm"
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
      <Caption style={styles.subtitle}>Wind down, drift off, and wake up gently.</Caption>

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
