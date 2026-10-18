// One day of a Build habit, on its own page: the date, what happened, when,
// the comment in full, the feeling logged, and Edit / Delete (with undo).
// Every number elsewhere (streak, milestones, graph, analysis) reads the same
// check-ins, so an edit here shows up there straight away.
import React, { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { TextInput } from '../../components/TextInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useUi } from '../../components/UiProvider';
import { Body, Caption, Eyebrow, ScreenTitle } from '../../components/Typography';
import { useHabitsStore } from '../../store/useHabitsStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { findFeeling, zoneMeta } from '../../data/feelingsWheel';
import { formatClockTime, formatDisplayDate, formatTimeOfDay } from '../../utils/date';
import { completionTime } from '../../utils/habitTimeOfDay';
import { colors, fonts, radii, spacing } from '../../theme';
import { themedStyles } from '../../theme/runtime';

type Status = 'done' | 'minimum' | 'missed';

export interface LeaveGuard {
  dirty: boolean;
  save: () => boolean;
}

export function HabitLogDetail({
  habitId,
  date,
  accent,
  onBack,
  setGuard,
}: {
  habitId: string;
  date: string;
  accent: string;
  onBack: () => void;
  // Lets the screen ask Save / Discard when leaving with unsaved edits.
  setGuard: (guard: LeaveGuard | null) => void;
}) {
  const habit = useHabitsStore((s) => s.habits.find((h) => h.id === habitId));
  const entry = useHabitsStore((s) => s.checkIns.find((c) => c.habitId === habitId && c.date === date));
  const feelings = useFeelingsStore((s) => s.entries);
  const personal = useFeelingsStore((s) => s.personalFeelings);
  const { showDialog, showToast } = useUi();

  const initialStatus: Status = entry ? (entry.done ? (entry.minimum ? 'minimum' : 'done') : 'missed') : 'done';
  const [status, setStatus] = useState<Status>(initialStatus);
  const [note, setNote] = useState(entry?.note ?? '');
  useEffect(() => {
    setStatus(initialStatus);
    setNote(entry?.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const dirty = !!entry && (status !== initialStatus || note.trim() !== (entry.note ?? ''));
  const save = (): boolean => {
    if (!entry) return true;
    useHabitsStore.getState().updateCheckIn(entry.id, { done: status !== 'missed', minimum: status === 'minimum', note });
    showToast({ message: 'Saved' });
    return true;
  };
  useEffect(() => {
    setGuard(dirty ? { dirty, save } : null);
    return () => setGuard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, status, note]);

  if (!habit || !entry) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button">
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Back</Caption>
        </Pressable>
        <Body>Nothing logged for this day anymore.</Body>
      </>
    );
  }

  const time = completionTime(entry);
  const feeling = feelings.filter((e) => e.source?.kind === 'habit' && e.source.refId === habitId && e.date === date).slice(-1)[0];
  const feelingWords = feeling ? feeling.feelingIds.map((id) => findFeeling(id)?.name ?? personal.find((p) => p.id === id)?.name).filter(Boolean) : [];

  const remove = () =>
    showDialog({
      title: 'Delete this day?',
      message: `${formatDisplayDate(date)} will be removed from ${habit.name}. Streaks, milestones and the analysis update straight away.`,
      actions: [
        { label: 'Keep it', style: 'cancel' },
        {
          label: 'Delete',
          style: 'destructive',
          onPress: () => {
            const removed = useHabitsStore.getState().deleteCheckIn(entry.id);
            setGuard(null);
            onBack();
            if (removed) showToast({ message: 'Day deleted', actionLabel: 'Undo', onAction: () => useHabitsStore.getState().restoreCheckIn(removed) });
          },
        },
      ],
    });

  const options: { id: Status; label: string }[] = [
    { id: 'done', label: 'Done' },
    ...(habit.minimumVersion || initialStatus === 'minimum' ? [{ id: 'minimum' as const, label: 'Minimum version' }] : []),
    { id: 'missed', label: 'Missed' },
  ];

  return (
    <>
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel={`Back to ${habit.name}`}>
        <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
        <Caption> {habit.name}</Caption>
      </Pressable>
      <ScreenTitle accessibilityRole="header">{formatDisplayDate(date)}</ScreenTitle>

      <Card style={styles.card}>
        <Eyebrow>What happened</Eyebrow>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Status">
          {options.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => setStatus(o.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: status === o.id }}
              style={[styles.chip, status === o.id && { backgroundColor: o.id === 'missed' ? colors.inkSoft : accent, borderColor: o.id === 'missed' ? colors.inkSoft : accent }]}
            >
              <Caption style={status === o.id ? styles.chipTextActive : undefined}>{o.label}</Caption>
            </Pressable>
          ))}
        </View>
        {status === 'minimum' && habit.minimumVersion ? <Caption style={styles.muted}>Minimum version: {habit.minimumVersion}</Caption> : null}
        <Caption style={styles.muted}>
          {entry.done && time ? `Completed at ${formatTimeOfDay(time)}` : entry.done ? 'Completion time not recorded (filled in later)' : 'Marked as missed'}
          {entry.plannedTime ? ` · planned for ${formatClockTime(entry.plannedTime)}` : ''}
          {entry.durationMinutes ? ` · ${entry.durationMinutes} min session` : ''}
        </Caption>
        {!entry.done && entry.reasonTags?.length ? <Caption>What got in the way: {entry.reasonTags.join(', ')}</Caption> : null}
      </Card>

      <Card style={styles.card}>
        <Eyebrow>Comment</Eyebrow>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add a comment..."
          placeholderTextColor={colors.inkSoft}
          style={styles.note}
          multiline
          accessibilityLabel="Comment"
        />
      </Card>

      {feeling && (
        <Card style={styles.card}>
          <Eyebrow>How it felt</Eyebrow>
          <Body style={{ color: zoneMeta(feeling.zone).accent }}>
            {feelingWords.length ? feelingWords.join(' & ') : zoneMeta(feeling.zone).label}
          </Body>
          {feeling.note ? <Caption>"{feeling.note}"</Caption> : null}
        </Card>
      )}

      {entry.photoUri ? <Image source={{ uri: entry.photoUri }} style={styles.photo} resizeMode="cover" accessibilityLabel="Photo from this day" /> : null}

      <PrimaryButton label="Save changes" disabled={!dirty} onPress={() => void save()} style={styles.save} />
      <Pressable onPress={remove} style={styles.delete} accessibilityRole="button">
        <Ionicons name="trash-outline" size={16} color={colors.inkSoft} />
        <Caption> Delete this day</Caption>
      </Pressable>
    </>
  );
}

const styles = themedStyles(() => ({
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  card: { gap: spacing.sm, marginTop: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingVertical: 6, paddingHorizontal: spacing.sm + 2, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, minHeight: 36, justifyContent: 'center' },
  chipTextActive: { color: colors.white, fontFamily: fonts.bodyMedium },
  muted: { color: colors.inkSoft },
  note: { fontFamily: fonts.body, fontSize: 16, color: colors.ink, minHeight: 80, textAlignVertical: 'top' },
  photo: { width: '100%', height: 220, borderRadius: radii.md, marginTop: spacing.md },
  save: { marginTop: spacing.lg },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: spacing.sm },
}));
