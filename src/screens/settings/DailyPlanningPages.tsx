// Settings → Daily Planning: managing tags and templates, and the archive of
// tasks the user let go.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SheetModal } from '../../components/SheetModal';
import { TextInput } from '../../components/TextInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useUi } from '../../components/UiProvider';
import { Body, Caption, SectionHeading } from '../../components/Typography';
import { Group, Notice } from './SettingsParts';
import { useDailyPlanningStore, resolveTaskTitle } from '../../store/useDailyPlanningStore';
import { STARTER_TASK_TEMPLATES } from '../../data/taskTemplates';
import { planColorPalette } from '../../data/planStepColors';
import { letGoArchive } from '../../utils/taskRepeat';
import { formatDisplayDate, todayISO } from '../../utils/date';
import { colors, fonts, radii, spacing } from '../../theme';
import { themedStyles } from '../../theme/runtime';
import type { TaskTag } from '../../types/sections';

const snapshot = () => {
  const { tasks, tags, taskTemplates } = useDailyPlanningStore.getState();
  return () => useDailyPlanningStore.setState({ tasks, tags, taskTemplates });
};

function TagEditSheet({ tag, onClose }: { tag: TaskTag | null; onClose: () => void }) {
  const tags = useDailyPlanningStore((s) => s.tags);
  const tasks = useDailyPlanningStore((s) => s.tasks);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [merging, setMerging] = useState(false);
  const { showDialog, showToast } = useUi();
  React.useEffect(() => {
    if (tag) {
      setName(tag.name);
      setError(undefined);
      setMerging(false);
    }
  }, [tag]);
  if (!tag) return null;
  const s = useDailyPlanningStore.getState();
  const count = tasks.filter((t) => t.tagIds.includes(tag.id)).length;

  const rename = () => {
    const result = s.renameTag(tag.id, name);
    if (result === 'empty') setError('A tag needs a name.');
    else if (result === 'taken') setError('Another tag already has this name. You can merge them instead.');
    else onClose();
  };

  // Dialogs open after the sheet closes (a dialog over a sheet can end up hidden).
  const remove = () => {
    onClose();
    showDialog({
      title: `Delete the tag "${tag.name}"?`,
      message: count ? `${count} ${count === 1 ? 'task keeps' : 'tasks keep'} everything else; only the tag is removed.` : 'No tasks use it.',
      actions: [
        { label: 'Keep it', style: 'cancel' },
        {
          label: 'Delete tag',
          style: 'destructive',
          onPress: () => {
            const restore = snapshot();
            s.deleteTag(tag.id);
            showToast({ message: 'Tag deleted', actionLabel: 'Undo', onAction: restore });
          },
        },
      ],
    });
  };

  const mergeInto = (into: TaskTag) => {
    onClose();
    showDialog({
      title: `Merge "${tag.name}" into "${into.name}"?`,
      message: `Tasks tagged ${tag.name} will be tagged ${into.name}, and "${tag.name}" goes away.`,
      actions: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: 'Merge',
          style: 'default',
          onPress: () => {
            const restore = snapshot();
            s.mergeTags(tag.id, into.id);
            showToast({ message: `Merged into ${into.name}`, actionLabel: 'Undo', onAction: restore });
          },
        },
      ],
    });
  };

  return (
    <SheetModal visible onClose={onClose}>
      <SectionHeading>Edit tag</SectionHeading>
      <Caption style={styles.muted}>
        Used on {count} {count === 1 ? 'task' : 'tasks'}.
      </Caption>
      <TextInput
        value={name}
        onChangeText={(v) => {
          setName(v);
          setError(undefined);
        }}
        style={styles.input}
        accessibilityLabel="Tag name"
        returnKeyType="done"
        onSubmitEditing={rename}
      />
      {error && (
        <Caption style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Caption>
      )}
      <View style={styles.swatches}>
        {planColorPalette.map((c) => (
          <Pressable
            key={c}
            onPress={() => s.setTagColor(tag.id, c)}
            accessibilityRole="radio"
            accessibilityState={{ selected: tag.color === c }}
            accessibilityLabel={`Color ${c}`}
            style={[styles.swatch, { backgroundColor: c }, tag.color === c && styles.swatchActive]}
          />
        ))}
      </View>
      {merging ? (
        <View style={styles.mergeList}>
          <Caption style={styles.muted}>Merge into:</Caption>
          {tags
            .filter((t) => t.id !== tag.id)
            .map((t) => (
              <Pressable key={t.id} style={styles.mergeRow} onPress={() => mergeInto(t)} accessibilityRole="button">
                <View style={[styles.dot, { backgroundColor: t.color }]} />
                <Body>{t.name}</Body>
              </Pressable>
            ))}
        </View>
      ) : (
        tags.length > 1 && (
          <Pressable style={styles.linkRow} onPress={() => setMerging(true)} accessibilityRole="button">
            <Ionicons name="git-merge-outline" size={16} color={colors.teal} />
            <Caption style={styles.link}>Merge into another tag</Caption>
          </Pressable>
        )
      )}
      <View style={styles.actions}>
        <PrimaryButton label="Delete" variant="outline" style={styles.flex} onPress={remove} />
        <PrimaryButton label="Save" style={styles.flex} onPress={rename} />
      </View>
    </SheetModal>
  );
}

