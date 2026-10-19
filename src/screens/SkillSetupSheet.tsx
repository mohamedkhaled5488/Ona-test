import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from '../components/TextInput';
import { SheetModal } from '../components/SheetModal';
import { SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, fonts, radii, spacing } from '../theme';
import { addDaysISO, formatDisplayDate, todayISO } from '../utils/date';
import { skillTemplates, SELF_RATING_METRIC, type MetricTemplate } from '../data/skillPresets';
import { useSkillsStore, MAX_EXTRA_METRICS, type MetricDefinition } from '../store/useSkillsStore';
import { LEVEL_LABELS, LEVEL_ORDER, activeMetrics } from '../utils/skillProgress';
import type { Skill, SkillMetric, SkillResourceStatus, SkillResourceType, SubSkill } from '../types/sections';
import { themedStyles } from '../theme/runtime';
import { parseNumberInput } from '../utils/numberInput';

const TARGETS: { label: string; days: number | null }[] = [
  { label: 'No date', days: null },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 91 },
  { label: '6 months', days: 182 },
  { label: '1 year', days: 365 },
];

const WEEKLY_GOALS: { label: string; minutes: number | undefined }[] = [
  { label: 'None', minutes: undefined },
  { label: '1 h', minutes: 60 },
  { label: '2 h', minutes: 120 },
  { label: '3 h', minutes: 180 },
  { label: '5 h', minutes: 300 },
];

const RESOURCE_TYPES: SkillResourceType[] = ['course', 'book', 'tutor', 'video', 'app', 'other'];
const RESOURCE_STATUS_LABEL: Record<SkillResourceStatus, string> = { notStarted: 'Not started', inProgress: 'In progress', done: 'Done' };
const NEXT_STATUS: Record<SkillResourceStatus, SkillResourceStatus> = { notStarted: 'inProgress', inProgress: 'done', done: 'notStarted' };

function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress: () => void; color: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}>
      <Caption style={active ? styles.chipTextActive : undefined}>{label}</Caption>
    </Pressable>
  );
}

export function LevelDots({ value, color, onChange }: { value: SubSkill['level']; color: string; onChange?: (v: SubSkill['level']) => void }) {
  return (
    <View style={styles.dots}>
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <Pressable key={n} disabled={!onChange} hitSlop={4} onPress={() => onChange?.(n)} accessibilityLabel={`Level ${n} of 5`}>
          <View style={[styles.dot, n <= value && { backgroundColor: color, borderColor: color }]} />
        </Pressable>
      ))}
    </View>
  );
}

// Name, unit and which direction counts as better — or one tap on a template.
function MetricForm({ templates, color, onSubmit, onCancel, submitLabel }: { templates: MetricTemplate[]; color: string; onSubmit: (def: MetricDefinition) => void; onCancel?: () => void; submitLabel: string }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [direction, setDirection] = useState<'higher' | 'lower'>('higher');
  return (
    <View style={styles.metricForm}>
      <View style={styles.chipRow}>
        {templates.map((t) => (
          <Chip key={t.name} label={`${t.name}${t.unit ? ` (${t.unit})` : ''}`} color={color} onPress={() => onSubmit(t)} />
        ))}
      </View>
      <Caption style={styles.hint}>…or define your own:</Caption>
      <TextInput value={name} onChangeText={setName} placeholder="What you measure, e.g. Plank hold" placeholderTextColor={colors.inkSoft} style={styles.input} />
      <TextInput value={unit} onChangeText={setUnit} placeholder="Unit, e.g. sec" placeholderTextColor={colors.inkSoft} style={styles.input} />
      <View style={styles.chipRow}>
        <Chip label="Higher is better" active={direction === 'higher'} color={color} onPress={() => setDirection('higher')} />
        <Chip label="Lower is better" active={direction === 'lower'} color={color} onPress={() => setDirection('lower')} />
      </View>
      <View style={styles.row}>
        {onCancel && <PrimaryButton label="Cancel" variant="outline" style={styles.flex} onPress={onCancel} />}
        <PrimaryButton label={submitLabel} disabled={!name.trim()} style={styles.flex} onPress={() => onSubmit({ name, unit, direction })} />
      </View>
    </View>
  );
}

