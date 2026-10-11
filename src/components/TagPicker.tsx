import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from './TextInput';
import { Caption } from './Typography';
import { useDailyPlanningStore } from '../store/useDailyPlanningStore';
import { planColorPalette } from '../data/planStepColors';
import { suggestTags } from '../utils/taskForm';
import { withAlpha } from '../utils/color';
import { colors, fonts, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import type { TaskTag } from '../types/sections';

export function TagChip({ tag, selected, onPress, onRemove }: { tag: TaskTag; selected?: boolean; onPress?: () => void; onRemove?: () => void }) {
  return (
    <Pressable
      onPress={onPress ?? onRemove}
      disabled={!onPress && !onRemove}
      accessibilityRole="button"
      accessibilityLabel={onRemove ? `Remove tag ${tag.name}` : selected ? `Tag ${tag.name}, selected` : `Add tag ${tag.name}`}
      style={[styles.chip, { borderColor: tag.color }, selected && { backgroundColor: withAlpha(tag.color, 0.16) }]}
      hitSlop={4}
    >
      <View style={[styles.dot, { backgroundColor: tag.color }]} />
      <Caption style={[styles.chipText, selected && { color: colors.ink }]}>{tag.name}</Caption>
      {onRemove && <Ionicons name="close" size={13} color={colors.inkSoft} />}
    </Pressable>
  );
}

// Choose tags for a task: the chosen ones, suggestions from tags used before,
// and creating a new tag (with a color) right here.
export function TagPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const tags = useDailyPlanningStore((s) => s.tags);
  const tasks = useDailyPlanningStore((s) => s.tasks);
  const addTag = useDailyPlanningStore((s) => s.addTag);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | undefined>(undefined);

  const chosen = value.map((id) => tags.find((t) => t.id === id)).filter((t): t is TaskTag => !!t);
  const suggestions = suggestTags(tags, tasks, value);
  const typed = name.trim().toLowerCase();
  const matches = typed ? tags.filter((t) => !value.includes(t.id) && t.name.toLowerCase().includes(typed)) : [];

  const create = () => {
    const id = addTag(name, color);
    if (id && !value.includes(id)) onChange([...value, id]);
    setName('');
    setColor(undefined);
    setCreating(false);
  };

  return (
    <View style={styles.wrap}>
      {chosen.length > 0 && (
        <View style={styles.row}>
          {chosen.map((t) => (
            <TagChip key={t.id} tag={t} selected onRemove={() => onChange(value.filter((x) => x !== t.id))} />
          ))}
        </View>
      )}
      <View style={styles.row}>
        {(creating ? matches : suggestions).map((t) => (
          <TagChip key={t.id} tag={t} onPress={() => onChange([...value, t.id])} />
        ))}
        {!creating && (
          <Pressable style={styles.newChip} onPress={() => setCreating(true)} accessibilityRole="button" accessibilityLabel="New tag" hitSlop={4}>
            <Ionicons name="add" size={14} color={colors.teal} />
            <Caption style={styles.newText}>New tag</Caption>
          </Pressable>
        )}
      </View>
      {creating && (
        <View style={styles.createBox}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Tag name"
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={create}
            accessibilityLabel="New tag name"
          />
          <View style={styles.row}>
            {planColorPalette.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                accessibilityRole="radio"
                accessibilityState={{ selected: color === c }}
                accessibilityLabel={`Color ${c}`}
                style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
              />
            ))}
          </View>
          <View style={styles.row}>
            <Pressable onPress={create} disabled={!name.trim()} style={[styles.action, !name.trim() && styles.dim]} accessibilityRole="button">
              <Caption style={styles.newText}>Add tag</Caption>
            </Pressable>
            <Pressable
              onPress={() => {
                setCreating(false);
                setName('');
              }}
              style={styles.action}
              accessibilityRole="button"
            >
              <Caption>Cancel</Caption>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    minHeight: 32,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: colors.inkSoft },
  newChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.teal,
    minHeight: 32,
  },
  newText: { color: colors.teal, fontFamily: fonts.bodyMedium },
  createBox: { gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.stone },
  input: { fontFamily: fonts.body, fontSize: 16, color: colors.ink, paddingVertical: spacing.xs },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchActive: { borderWidth: 3, borderColor: colors.ink },
  action: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, minHeight: 36, justifyContent: 'center' },
  dim: { opacity: 0.4 },
}));
