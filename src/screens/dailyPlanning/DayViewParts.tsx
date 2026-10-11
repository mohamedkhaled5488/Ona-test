// Pieces of the Daily Planning day view: the group/sort/filter sheet, search
// results, the carry-over card and "Plan my day".
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SheetModal } from '../../components/SheetModal';
import { Card } from '../../components/Card';
import { TagChip } from '../../components/TagPicker';
import { Body, Caption, Eyebrow, SectionHeading } from '../../components/Typography';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, fonts, radii, spacing } from '../../theme';
import { themedStyles } from '../../theme/runtime';
import { withAlpha } from '../../utils/color';
import { formatDisplayDate } from '../../utils/date';
import { DEFAULT_DAY_VIEW, type DayLoad, type DayViewPrefs, type GroupBy, type SearchHit, type SortBy, type StatusFilter } from '../../utils/dayView';
import { formatMinutes } from '../../utils/taskForm';
import type { DailyTask, TaskEnergy, TaskPriority, TaskTag } from '../../types/sections';

function Chip({ label, active, onPress, role = 'radio' }: { label: string; active: boolean; onPress: () => void; role?: 'radio' | 'checkbox' }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected: active } : { checked: active }}
      hitSlop={4}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Caption style={active ? styles.chipTextActive : undefined}>{label}</Caption>
    </Pressable>
  );
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'none', label: 'No groups' },
  { id: 'tag', label: 'Tag' },
  { id: 'priority', label: 'Priority' },
  { id: 'energy', label: 'Energy' },
  { id: 'status', label: 'Done or not' },
];
const SORTS: { id: SortBy; label: string }[] = [
  { id: 'manual', label: 'My order' },
  { id: 'time', label: 'Time' },
  { id: 'priority', label: 'Priority' },
  { id: 'energy', label: 'Energy' },
];
const STATUSES: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'To do' },
  { id: 'done', label: 'Done' },
];
const PRIORITIES: TaskPriority[] = ['high', 'medium', 'low', 'none'];
const ENERGIES: TaskEnergy[] = ['high', 'medium', 'low'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function ViewOptionsSheet({
  visible,
  onClose,
  prefs,
  onChange,
  tags,
}: {
  visible: boolean;
  onClose: () => void;
  prefs: DayViewPrefs;
  onChange: (prefs: DayViewPrefs) => void;
  tags: TaskTag[];
}) {
  const f = prefs.filters;
  const setFilters = (patch: Partial<DayViewPrefs['filters']>) => onChange({ ...prefs, filters: { ...f, ...patch } });
  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.sheetHeader}>
        <SectionHeading>Show</SectionHeading>
        <Pressable hitSlop={8} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={colors.inkSoft} />
        </Pressable>
      </View>
      <Eyebrow style={styles.label}>Group by</Eyebrow>
      <View style={styles.row}>
        {GROUPS.map((g) => (
          <Chip key={g.id} label={g.label} active={prefs.groupBy === g.id} onPress={() => onChange({ ...prefs, groupBy: g.id })} />
        ))}
      </View>
      <Eyebrow style={styles.label}>Sort by</Eyebrow>
      <View style={styles.row}>
        {SORTS.map((s) => (
          <Chip key={s.id} label={s.label} active={prefs.sortBy === s.id} onPress={() => onChange({ ...prefs, sortBy: s.id })} />
        ))}
      </View>
      <Eyebrow style={styles.label}>Status</Eyebrow>
      <View style={styles.row}>
        {STATUSES.map((s) => (
          <Chip key={s.id} label={s.label} active={f.status === s.id} onPress={() => setFilters({ status: s.id })} />
        ))}
      </View>
      <Eyebrow style={styles.label}>Priority</Eyebrow>
      <View style={styles.row}>
        {PRIORITIES.map((p) => (
          <Chip key={p} role="checkbox" label={p === 'none' ? 'No priority' : cap(p)} active={f.priorities.includes(p)} onPress={() => setFilters({ priorities: toggle(f.priorities, p) })} />
        ))}
      </View>
      <Eyebrow style={styles.label}>Energy</Eyebrow>
      <View style={styles.row}>
        {ENERGIES.map((e) => (
          <Chip key={e} role="checkbox" label={cap(e)} active={f.energies.includes(e)} onPress={() => setFilters({ energies: toggle(f.energies, e) })} />
        ))}
      </View>
      {tags.length > 0 && (
        <>
          <Eyebrow style={styles.label}>Tags</Eyebrow>
          <View style={styles.row}>
            {tags.map((t) => (
              <TagChip key={t.id} tag={t} selected={f.tagIds.includes(t.id)} onPress={() => setFilters({ tagIds: toggle(f.tagIds, t.id) })} />
            ))}
          </View>
        </>
      )}
      <View style={styles.sheetActions}>
        <PrimaryButton label="Reset" variant="outline" style={styles.flex} onPress={() => onChange(DEFAULT_DAY_VIEW)} />
        <PrimaryButton label="Done" style={styles.flex} onPress={onClose} />
      </View>
    </SheetModal>
  );
}