export function TagsPage() {
  const tags = useDailyPlanningStore((s) => s.tags);
  const tasks = useDailyPlanningStore((s) => s.tasks);
  const [editing, setEditing] = useState<TaskTag | null>(null);
  const [newName, setNewName] = useState('');
  const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name));
  // Keep the sheet showing the live tag (its color changes as you pick).
  const live = editing ? tags.find((t) => t.id === editing.id) ?? null : null;
  return (
    <>
      <Group footer="Deleting a tag keeps its tasks. Feelings logged after tagged tasks keep the tag's name, and follow renames and merges.">
        {sorted.length === 0 && <Caption style={styles.empty}>No tags yet. Add one here or on any task.</Caption>}
        {sorted.map((t) => {
          const n = tasks.filter((x) => x.tagIds.includes(t.id)).length;
          return (
            <Pressable key={t.id} style={styles.row} onPress={() => setEditing(t)} accessibilityRole="button" accessibilityLabel={`${t.name}, ${n} tasks. Edit`}>
              <View style={[styles.dot, { backgroundColor: t.color }]} />
              <Body style={styles.flex}>{t.name}</Body>
              <Caption style={styles.muted}>{n}</Caption>
              <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
            </Pressable>
          );
        })}
        <View style={styles.addRow}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="New tag"
            placeholderTextColor={colors.inkSoft}
            style={[styles.input, styles.flex]}
            returnKeyType="done"
            onSubmitEditing={() => {
              useDailyPlanningStore.getState().addTag(newName);
              setNewName('');
            }}
            accessibilityLabel="New tag name"
          />
          <Pressable
            onPress={() => {
              useDailyPlanningStore.getState().addTag(newName);
              setNewName('');
            }}
            disabled={!newName.trim()}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Caption style={[styles.link, !newName.trim() && styles.dim]}>Add</Caption>
          </Pressable>
        </View>
      </Group>
      <TagEditSheet tag={live} onClose={() => setEditing(null)} />
    </>
  );
}

