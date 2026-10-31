// "What's behind this?": the one tag picker for a feeling, everywhere a
// feeling is noted (Identify the Feeling, the quick sheet after a habit,
// practice or Quit moment, a task, the journal). The same tags as Feelings:
// the usual list, then your own; the few used most recently first, so the
// usual ones are one tap away; "Add your own" makes a new one, kept for next
// time. Selecting nothing is fine.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from './TextInput';
import { PrimaryButton } from './PrimaryButton';
import { Caption } from './Typography';
import { reasonTagOptions } from '../data/feelingsWheel';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { colors, fonts, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import type { FeelingCheckIn } from '../types/sections';

export const REASON_TAGS_LABEL = "What's behind this? (optional)";
const RECENT_MAX = 6;

// The tag list as Feelings shows it, with the most recently used first (only
// real reason tags: never an item's name that was added on its own).
export function reasonTagChoices(entries: FeelingCheckIn[], customTags: string[]): { recent: string[]; rest: string[] } {
  const all = [...reasonTagOptions, ...customTags.filter((t) => !(reasonTagOptions as readonly string[]).includes(t))];
  const known = new Set(all);
  const recent: string[] = [];
  for (const e of [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    for (const t of e.reasonTags ?? []) if (known.has(t) && !recent.includes(t)) recent.push(t);
    if (recent.length >= RECENT_MAX) break;
  }
  const shown = recent.slice(0, RECENT_MAX);
  return { recent: shown, rest: all.filter((t) => !shown.includes(t)) };
}

export function ReasonTagPicker({ selected, onChange, accent = colors.teal }: { selected: string[]; onChange: (tags: string[]) => void; accent?: string }) {
  const entries = useFeelingsStore((s) => s.entries);
  const customTags = useFeelingsStore((s) => s.customReasonTags);
  const addCustomReasonTag = useFeelingsStore((s) => s.addCustomReasonTag);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const { recent, rest } = reasonTagChoices(entries, customTags);
  const toggle = (t: string) => onChange(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t]);
  const add = () => {
    const name = draft.trim();
    setAdding(false);
    setDraft('');
    if (!name) return;
    const created = addCustomReasonTag(name);
    if (!selected.includes(created)) onChange([...selected, created]);
  };
  const chip = (t: string) => {
    const active = selected.includes(t);
    return (
      <Pressable
        key={t}
        onPress={() => toggle(t)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: active }}
        accessibilityLabel={t}
        hitSlop={4}
        style={[styles.chip, { borderColor: active ? accent : colors.line }, active && { backgroundColor: accent }]}
      >
        <Caption style={active ? styles.chipTextActive : undefined}>{t}</Caption>
      </Pressable>
    );
  };
  return (
    <View accessibilityLabel={REASON_TAGS_LABEL}>
      {recent.length > 0 && (
        <>
          <Caption style={styles.groupLabel}>Recent</Caption>
          <View style={styles.chips}>{recent.map(chip)}</View>
        </>
      )}
      <View style={styles.chips}>
        {rest.map(chip)}
        {!adding && (
          <Pressable onPress={() => setAdding(true)} accessibilityRole="button" hitSlop={4} style={[styles.chip, styles.add, { borderColor: accent }]}>
            <Ionicons name="add" size={14} color={accent} />
            <Caption style={{ color: accent }}>Add your own</Caption>
          </Pressable>
        )}
      </View>
      {adding && (
        <View style={styles.addRow}>
          <TextInput value={draft} onChangeText={setDraft} placeholder="e.g. Exam, Move, a name..." placeholderTextColor={colors.inkSoft} style={styles.input} autoFocus onSubmitEditing={add} accessibilityLabel="Your own tag" />
          <PrimaryButton label="Add" onPress={add} disabled={!draft.trim()} />
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  groupLabel: { color: colors.inkSoft, marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: spacing.sm + 2, borderRadius: radii.full, borderWidth: 1, minHeight: 36, justifyContent: 'center' },
  chipTextActive: { color: colors.white, fontFamily: fonts.bodyMedium },
  add: { borderStyle: 'dashed' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: spacing.xs },
}));