const WHERE: Record<SearchHit['where'], string> = { title: '', notes: 'in notes', subtask: 'in a subtask', context: 'in where/how', why: 'in why' };

export function SearchResults({ hits, query, titleOf, onOpen }: { hits: SearchHit[]; query: string; titleOf: (t: DailyTask) => string; onOpen: (hit: SearchHit) => void }) {
  if (!query.trim()) return <Caption style={styles.muted}>Search every task, on any day: titles, notes, subtasks.</Caption>;
  if (hits.length === 0) return <Caption style={styles.muted}>Nothing matches "{query.trim()}".</Caption>;
  return (
    <View style={styles.results}>
      <Caption style={styles.muted} accessibilityLiveRegion="polite">
        {hits.length} {hits.length === 1 ? 'task' : 'tasks'}
      </Caption>
      {hits.map((h) => (
        <Pressable key={h.task.id} style={styles.resultRow} onPress={() => onOpen(h)} accessibilityRole="button">
          <View style={styles.flex}>
            <Body numberOfLines={2}>{titleOf(h.task) || 'Untitled task'}</Body>
            <Caption style={styles.muted}>
              {formatDisplayDate(h.date)}
              {h.task.repeat !== 'none' ? ' · repeats' : ''}
              {WHERE[h.where] ? ` · ${WHERE[h.where]}` : ''}
            </Caption>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
        </Pressable>
      ))}
    </View>
  );
}