export function TemplatesPage() {
  const templates = useDailyPlanningStore((s) => s.taskTemplates);
  const hidden = useDailyPlanningStore((s) => s.hiddenStarterTemplates);
  const { showDialog, showToast } = useUi();
  const remove = (id: string, name: string) =>
    showDialog({
      title: `Delete the template "${name}"?`,
      message: 'Tasks made from it stay as they are.',
      actions: [
        { label: 'Keep it', style: 'cancel' },
        {
          label: 'Delete',
          style: 'destructive',
          onPress: () => {
            const restore = snapshot();
            useDailyPlanningStore.getState().deleteTaskTemplate(id);
            showToast({ message: 'Template deleted', actionLabel: 'Undo', onAction: restore });
          },
        },
      ],
    });
  return (
    <>
      <Group title="Your templates" footer='Save any task as a template from its page ("More options" → Template).'>
        {templates.length === 0 && <Caption style={styles.empty}>No templates of your own yet.</Caption>}
        {templates.map((t) => (
          <View key={t.id} style={styles.row}>
            <View style={styles.flex}>
              <Body>{t.name}</Body>
              <Caption style={styles.muted}>
                {t.fields.title}
                {t.fields.subtaskTitles.length ? ` · ${t.fields.subtaskTitles.length} subtasks` : ''}
              </Caption>
            </View>
            <Pressable onPress={() => remove(t.id, t.name)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete template ${t.name}`}>
              <Ionicons name="trash-outline" size={18} color={colors.inkSoft} />
            </Pressable>
          </View>
        ))}
      </Group>
      <Group title="Starter templates" footer="Hidden ones just stop showing on new tasks.">
        {STARTER_TASK_TEMPLATES.map((t) => {
          const shown = !hidden.includes(t.id);
          return (
            <View key={t.id} style={styles.row}>
              <Body style={styles.flex}>{t.name}</Body>
              <Pressable
                onPress={() => useDailyPlanningStore.getState().setStarterTemplateHidden(t.id, shown)}
                accessibilityRole="button"
                accessibilityLabel={shown ? `Hide ${t.name}` : `Show ${t.name}`}
                hitSlop={8}
              >
                <Caption style={styles.link}>{shown ? 'Hide' : 'Show'}</Caption>
              </Pressable>
            </View>
          );
        })}
      </Group>
    </>
  );
}

export function ArchivePage() {
  const tasks = useDailyPlanningStore((s) => s.tasks);
  const { showToast } = useUi();
  const items = letGoArchive(tasks);
  const today = todayISO();
  return (
    <>
      <Notice>
        <Caption>Tasks you chose to let go. Letting go is a choice, not a miss: they never count against a day.</Caption>
      </Notice>
      <Group>
        {items.length === 0 && <Caption style={styles.empty}>Nothing here.</Caption>}
        {items.map(({ task, date }) => (
          <View key={`${task.id}-${date}`} style={styles.archiveRow}>
            <Body>{resolveTaskTitle(task) || 'Untitled task'}</Body>
            <Caption style={styles.muted}>
              {formatDisplayDate(date)}
              {task.repeat !== 'none' ? ' · one day of a repeating task' : ''}
            </Caption>
            <View style={styles.archiveActions}>
              {task.repeat === 'none' && (
                <Pressable
                  style={styles.smallBtn}
                  onPress={() => {
                    const s = useDailyPlanningStore.getState();
                    s.undoLetGo(task.id, date);
                    if (date !== today) s.rescheduleTask(task.id, date, today, task.scheduledTime);
                    showToast({ message: 'Back on today' });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Bring "${resolveTaskTitle(task)}" back to today`}
                >
                  <Caption style={styles.link}>Bring back to today</Caption>
                </Pressable>
              )}
              <Pressable
                style={styles.smallBtn}
                onPress={() => {
                  useDailyPlanningStore.getState().undoLetGo(task.id, date);
                  showToast({ message: `Back on ${formatDisplayDate(date)}` });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Put "${resolveTaskTitle(task)}" back on ${formatDisplayDate(date)}`}
              >
                <Caption style={styles.link}>Put back on its day</Caption>
              </Pressable>
            </View>
          </View>
        ))}
      </Group>
    </>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  muted: { color: colors.inkSoft },
  empty: { color: colors.inkSoft, padding: spacing.md },
  error: { color: colors.amber },
  link: { color: colors.teal, fontFamily: fonts.bodyMedium },
  dim: { opacity: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 48 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6 },
  input: { fontFamily: fonts.body, fontSize: 16, color: colors.ink, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  swatchActive: { borderWidth: 3, borderColor: colors.ink },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, marginTop: spacing.sm },
  mergeList: { marginTop: spacing.sm, gap: 2 },
  mergeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  archiveRow: { gap: 4, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  archiveActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 },
  smallBtn: { paddingVertical: 6, paddingHorizontal: spacing.sm + 2, borderRadius: radii.full, borderWidth: 1, borderColor: colors.teal, minHeight: 34, justifyContent: 'center' },
}));