function MetricRow({ metric, color, onChange, onRemove }: { metric: SkillMetric; color: string; onChange: () => void; onRemove: () => void }) {
  return (
    <View style={styles.listRow}>
      <View style={styles.flex}>
        <Body>{metric.name}{metric.unit ? ` (${metric.unit})` : ''}</Body>
        <Caption style={styles.hint}>{metric.direction === 'higher' ? 'Higher is better' : 'Lower is better'} · {metric.role === 'primary' ? 'Primary' : 'Extra'}</Caption>
      </View>
      <Pressable onPress={onChange} hitSlop={8}>
        <Caption style={{ color }}>Change</Caption>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Remove metric" onPress={onRemove} hitSlop={8}>
        <Ionicons name="close" size={16} color={colors.inkSoft} />
      </Pressable>
    </View>
  );
}

// Everything here is optional. Changes save as you go; nothing is required
// beyond the skill's name.
export function SkillSetupSheet({ skill, visible, onClose, hasSessions }: { skill: Skill; visible: boolean; onClose: () => void; hasSessions: boolean }) {
  const store = useSkillsStore();
  const color = skill.color;
  const template = skillTemplates[skill.type ?? 'other'];

  const [goal, setGoal] = useState(skill.goal ?? '');
  const [newSub, setNewSub] = useState('');
  const [editingSub, setEditingSub] = useState<{ id: string; name: string } | null>(null);
  const [metricMode, setMetricMode] = useState<{ kind: 'addPrimary' | 'addExtra' } | { kind: 'redefine'; metricId: string } | null>(null);
  const [customMinutes, setCustomMinutes] = useState('');
  const [resName, setResName] = useState('');
  const [resType, setResType] = useState<SkillResourceType>('course');
  const [resNote, setResNote] = useState('');

  useEffect(() => {
    if (!visible) return;
    setGoal(skill.goal ?? '');
    setMetricMode(null);
    setEditingSub(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const saveGoal = () => {
    if ((skill.goal ?? '') !== goal.trim()) store.updateSkill(skill.id, { goal: goal.trim() || undefined });
  };
  const close = () => {
    saveGoal();
    onClose();
  };

  const active = activeMetrics(skill);
  const primary = active.find((m) => m.role === 'primary');
  const extras = active.filter((m) => m.role === 'extra');
  const archivedMetrics = (skill.metrics ?? []).filter((m) => m.archivedAt).length;
  const subSkills = (skill.subSkills ?? []).filter((s) => !s.archivedAt);
  const archivedSubs = (skill.subSkills ?? []).filter((s) => s.archivedAt);
  const suggestions = template.subSkills.filter((name) => !(skill.subSkills ?? []).some((s) => !s.archivedAt && s.name.toLowerCase() === name.toLowerCase()));
  const metricTemplates = template.metrics.length ? template.metrics : [SELF_RATING_METRIC];
  const targetDays = skill.goalTargetDate ? Math.round((new Date(`${skill.goalTargetDate}T00:00:00`).getTime() - new Date(`${todayISO()}T00:00:00`).getTime()) / 86400000) : null;

  const submitMetric = (def: MetricDefinition) => {
    if (!metricMode) return;
    if (metricMode.kind === 'redefine') store.redefineMetric(skill.id, metricMode.metricId, def);
    else store.addMetric(skill.id, def, metricMode.kind === 'addPrimary' ? 'primary' : 'extra');
    setMetricMode(null);
  };

  return (
    <SheetModal visible={visible} onClose={close}>
      <SectionHeading>Set up {skill.name}</SectionHeading>
      <Caption style={styles.hint}>All optional — fill in what's useful, skip the rest. You can change any of it later.</Caption>

      <Eyebrow style={styles.label}>Where I am now</Eyebrow>
      <View style={styles.chipRow}>
        {LEVEL_ORDER.map((l) => (
          <Chip
            key={l}
            label={LEVEL_LABELS[l]}
            color={color}
            active={(skill.currentLevel ?? skill.startingLevel) === l}
            onPress={() => {
              // Before anything's been logged this is just setting (or
              // correcting) the starting point; after that it's a real level
              // change and goes into the history the Journey shows.
              if (!hasSessions && !skill.levelHistory?.length) store.updateSkill(skill.id, { startingLevel: l });
              else store.setLevel(skill.id, l);
            }}
          />
        ))}
      </View>

      <Eyebrow style={styles.label}>Where I want to be</Eyebrow>
      <TextInput value={goal} onChangeText={setGoal} onBlur={saveGoal} placeholder="e.g. Play three songs at an open mic" placeholderTextColor={colors.inkSoft} style={styles.input} />
      <View style={styles.chipRow}>
        {TARGETS.map((t) => (
          <Chip
            key={t.label}
            label={t.label}
            color={color}
            active={t.days === null ? !skill.goalTargetDate : targetDays !== null && Math.abs(targetDays - t.days) <= 1}
            onPress={() => store.updateSkill(skill.id, { goalTargetDate: t.days === null ? undefined : addDaysISO(todayISO(), t.days) })}
          />
        ))}
      </View>
      {skill.goalTargetDate && <Caption style={styles.hint}>Target: {formatDisplayDate(skill.goalTargetDate)}</Caption>}

      <Eyebrow style={styles.label}>Sub-skills</Eyebrow>
      <Caption style={styles.hint}>The parts that make up the skill. Rate each 1–5 and update it any time.</Caption>
      {subSkills.map((sub) => (
        <View key={sub.id} style={styles.listRow}>
          {editingSub?.id === sub.id ? (
            <TextInput
              autoFocus
              value={editingSub.name}
              onChangeText={(name) => setEditingSub({ id: sub.id, name })}
              onBlur={() => {
                store.renameSubSkill(skill.id, sub.id, editingSub.name);
                setEditingSub(null);
              }}
              style={[styles.input, styles.flex]}
            />
          ) : (
            <Pressable style={styles.flex} onPress={() => setEditingSub({ id: sub.id, name: sub.name })}>
              <Body>{sub.name}</Body>
            </Pressable>
          )}
          <LevelDots value={sub.level} color={color} onChange={(lv) => store.setSubSkillLevel(skill.id, sub.id, lv)} />
          <Pressable onPress={() => store.archiveSubSkill(skill.id, sub.id)} hitSlop={8} accessibilityLabel={`Archive ${sub.name}`}>
            <Ionicons name="archive-outline" size={16} color={colors.inkSoft} />
          </Pressable>
        </View>
      ))}
      {suggestions.length > 0 && (
        <View style={styles.chipRow}>
          {suggestions.map((name) => (
            <Chip key={name} label={`+ ${name}`} color={color} onPress={() => store.addSubSkill(skill.id, name)} />
          ))}
        </View>
      )}
      <View style={styles.row}>
        <TextInput
          value={newSub}
          onChangeText={setNewSub}
          placeholder="Add your own, e.g. Barre chords"
          placeholderTextColor={colors.inkSoft}
          style={[styles.input, styles.flex]}
          onSubmitEditing={() => {
            store.addSubSkill(skill.id, newSub);
            setNewSub('');
          }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Add sub-skill"
          hitSlop={8}
          onPress={() => {
            store.addSubSkill(skill.id, newSub);
            setNewSub('');
          }}
        >
          <Ionicons name="add-circle" size={26} color={color} />
        </Pressable>
      </View>
      {archivedSubs.length > 0 && (
        <View style={styles.chipRow}>
          <Caption style={styles.hint}>Archived (history kept):</Caption>
          {archivedSubs.map((sub) => (
            <Chip key={sub.id} label={`${sub.name} · restore`} color={color} onPress={() => store.unarchiveSubSkill(skill.id, sub.id)} />
          ))}
        </View>
      )}

      <Eyebrow style={styles.label}>Progress metric</Eyebrow>
      <Caption style={styles.hint}>Something you can measure, logged when you want to. No natural number? Use an overall self-rating.</Caption>
      {primary && metricMode?.kind !== 'redefine' && (
        <MetricRow metric={primary} color={color} onChange={() => setMetricMode({ kind: 'redefine', metricId: primary.id })} onRemove={() => store.archiveMetric(skill.id, primary.id)} />
      )}
      {extras.map((m) => (
        <MetricRow key={m.id} metric={m} color={color} onChange={() => setMetricMode({ kind: 'redefine', metricId: m.id })} onRemove={() => store.archiveMetric(skill.id, m.id)} />
      ))}
      {metricMode ? (
        <>
          {metricMode.kind === 'redefine' && (
            <Caption style={styles.hint}>Changing it starts a new metric — the old one and all its values are kept, archived.</Caption>
          )}
          <MetricForm
            templates={metricTemplates}
            color={color}
            submitLabel={metricMode.kind === 'redefine' ? 'Start new metric' : 'Add'}
            onSubmit={submitMetric}
            onCancel={() => setMetricMode(null)}
          />
        </>
      ) : (
        <View style={styles.chipRow}>
          {!primary && <Chip label="+ Add a metric" color={color} onPress={() => setMetricMode({ kind: 'addPrimary' })} />}
          {primary && extras.length < MAX_EXTRA_METRICS && <Chip label="+ Add an extra metric" color={color} onPress={() => setMetricMode({ kind: 'addExtra' })} />}
        </View>
      )}
      {archivedMetrics > 0 && (
        <Caption style={styles.hint}>
          {archivedMetrics} earlier metric{archivedMetrics === 1 ? '' : 's'} archived — the values are kept.
        </Caption>
      )}

      <Eyebrow style={styles.label}>Weekly practice goal</Eyebrow>
      <Caption style={styles.hint}>A soft target shown as a ring. Missing it changes nothing.</Caption>
      <View style={styles.chipRow}>
        {WEEKLY_GOALS.map((g) => (
          <Chip key={g.label} label={g.label} color={color} active={skill.weeklyGoalMinutes === g.minutes} onPress={() => store.updateSkill(skill.id, { weeklyGoalMinutes: g.minutes })} />
        ))}
      </View>
      <View style={styles.row}>
        <TextInput
          value={customMinutes}
          onChangeText={setCustomMinutes}
          keyboardType="number-pad"
          placeholder="Or minutes per week"
          placeholderTextColor={colors.inkSoft}
          style={[styles.input, styles.flex]}
        />
        <PrimaryButton
          label="Set"
          variant="outline"
          disabled={!(parseNumberInput(customMinutes) > 0)}
          onPress={() => {
            store.updateSkill(skill.id, { weeklyGoalMinutes: Math.round(parseNumberInput(customMinutes)) });
            setCustomMinutes('');
          }}
        />
      </View>

      <Eyebrow style={styles.label}>Resources</Eyebrow>
      {(skill.resources ?? []).map((r) => (
        <View key={r.id} style={styles.listRow}>
          <View style={styles.flex}>
            <Body>{r.name}</Body>
            <Caption style={styles.hint}>{r.type}{r.linkOrNote ? ` · ${r.linkOrNote}` : ''}</Caption>
          </View>
          <Chip label={RESOURCE_STATUS_LABEL[r.status]} color={color} active={r.status === 'done'} onPress={() => store.setResourceStatus(skill.id, r.id, NEXT_STATUS[r.status])} />
          <Pressable accessibilityRole="button" accessibilityLabel="Remove resource" onPress={() => store.deleteResource(skill.id, r.id)} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.inkSoft} />
          </Pressable>
        </View>
      ))}
      <TextInput value={resName} onChangeText={setResName} placeholder="A course, book, tutor, video or app" placeholderTextColor={colors.inkSoft} style={styles.input} />
      <View style={styles.chipRow}>
        {RESOURCE_TYPES.map((t) => (
          <Chip key={t} label={t} color={color} active={resType === t} onPress={() => setResType(t)} />
        ))}
      </View>
      <View style={styles.row}>
        <TextInput value={resNote} onChangeText={setResNote} placeholder="Link or note (optional)" placeholderTextColor={colors.inkSoft} style={[styles.input, styles.flex]} />
        <PrimaryButton
          label="Add"
          variant="outline"
          disabled={!resName.trim()}
          onPress={() => {
            store.addResource(skill.id, resName, resType, resNote);
            setResName('');
            setResNote('');
          }}
        />
      </View>

      <PrimaryButton label="Done" onPress={close} style={styles.done} />
    </SheetModal>
  );
}

const styles = themedStyles(() => ({
  label: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  hint: {
    color: colors.inkSoft,
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipTextActive: {
    color: colors.white,
  },
  input: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  metricForm: {
    gap: spacing.xs,
  },
  done: {
    marginTop: spacing.xl,
  },
}));