// One-off tasks left unfinished on earlier days. Each one: bring it to today,
// pick a date, or let it go (archived, never counted as a failure).
export function CarryOverCard({
  tasks,
  titleOf,
  onToday,
  onPickDate,
  onLetGo,
}: {
  tasks: DailyTask[];
  titleOf: (t: DailyTask) => string;
  onToday: (t: DailyTask) => void;
  onPickDate: (t: DailyTask) => void;
  onLetGo: (t: DailyTask) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (tasks.length === 0) return null;
  const shown = showAll ? tasks : tasks.slice(0, 3);
  return (
    <Card style={styles.card}>
      <Eyebrow accessibilityRole="header">Still open from earlier</Eyebrow>
      <Caption style={styles.muted}>Bring them along, give them a new day, or let them go. All three are fine.</Caption>
      {shown.map((t) => (
        <View key={t.id} style={styles.carryRow}>
          <Body numberOfLines={2}>{titleOf(t) || 'Untitled task'}</Body>
          <Caption style={styles.muted}>{formatDisplayDate(t.date)}</Caption>
          <View style={styles.row}>
            <Pressable style={styles.smallBtn} onPress={() => onToday(t)} accessibilityRole="button" accessibilityLabel={`Move "${titleOf(t)}" to today`}>
              <Caption style={styles.btnText}>Today</Caption>
            </Pressable>
            <Pressable style={styles.smallBtn} onPress={() => onPickDate(t)} accessibilityRole="button" accessibilityLabel={`Pick a date for "${titleOf(t)}"`}>
              <Caption style={styles.btnText}>Pick a date</Caption>
            </Pressable>
            <Pressable style={styles.smallBtn} onPress={() => onLetGo(t)} accessibilityRole="button" accessibilityLabel={`Let go of "${titleOf(t)}"`}>
              <Caption style={styles.btnText}>Let go</Caption>
            </Pressable>
          </View>
        </View>
      ))}
      {tasks.length > 3 && (
        <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" style={styles.more}>
          <Caption style={styles.btnText}>{showAll ? 'Show fewer' : `Show all ${tasks.length}`}</Caption>
        </Pressable>
      )}
    </Card>
  );
}

const STEP = 30;

export function PlanMyDayCard({ load, onChangeAvailable }: { load: DayLoad; onChangeAvailable: (minutes: number) => void }) {
  const [open, setOpen] = useState(false);
  const fill = load.availableMinutes ? Math.min(1, load.remainingMinutes / load.availableMinutes) : 0;
  return (
    <Card style={styles.card}>
      <Pressable style={styles.planTop} onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Plan my day. ${load.message}`}>
        <Eyebrow>Plan my day</Eyebrow>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.inkSoft} />
      </Pressable>
      <Body>{load.message}</Body>
      {load.remainingMinutes > 0 && (
        <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.fill, { width: `${fill * 100}%` }, load.overfull && styles.fillFull]} />
        </View>
      )}
      {open && (
        <View style={styles.planDetail}>
          <Caption style={styles.muted}>
            {formatMinutes(load.plannedMinutes)} planned · {formatMinutes(load.remainingMinutes)} left
            {load.withoutEstimate ? ` · ${load.withoutEstimate} without an estimate` : ''}
          </Caption>
          <View style={styles.stepper}>
            <Caption>Time I have for tasks</Caption>
            <Pressable
              style={styles.stepBtn}
              onPress={() => onChangeAvailable(Math.max(STEP, load.availableMinutes - STEP))}
              accessibilityRole="button"
              accessibilityLabel="Less time"
            >
              <Ionicons name="remove" size={18} color={colors.ink} />
            </Pressable>
            <Body style={styles.stepValue} accessibilityLiveRegion="polite">
              {formatMinutes(load.availableMinutes)}
            </Body>
            <Pressable
              style={styles.stepBtn}
              onPress={() => onChangeAvailable(Math.min(16 * 60, load.availableMinutes + STEP))}
              accessibilityRole="button"
              accessibilityLabel="More time"
            >
              <Ionicons name="add" size={18} color={colors.ink} />
            </Pressable>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  muted: { color: colors.inkSoft },
  label: { marginTop: spacing.md, marginBottom: spacing.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingVertical: 6, paddingHorizontal: spacing.sm + 2, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, minHeight: 34, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipTextActive: { color: colors.white },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  results: { gap: spacing.xs, marginBottom: spacing.md },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line, minHeight: 48 },
  card: { gap: spacing.sm, marginBottom: spacing.md },
  carryRow: { gap: 4, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line },
  smallBtn: { paddingVertical: 6, paddingHorizontal: spacing.sm + 2, borderRadius: radii.full, borderWidth: 1, borderColor: colors.teal, minHeight: 34, justifyContent: 'center' },
  btnText: { color: colors.teal, fontFamily: fonts.bodyMedium },
  more: { alignSelf: 'flex-start', paddingVertical: spacing.xs, minHeight: 36, justifyContent: 'center' },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.teal },
  // Over capacity reads as "full", in the app's own warm accent — never red.
  fillFull: { backgroundColor: withAlpha(colors.amber, 0.8) },
  planDetail: { gap: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 70, textAlign: 'center', fontFamily: fonts.bodyMedium },
}));
