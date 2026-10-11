// "How do you feel?" after finishing a task (or before starting one). Small,
// skippable, never forced: Skip is as prominent as Save, and nothing is
// saved unless the user picks something. The feeling goes to the Feelings
// log (utils/taskFeelings.ts); how it went stays on the task.
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SheetModal } from '../../components/SheetModal';
import { TextInput } from '../../components/TextInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Caption, Eyebrow, SectionHeading } from '../../components/Typography';
import { feelingZones, findFeeling, zoneMeta } from '../../data/feelingsWheel';
import { useDailyPlanningStore, resolveTaskTitle } from '../../store/useDailyPlanningStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { clearTaskFeeling, linkedEntry, logTaskFeeling, type FeelingPhase } from '../../utils/taskFeelings';
import { withAlpha } from '../../utils/color';
import { colors, fonts, radii, spacing } from '../../theme';
import { themedStyles } from '../../theme/runtime';
import type { FeelingZone, TaskDifficulty } from '../../types/sections';

export const DIFFICULTY: { id: TaskDifficulty; label: string }[] = [
  { id: 'easier', label: 'Easier than expected' },
  { id: 'asExpected', label: 'As expected' },
  { id: 'harder', label: 'Harder than expected' },
];

export function TaskFeelingSheet({
  taskId,
  date,
  phase,
  onClose,
  onMoreSpecific,
}: {
  taskId: string | null; // null = closed
  date: string;
  phase: FeelingPhase;
  onClose: () => void;
  // Opens Identify the Feeling for this task (optionally at the chosen zone).
  onMoreSpecific: (zone: FeelingZone | undefined) => void;
}) {
  const task = useDailyPlanningStore((s) => (taskId ? s.tasks.find((t) => t.id === taskId) : undefined));
  const entries = useFeelingsStore((s) => s.entries);
  const personalFeelings = useFeelingsStore((s) => s.personalFeelings);
  const entry = task ? linkedEntry(task, date, phase, entries) : undefined;
  const note0 = task?.completionNotes[date];

  const [zone, setZone] = useState<FeelingZone | undefined>(undefined);
  const [difficulty, setDifficulty] = useState<TaskDifficulty | undefined>(undefined);
  const [note, setNote] = useState('');

  // Fill in what's already there each time the sheet opens.
  useEffect(() => {
    if (!taskId) return;
    setZone(entry?.zone);
    setDifficulty(note0?.difficulty);
    setNote(entry?.note ?? (phase === 'after' ? note0?.comment ?? '' : ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (!task) return null;
  const title = resolveTaskTitle(task) || 'this task';
  // The exact words, if "Be more specific" was used and the zone still matches.
  const words =
    entry && entry.zone === zone
      ? entry.feelingIds.map((id) => findFeeling(id)?.name ?? personalFeelings.find((p) => p.id === id)?.name).filter(Boolean)
      : [];

  const saveRest = (zoneChosen: boolean) => {
    if (phase !== 'after') return;
    const s = useDailyPlanningStore.getState();
    const comment = zoneChosen ? undefined : note.trim() || undefined; // with a feeling, the note lives on the feeling
    s.setCompletionNote(task.id, date, { ...note0, difficulty, comment });
  };

  const save = () => {
    if (zone) {
      logTaskFeeling({
        taskId: task.id,
        date,
        phase,
        zone,
        feelingIds: entry && entry.zone === zone ? entry.feelingIds : [],
        intensities: entry && entry.zone === zone ? entry.intensities : undefined,
        note: note.trim(),
      });
    } else if (entry) {
      clearTaskFeeling(task.id, date, phase); // un-picking the zone removes the feeling
    }
    saveRest(!!zone);
    onClose();
  };

  const canSave = phase === 'after' ? true : !!zone;

  return (
    <SheetModal visible={!!taskId} onClose={onClose}>
      <Caption style={styles.muted} numberOfLines={2}>
        {phase === 'after' ? `Done: ${title}` : `Starting: ${title}`}
      </Caption>
      <SectionHeading accessibilityRole="header">{phase === 'after' ? 'How do you feel?' : 'How do you feel before starting?'}</SectionHeading>
      <Caption style={styles.muted}>Optional. It goes into your Feelings log with this task's tags.</Caption>

      <View style={styles.zones} accessibilityRole="radiogroup" accessibilityLabel="How do you feel?">
        {feelingZones.map((z) => {
          const active = zone === z.id;
          return (
            <Pressable
              key={z.id}
              onPress={() => setZone(active ? undefined : z.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${z.label}: ${z.description}`}
              hitSlop={4}
              style={[styles.zone, { borderColor: z.accent }, active && { backgroundColor: withAlpha(z.accent, 0.22) }]}
            >
              <View style={[styles.dot, { backgroundColor: z.accent }]} />
              <Caption style={[styles.zoneText, active && styles.zoneTextActive]}>{z.label}</Caption>
            </Pressable>
          );
        })}
      </View>
      {words.length > 0 && <Caption style={{ color: zoneMeta(zone!).accent }}>Felt {words.join(' & ').toLowerCase()}</Caption>}
      <Pressable
        style={styles.linkRow}
        onPress={() => {
          saveRest(false);
          onMoreSpecific(zone);
        }}
        accessibilityRole="button"
        accessibilityHint="Opens Identify the Feeling to name the exact feeling and how strong it is"
      >
        <Ionicons name="search-outline" size={15} color={colors.teal} />
        <Caption style={styles.link}>Be more specific</Caption>
      </Pressable>

      {phase === 'after' && (
        <>
          <Eyebrow style={styles.label}>How did it go?</Eyebrow>
          <View style={styles.zones} accessibilityRole="radiogroup" accessibilityLabel="How did it go?">
            {DIFFICULTY.map((d) => {
              const active = difficulty === d.id;
              return (
                <Pressable
                  key={d.id}
                  onPress={() => setDifficulty(active ? undefined : d.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  hitSlop={4}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Caption style={active ? styles.chipTextActive : undefined}>{d.label}</Caption>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="A note (optional)"
        placeholderTextColor={colors.inkSoft}
        style={styles.note}
        maxLength={160}
        returnKeyType="done"
        accessibilityLabel="Note"
      />

      <View style={styles.actions}>
        <PrimaryButton label="Skip" variant="outline" style={styles.action} onPress={onClose} />
        <PrimaryButton label="Save" style={styles.action} disabled={!canSave} onPress={save} />
      </View>
    </SheetModal>
  );
}

const styles = themedStyles(() => ({
  muted: { color: colors.inkSoft },
  label: { marginTop: spacing.md },
  zones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: spacing.sm + 2, borderRadius: radii.full, borderWidth: 1.5, minHeight: 40 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  zoneText: { color: colors.ink },
  zoneTextActive: { fontFamily: fonts.bodyMedium },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, alignSelf: 'flex-start' },
  link: { color: colors.teal, fontFamily: fonts.bodyMedium },
  chip: { paddingVertical: 6, paddingHorizontal: spacing.sm + 2, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, minHeight: 36, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipTextActive: { color: colors.white },
  note: { fontFamily: fonts.body, fontSize: 16, color: colors.ink, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line, marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  // Skip and Save are the same size: skipping is just as fine.
  action: { flex: 1 },
}));
