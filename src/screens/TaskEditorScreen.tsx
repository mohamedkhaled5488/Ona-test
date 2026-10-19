// The full task page (Daily Planning v2). Opened by "+", by tapping a task,
// or from quick-add's "More details". Essentials first; "More options" holds
// the rest and stays as the user last left it.
//
// Everything is edited on a working copy (utils/taskForm.ts) and saved in
// one go, so leaving with changes can always ask Save / Discard / Keep editing.
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { TextInput } from '../components/TextInput';
import { SheetModal } from '../components/SheetModal';
import { TimePickerModal } from '../components/TimePickerModal';
import { MonthCalendar } from '../components/MonthCalendar';
import { PlanStepPicker } from '../components/PlanStepPicker';
import { TagPicker } from '../components/TagPicker';
import { JournalPageSurface } from '../components/JournalPageSurface';
import { SettingSwitch } from '../components/SettingSwitch';
import { PrimaryButton } from '../components/PrimaryButton';
import { useUi } from '../components/UiProvider';
import { Body, Caption, Eyebrow, SectionHeading } from '../components/Typography';
import { useBackHandler } from '../hooks/useBackHandler';
import { useDailyPlanningStore, findTask, resolveTaskTitle, resolveTaskDone, visibleStarterTemplates, type EditScope } from '../store/useDailyPlanningStore';
import { usePlanStore, selectStepAtPath } from '../store/usePlanStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { alarmSoundOptions, alarmSoundLabel } from '../data/alarmSounds';
import { playAlarmPreview } from '../utils/alarmPreview';
import { addDaysISO, formatClockTime, formatDisplayDate, rotateWeekdays, todayISO } from '../utils/date';
import { REPEAT_LABELS, allSubtasksDone } from '../utils/taskRepeat';
import {
  CONTEXT_SUGGESTIONS,
  DURATION_PRESETS,
  ESTIMATE_PRESETS,
  REMINDER_PRESETS,
  applyTemplate,
  durationBetween,
  emptyForm,
  endTimeOf,
  formFromTask,
  formToPatch,
  formatMinutes,
  hasErrors,
  isDirty,
  moveItem,
  normalizeLink,
  reminderText,
  templateFieldsFromForm,
  validateForm,
  type FormErrors,
  type TaskForm,
} from '../utils/taskForm';
import { genId } from '../utils/id';
import { withAlpha } from '../utils/color';
import { colors, fonts, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import type { RootStackParamList } from '../navigation/types';
import type { AlarmSoundId, TaskEnergy, TaskPriority, TaskRepeat, TaskTemplate } from '../types/sections';
import { onlyDigits } from '../utils/numberInput';

type Props = NativeStackScreenProps<RootStackParamList, 'taskEditor'>;

const PRIORITIES: { id: TaskPriority; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];
const ENERGIES: { id: TaskEnergy; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'low', label: 'Low', icon: 'battery-dead-outline' },
  { id: 'medium', label: 'Medium', icon: 'battery-half-outline' },
  { id: 'high', label: 'High', icon: 'battery-full-outline' },
];
const REPEATS: TaskRepeat[] = ['none', 'daily', 'weekdays', 'weekly', 'customDays', 'monthly'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NOTE_LINE = 26;

// A small selectable chip, the one building block of this page.
function Chip({
  label,
  active,
  onPress,
  icon,
  a11yLabel,
  role = 'button',
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  a11yLabel?: string;
  role?: 'button' | 'radio' | 'checkbox';
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === 'button' ? undefined : role === 'radio' ? { selected: !!active } : { checked: !!active }}
      accessibilityLabel={a11yLabel ?? label}
      hitSlop={4}
      style={[styles.chip, active && styles.chipActive]}
    >
      {icon && <Ionicons name={icon} size={14} color={active ? colors.white : colors.inkSoft} />}
      <Caption style={active ? styles.chipTextActive : undefined}>{label}</Caption>
    </Pressable>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Eyebrow accessibilityRole="header">{title}</Eyebrow>
      {hint && <Caption style={styles.hint}>{hint}</Caption>}
      {children}
    </View>
  );
}

export function TaskEditorScreen({ route, navigation }: Props) {
  const { taskId, date } = route.params;
  const { showDialog, showToast } = useUi();
  const store = useDailyPlanningStore;
  // The task as it was when the page opened (edits only land on Save).
  const [original] = useState(() => (taskId ? findTask(store.getState().tasks, taskId) : undefined));
  const stillExists = useDailyPlanningStore((s) => (taskId ? s.tasks.some((t) => t.id === taskId) : true));
  const repeating = !!original && original.repeat !== 'none';
  // The day this page edits: a one-off's own date, or the opened day of a series.
  const occurrence = original ? (repeating ? date : original.date) : date;

  const initial = useMemo<TaskForm>(
    () =>
      original
        ? { ...formFromTask(original, resolveTaskTitle(original)), date: occurrence }
        : { ...emptyForm(date, route.params.title ?? ''), estimateMinutes: useSettingsStore.getState().dailyDefaultEstimate ?? undefined },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [form, setForm] = useState<TaskForm>(initial);
  const update = (patch: Partial<TaskForm>) => setForm((f) => ({ ...f, ...patch }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [fromTemplateId, setFromTemplateId] = useState<string | undefined>(undefined);
  const [markDone, setMarkDone] = useState(false);
  const [closing, setClosing] = useState(false);

  const moreOpen = useSettingsStore((s) => s.taskPageMoreOpen);
  const setSetting = useSettingsStore((s) => s.set);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const plans = usePlanStore((s) => s.plans);
  const taskTemplates = useDailyPlanningStore((s) => s.taskTemplates);
  const hiddenStarters = useDailyPlanningStore((s) => s.hiddenStarterTemplates);
  const tags = useDailyPlanningStore((s) => s.tags);

  const [dateSheet, setDateSheet] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(form.date);
  const [timeTarget, setTimeTarget] = useState<'start' | 'end' | null>(null);
  const [addingReminder, setAddingReminder] = useState(false);
  const [soundFor, setSoundFor] = useState<string | null>(null);
  const [newSubtask, setNewSubtask] = useState('');
  const [customEstimate, setCustomEstimate] = useState(
    form.estimateMinutes && !ESTIMATE_PRESETS.includes(form.estimateMinutes) ? String(form.estimateMinutes) : ''
  );
  const [showCustomEstimate, setShowCustomEstimate] = useState(!!customEstimate);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | undefined>(undefined);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [stepPicker, setStepPicker] = useState(false);
  const [noteWidth, setNoteWidth] = useState(0);
  const [noteHeight, setNoteHeight] = useState(0);

  const dirty = !closing && (isDirty(form, initial) || markDone);

  // Leave once the "unsaved changes" guard has seen dirty = false.
  useEffect(() => {
    if (closing) navigation.goBack();
  }, [closing, navigation]);

  const commit = (scope: EditScope = 'all'): boolean => {
    const e = validateForm(form);
    setErrors(e);
    if (hasErrors(e)) return false;
    const s = store.getState();
    const patch = formToPatch(form);
    let id: string | undefined;
    let day = form.date;
    if (!original) {
      id = s.addTask(form.date, form.title, { ...patch, fromTemplateId });
    } else {
      id = s.updateTask(original.id, patch, scope, occurrence);
      const saved = findTask(store.getState().tasks, id);
      day = saved && saved.repeat === 'none' ? saved.date : form.date;
    }
    if (markDone && id) {
      const saved = findTask(store.getState().tasks, id);
      if (saved && !resolveTaskDone(saved, day)) s.toggleTask(id, day);
    }
    setClosing(true);
    return true;
  };

  // A repeating task asks which days the changes are for.
  const save = (): boolean => {
    const e = validateForm(form);
    setErrors(e);
    if (hasErrors(e)) return false;
    if (!original || !repeating || !dirty) return commit();
    const ruleChanged = form.repeat !== initial.repeat || form.repeatDays.join() !== initial.repeatDays.join();
    showDialog({
      title: 'This task repeats',
      message: ruleChanged ? 'The new repeat starts from this day. Earlier days stay as they were.' : 'Which days should these changes apply to?',
      actions: [
        { label: 'Keep editing', style: 'cancel' },
        ...(ruleChanged ? [] : [{ label: 'Only this day', onPress: () => void commit('this') }]),
        { label: ruleChanged ? 'Apply' : 'This and later days', style: 'default' as const, onPress: () => void commit('future') },
      ],
    });
    return false;
  };

  useBackHandler({ dirty, onSave: save });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => save()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Save task">
          <Body style={styles.headerSave}>Save</Body>
        </Pressable>
      ),
    });
  });

  const confirmDelete = () => {
    if (!original) return;
    const previous = store.getState().tasks;
    const restore = () => store.getState().restoreTasks(previous);
    const done = (message: string) => {
      setClosing(true);
      showToast({ message, actionLabel: 'Undo', onAction: restore });
    };
    if (!repeating) {
      showDialog({
        title: 'Delete this task?',
        message: `"${form.title || 'This task'}" will be removed from your plan.`,
        actions: [
          { label: 'Keep it', style: 'cancel' },
          {
            label: 'Delete',
            style: 'destructive',
            onPress: () => {
              store.getState().deleteTask(original.id);
              done('Task deleted');
            },
          },
        ],
      });
      return;
    }
    showDialog({
      title: 'Delete a repeating task?',
      message: `"${form.title || 'This task'}" repeats. Earlier days and their history are kept either way.`,
      actions: [
        { label: 'Keep it', style: 'cancel' },
        {
          label: 'Only this day',
          onPress: () => {
            store.getState().deleteOccurrence(original.id, occurrence, 'this');
            done('Removed from this day');
          },
        },
        {
          label: 'This and later days',
          style: 'destructive',
          onPress: () => {
            store.getState().deleteOccurrence(original.id, occurrence, 'future');
            done('Task deleted from this day on');
          },
        },
      ],
    });
  };

  const chooseTemplate = (tpl: TaskTemplate) => {
    setForm((f) => applyTemplate(f, tpl, tags.map((t) => t.id), genId));
    setFromTemplateId(tpl.id);
  };

  const pickPhoto = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast({ message: 'Ona needs access to your photos to attach one.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setForm((f) => ({ ...f, attachments: [...f.attachments, { id: genId('attachment'), kind: 'photo', uri }] }));
      }
    } catch {
      showToast({ message: "Couldn't open your photos on this device." });
    }
  };

  const addLink = () => {
    const uri = normalizeLink(linkDraft ?? '');
    if (!uri) {
      setLinkError("That doesn't look like a web address.");
      return;
    }
    update({ attachments: [...form.attachments, { id: genId('attachment'), kind: 'link', uri }] });
    setLinkDraft(null);
    setLinkError(undefined);
  };

  if (taskId && (!original || !stillExists) && !closing) {
    return (
      <Screen>
        <Body>This task no longer exists.</Body>
        <PrimaryButton label="Back" variant="outline" style={styles.topGap} onPress={() => setClosing(true)} />
      </Screen>
    );
  }

  const linkedPlan = form.linkedPlan ? plans.find((p) => p.id === form.linkedPlan!.planId) : undefined;
  const linkedStep = linkedPlan && form.linkedPlan ? selectStepAtPath(linkedPlan.steps, form.linkedPlan.path) : undefined;
  const timed = !form.allDay && !!form.scheduledTime;
  const endTime = endTimeOf(form.scheduledTime, form.durationMinutes);
  const templates = [...taskTemplates, ...visibleStarterTemplates(hiddenStarters)];
  const weekdayOrder = rotateWeekdays([0, 1, 2, 3, 4, 5, 6], weekStartsOn);
  const alreadyDone = original ? resolveTaskDone(original, occurrence) : false;
  const offerComplete = allSubtasksDone(form) && !alreadyDone;
  // How many "More options" fields hold something, shown while it's closed.
  const moreCount = [form.energy, form.estimateMinutes, form.context.trim(), form.why.trim(), form.attachments.length || undefined].filter(Boolean).length;

  return (
    <Screen>
      {!original && templates.length > 0 && (
        <View style={styles.templates}>
          <Caption>Start from a template</Caption>
          <View style={styles.chipRow}>
            {templates.map((tpl) => (
              <Chip key={tpl.id} label={tpl.name} icon="copy-outline" active={fromTemplateId === tpl.id} onPress={() => chooseTemplate(tpl)} a11yLabel={`Use template ${tpl.name}`} />
            ))}
          </View>
        </View>
      )}

      <Card style={styles.card}>
        <TextInput
          value={form.title}
          onChangeText={(title) => {
            update({ title });
            if (errors.title && title.trim()) setErrors((e) => ({ ...e, title: undefined }));
          }}
          placeholder="What do you want to do?"
          placeholderTextColor={colors.inkSoft}
          style={styles.titleInput}
          autoFocus={!original && !route.params.title}
          multiline
          blurOnSubmit
          returnKeyType="done"
          accessibilityLabel="Task title"
        />
        {errors.title && (
          <Caption style={styles.error} accessibilityLiveRegion="polite">
            {errors.title}
          </Caption>
        )}
        {form.linkedPlan && (
          <View style={styles.linkChip}>
            <Ionicons name="link-outline" size={14} color={colors.teal} />
            <Caption style={styles.linkText} numberOfLines={2}>
              {linkedPlan ? `${linkedPlan.title} › ${linkedStep?.title ?? 'deleted step'}` : 'Linked plan was deleted'}
            </Caption>
            <Pressable
              hitSlop={8}
              onPress={() => update({ linkedPlan: undefined })}
              accessibilityRole="button"
              accessibilityLabel="Unlink from Plan Builder"
            >
              <Caption style={styles.linkAction}>Unlink</Caption>
            </Pressable>
          </View>
        )}
        {form.linkedPlan && <Caption style={styles.hint}>The title and done state stay in step with Plan Builder.</Caption>}
      </Card>

      <Card style={styles.card}>
        <Section title="When">
          <View style={styles.chipRow}>
            <Chip
              label={form.date === todayISO() ? 'Today' : formatDisplayDate(form.date)}
              icon="calendar-outline"
              active
              onPress={() => {
                setCalendarMonth(form.date);
                setDateSheet(true);
              }}
              a11yLabel={`Date: ${formatDisplayDate(form.date)}. Change date`}
            />
          </View>
          {repeating && <Caption style={styles.hint}>This is the day you opened. The task repeats {REPEAT_LABELS[form.repeat].toLowerCase()}.</Caption>}
          <SettingSwitch label="All day" value={form.allDay} onValueChange={(allDay) => update({ allDay })} accent={colors.teal} />
          {!form.allDay && (
            <>
              <View style={styles.chipRow}>
                <Chip
                  label={form.scheduledTime ? `Starts ${formatClockTime(form.scheduledTime)}` : 'Add a start time'}
                  icon="time-outline"
                  active={!!form.scheduledTime}
                  onPress={() => setTimeTarget('start')}
                />
                {form.scheduledTime && (
                  <Chip label={endTime ? `Ends ${formatClockTime(endTime)}` : 'Add an end time'} icon="flag-outline" active={!!endTime} onPress={() => setTimeTarget('end')} />
                )}
              </View>
              {form.scheduledTime && (
                <View style={styles.chipRow}>
                  {DURATION_PRESETS.map((m) => (
                    <Chip
                      key={m}
                      role="radio"
                      label={formatMinutes(m)}
                      active={form.durationMinutes === m}
                      onPress={() => update({ durationMinutes: form.durationMinutes === m ? undefined : m })}
                      a11yLabel={`Lasts ${formatMinutes(m)}`}
                    />
                  ))}
                </View>
              )}
              {form.durationMinutes && endTime && endTime < (form.scheduledTime ?? '') && <Caption style={styles.hint}>Ends the next day.</Caption>}
            </>
          )}
        </Section>

        <Section title="Repeat">
          {form.linkedPlan ? (
            <Caption style={styles.hint}>Tasks linked to Plan Builder happen once.</Caption>
          ) : (
            <>
              <View style={styles.chipRow}>
                {REPEATS.map((r) => (
                  <Chip key={r} role="radio" label={REPEAT_LABELS[r]} active={form.repeat === r} onPress={() => update({ repeat: r })} />
                ))}
              </View>
              {form.repeat === 'customDays' && (
                <View style={styles.chipRow}>
                  {weekdayOrder.map((d) => (
                    <Chip
                      key={d}
                      role="checkbox"
                      label={DAY_NAMES[d].slice(0, 3)}
                      a11yLabel={DAY_NAMES[d]}
                      active={form.repeatDays.includes(d)}
                      onPress={() => {
                        update({ repeatDays: form.repeatDays.includes(d) ? form.repeatDays.filter((x) => x !== d) : [...form.repeatDays, d] });
                        setErrors((e) => ({ ...e, repeatDays: undefined }));
                      }}
                    />
                  ))}
                </View>
              )}
              {errors.repeatDays && <Caption style={styles.error}>{errors.repeatDays}</Caption>}
              {form.repeat === 'monthly' && Number(form.date.slice(8)) > 28 && (
                <Caption style={styles.hint}>On day {Number(form.date.slice(8))} of each month, or the last day in shorter months.</Caption>
              )}
            </>
          )}
        </Section>

        <Section title="Reminders" hint={timed ? undefined : form.allDay ? 'All-day tasks have no reminders.' : 'Add a start time to set a reminder.'}>
          {timed &&
            form.reminders.map((r) => (
              <View key={r.id} style={styles.reminderBlock}>
                <View style={styles.reminderRow}>
                  <Ionicons name="alarm-outline" size={16} color={colors.teal} />
                  <Body style={styles.flex}>{reminderText(r.minutesBefore)}</Body>
                  <Pressable onPress={() => setSoundFor(soundFor === r.id ? null : r.id)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Sound: ${alarmSoundLabel(r.sound)}. Change sound`}>
                    <Caption style={styles.linkAction}>{alarmSoundLabel(r.sound)}</Caption>
                  </Pressable>
                  <Pressable onPress={() => update({ reminders: form.reminders.filter((x) => x.id !== r.id) })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove reminder ${reminderText(r.minutesBefore)}`}>
                    <Ionicons name="close" size={18} color={colors.inkSoft} />
                  </Pressable>
                </View>
                {soundFor === r.id && (
                  <View style={styles.chipRow}>
                    {alarmSoundOptions.map((opt) => (
                      <Chip
                        key={opt.id}
                        role="radio"
                        label={opt.label}
                        icon="musical-note-outline"
                        active={(r.sound ?? 'default') === opt.id}
                        onPress={() => {
                          update({ reminders: form.reminders.map((x) => (x.id === r.id ? { ...x, sound: opt.id as AlarmSoundId } : x)) });
                          playAlarmPreview(opt.id);
                        }}
                      />
                    ))}
                  </View>
                )}
              </View>
            ))}
          {timed && !addingReminder && (
            <Pressable style={styles.addRow} onPress={() => setAddingReminder(true)} accessibilityRole="button">
              <Ionicons name="add" size={16} color={colors.teal} />
              <Caption style={styles.linkAction}>{form.reminders.length ? 'Add another reminder' : 'Add a reminder'}</Caption>
            </Pressable>
          )}
          {timed && addingReminder && (
            <View style={styles.chipRow}>
              {REMINDER_PRESETS.filter((m) => !form.reminders.some((r) => r.minutesBefore === m)).map((m) => (
                <Chip
                  key={m}
                  label={reminderText(m)}
                  onPress={() => {
                    update({ reminders: [...form.reminders, { id: genId('reminder'), minutesBefore: m }].sort((a, b) => b.minutesBefore - a.minutesBefore) });
                    setAddingReminder(false);
                  }}
                />
              ))}
              <Chip label="Cancel" onPress={() => setAddingReminder(false)} />
            </View>
          )}
        </Section>
      </Card>

      <Card style={styles.card}>
        <Section title="Tags">
          <TagPicker value={form.tagIds} onChange={(tagIds) => update({ tagIds })} />
        </Section>

        <Section title="Priority">
          <View style={styles.chipRow}>
            {PRIORITIES.map((p) => (
              <Chip
                key={p.id}
                role="radio"
                label={p.label}
                icon={p.id === 'none' ? undefined : 'flag-outline'}
                active={form.priority === p.id}
                onPress={() => update({ priority: p.id })}
                a11yLabel={`Priority ${p.label}`}
              />
            ))}
          </View>
        </Section>

        <Section title="Subtasks">
          {form.subtasks.map((sub, i) => (
            <View key={sub.id} style={styles.subtaskRow}>
              <Pressable
                hitSlop={8}
                onPress={() => update({ subtasks: form.subtasks.map((x) => (x.id === sub.id ? { ...x, done: !x.done } : x)) })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sub.done }}
                accessibilityLabel={sub.title || 'Subtask'}
              >
                <Ionicons name={sub.done ? 'checkbox' : 'square-outline'} size={22} color={sub.done ? colors.teal : colors.inkSoft} />
              </Pressable>
              <TextInput
                value={sub.title}
                onChangeText={(title) => update({ subtasks: form.subtasks.map((x) => (x.id === sub.id ? { ...x, title } : x)) })}
                style={[styles.subtaskInput, sub.done && styles.done]}
                accessibilityLabel={`Subtask ${i + 1}`}
              />
              <Pressable hitSlop={6} disabled={i === 0} onPress={() => update({ subtasks: moveItem(form.subtasks, i, i - 1) })} accessibilityRole="button" accessibilityLabel={`Move "${sub.title}" up`}>
                <Ionicons name="chevron-up" size={18} color={i === 0 ? colors.line : colors.inkSoft} />
              </Pressable>
              <Pressable
                hitSlop={6}
                disabled={i === form.subtasks.length - 1}
                onPress={() => update({ subtasks: moveItem(form.subtasks, i, i + 1) })}
                accessibilityRole="button"
                accessibilityLabel={`Move "${sub.title}" down`}
              >
                <Ionicons name="chevron-down" size={18} color={i === form.subtasks.length - 1 ? colors.line : colors.inkSoft} />
              </Pressable>
              <Pressable hitSlop={8} onPress={() => update({ subtasks: form.subtasks.filter((x) => x.id !== sub.id) })} accessibilityRole="button" accessibilityLabel={`Remove subtask "${sub.title}"`}>
                <Ionicons name="close" size={18} color={colors.inkSoft} />
              </Pressable>
            </View>
          ))}
          <TextInput
            value={newSubtask}
            onChangeText={setNewSubtask}
            placeholder="Add a subtask..."
            placeholderTextColor={colors.inkSoft}
            style={styles.addInput}
            returnKeyType="done"
            blurOnSubmit={false}
            onSubmitEditing={() => {
              if (!newSubtask.trim()) return;
              update({ subtasks: [...form.subtasks, { id: genId('subtask'), title: newSubtask.trim(), done: false }] });
              setNewSubtask('');
            }}
            accessibilityLabel="New subtask"
          />
          {offerComplete && (
            <View style={styles.offer}>
              <Caption style={styles.flex}>{markDone ? 'The task will be marked done when you save.' : 'All subtasks are done. Mark the task done too?'}</Caption>
              <Pressable onPress={() => setMarkDone((v) => !v)} hitSlop={6} accessibilityRole="button">
                <Caption style={styles.linkAction}>{markDone ? 'Undo' : 'Mark done'}</Caption>
              </Pressable>
            </View>
          )}
        </Section>

        <Section title="Notes">
          <View
            style={styles.notePage}
            onLayout={(e) => {
              setNoteWidth(e.nativeEvent.layout.width);
              setNoteHeight(e.nativeEvent.layout.height);
            }}
          >
            <JournalPageSurface template="lined" width={noteWidth} height={noteHeight} lineHeight={NOTE_LINE} color={withAlpha(colors.inkSoft, 0.35)} />
            <TextInput
              value={form.notes}
              onChangeText={(notes) => update({ notes })}
              placeholder="Anything to remember..."
              placeholderTextColor={colors.inkSoft}
              style={styles.noteInput}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Notes"
            />
          </View>
        </Section>
      </Card>

      <Pressable
        style={styles.moreToggle}
        onPress={() => setSetting('taskPageMoreOpen', !moreOpen)}
        accessibilityRole="button"
        accessibilityState={{ expanded: moreOpen }}
      >
        <Body style={styles.moreText}>More options{!moreOpen && moreCount ? ` (${moreCount} set)` : ''}</Body>
        <Ionicons name={moreOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.teal} />
      </Pressable>

      {moreOpen && (
        <Card style={styles.card}>
          <Section title="Energy needed" hint="When will I have the energy for this?">
            <View style={styles.chipRow}>
              {ENERGIES.map((en) => (
                <Chip
                  key={en.id}
                  role="radio"
                  label={en.label}
                  icon={en.icon}
                  active={form.energy === en.id}
                  onPress={() => update({ energy: form.energy === en.id ? undefined : en.id })}
                  a11yLabel={`Energy ${en.label}`}
                />
              ))}
            </View>
          </Section>

          <Section title="Estimated time">
            <View style={styles.chipRow}>
              {ESTIMATE_PRESETS.map((m) => (
                <Chip
                  key={m}
                  role="radio"
                  label={formatMinutes(m)}
                  active={!showCustomEstimate && form.estimateMinutes === m}
                  onPress={() => {
                    setShowCustomEstimate(false);
                    update({ estimateMinutes: form.estimateMinutes === m ? undefined : m });
                  }}
                />
              ))}
              <Chip label="Custom" role="radio" active={showCustomEstimate} onPress={() => setShowCustomEstimate(true)} />
            </View>
            {showCustomEstimate && (
              <View style={styles.inlineField}>
                <TextInput
                  value={customEstimate}
                  onChangeText={(v) => {
                    const digits = onlyDigits(v).slice(0, 4);
                    setCustomEstimate(digits);
                    update({ estimateMinutes: Number(digits) > 0 ? Number(digits) : undefined });
                  }}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.inkSoft}
                  style={styles.numberInput}
                  accessibilityLabel="Estimated minutes"
                />
                <Caption>minutes</Caption>
              </View>
            )}
          </Section>

          {!form.linkedPlan && (
            <Section title="Plan Builder">
              <Pressable style={styles.addRow} onPress={() => setStepPicker(true)} accessibilityRole="button">
                <Ionicons name="link-outline" size={16} color={colors.teal} />
                <Caption style={styles.linkAction}>Link to a Plan Builder step</Caption>
              </Pressable>
              <Caption style={styles.hint}>A linked task takes the step's title, and ticking either one ticks both.</Caption>
            </Section>
          )}

          <Section title="Where or how">
            <TextInput
              value={form.context}
              onChangeText={(context) => update({ context })}
              placeholder="At home, phone call..."
              placeholderTextColor={colors.inkSoft}
              style={styles.lineInput}
              accessibilityLabel="Where or how"
            />
            <View style={styles.chipRow}>
              {CONTEXT_SUGGESTIONS.filter((c) => c !== form.context).map((c) => (
                <Chip key={c} label={c} onPress={() => update({ context: c })} />
              ))}
            </View>
          </Section>

          <Section title="Why this matters">
            <TextInput
              value={form.why}
              onChangeText={(why) => update({ why })}
              placeholder="One line, just for you"
              placeholderTextColor={colors.inkSoft}
              style={styles.lineInput}
              maxLength={140}
              accessibilityLabel="Why this matters"
            />
          </Section>

          <Section title="Attachments" hint="Photos stay on this phone.">
            {form.attachments.map((a) => (
              <View key={a.id} style={styles.attachmentRow}>
                {a.kind === 'photo' ? (
                  <Image source={{ uri: a.uri }} style={styles.thumb} accessibilityLabel="Attached photo" />
                ) : (
                  <Pressable style={styles.flex} onPress={() => void Linking.openURL(a.uri).catch(() => {})} accessibilityRole="link">
                    <Caption style={styles.linkAction} numberOfLines={1}>
                      {a.uri.replace(/^https?:\/\//, '')}
                    </Caption>
                  </Pressable>
                )}
                {a.kind === 'photo' && <View style={styles.flex} />}
                <Pressable
                  hitSlop={8}
                  onPress={() => update({ attachments: form.attachments.filter((x) => x.id !== a.id) })}
                  accessibilityRole="button"
                  accessibilityLabel={a.kind === 'photo' ? 'Remove photo' : `Remove link ${a.uri}`}
                >
                  <Ionicons name="close" size={18} color={colors.inkSoft} />
                </Pressable>
              </View>
            ))}
            {linkDraft !== null && (
              <View style={styles.inlineField}>
                <TextInput
                  value={linkDraft}
                  onChangeText={(v) => {
                    setLinkDraft(v);
                    setLinkError(undefined);
                  }}
                  placeholder="example.com/article"
                  placeholderTextColor={colors.inkSoft}
                  style={[styles.lineInput, styles.flex]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  autoFocus
                  onSubmitEditing={addLink}
                  accessibilityLabel="Link address"
                />
                <Pressable onPress={addLink} hitSlop={6} accessibilityRole="button">
                  <Caption style={styles.linkAction}>Add</Caption>
                </Pressable>
              </View>
            )}
            {linkError && <Caption style={styles.error}>{linkError}</Caption>}
            <View style={styles.chipRow}>
              <Chip label="Add a photo" icon="image-outline" onPress={() => void pickPhoto()} />
              {linkDraft === null && <Chip label="Add a link" icon="link-outline" onPress={() => setLinkDraft('')} />}
            </View>
          </Section>

          <Section title="Template">
            {templateName === null ? (
              <Pressable style={styles.addRow} onPress={() => setTemplateName(form.title.trim())} accessibilityRole="button">
                <Ionicons name="copy-outline" size={16} color={colors.teal} />
                <Caption style={styles.linkAction}>Save as a template</Caption>
              </Pressable>
            ) : (
              <View style={styles.inlineField}>
                <TextInput
                  value={templateName}
                  onChangeText={setTemplateName}
                  placeholder="Template name"
                  placeholderTextColor={colors.inkSoft}
                  style={[styles.lineInput, styles.flex]}
                  autoFocus
                  accessibilityLabel="Template name"
                />
                <Pressable
                  hitSlop={6}
                  accessibilityRole="button"
                  onPress={() => {
                    if (!form.title.trim()) {
                      setErrors((e) => ({ ...e, title: 'Give the task a title first.' }));
                      return;
                    }
                    store.getState().addTaskTemplate(templateName, templateFieldsFromForm(form));
                    setTemplateName(null);
                    showToast({ message: 'Saved as a template' });
                  }}
                >
                  <Caption style={styles.linkAction}>Save</Caption>
                </Pressable>
              </View>
            )}
          </Section>
        </Card>
      )}

      <PrimaryButton label={original ? 'Save changes' : 'Add task'} style={styles.topGap} onPress={() => save()} />
      {original && (
        <Pressable style={styles.deleteRow} onPress={confirmDelete} accessibilityRole="button">
          <Ionicons name="trash-outline" size={16} color={colors.inkSoft} />
          <Caption>Delete task</Caption>
        </Pressable>
      )}

      <SheetModal visible={dateSheet} onClose={() => setDateSheet(false)}>
        <SectionHeading>{repeating ? 'Move this day' : 'Date'}</SectionHeading>
        <View style={styles.chipRow}>
          {[
            { label: 'Today', d: todayISO() },
            { label: 'Tomorrow', d: addDaysISO(todayISO(), 1) },
            { label: 'Next week', d: addDaysISO(todayISO(), 7) },
          ].map((q) => (
            <Chip
              key={q.label}
              role="radio"
              label={q.label}
              active={form.date === q.d}
              onPress={() => {
                update({ date: q.d });
                setDateSheet(false);
              }}
            />
          ))}
        </View>
        <MonthCalendar
          accent={colors.teal}
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
          disableFuture={false}
          getDayColor={(d) => (d === form.date ? colors.teal : undefined)}
          onDayPress={(d) => {
            update({ date: d });
            setDateSheet(false);
          }}
        />
      </SheetModal>

      <TimePickerModal
        visible={timeTarget !== null}
        title={timeTarget === 'end' ? 'End time' : 'Start time'}
        value={timeTarget === 'end' ? endTime ?? form.scheduledTime : form.scheduledTime}
        onClose={() => setTimeTarget(null)}
        onPick={(time) => {
          if (timeTarget === 'start') {
            // A new task's first start time brings the default reminder (Settings → Daily Planning).
            const lead = useSettingsStore.getState().dailyDefaultReminder;
            const addDefault = !original && time && !form.scheduledTime && form.reminders.length === 0 && lead !== null;
            update({
              scheduledTime: time,
              ...(time ? {} : { durationMinutes: undefined }),
              ...(addDefault ? { reminders: [{ id: genId('reminder'), minutesBefore: lead }] } : {}),
            });
          }
          else if (form.scheduledTime) update({ durationMinutes: time ? durationBetween(form.scheduledTime, time) : undefined });
        }}
      />

      <PlanStepPicker
        visible={stepPicker}
        title="Link to a step"
        onClose={() => setStepPicker(false)}
        onPick={(planId, path) => {
          const plan = plans.find((p) => p.id === planId);
          const step = plan ? selectStepAtPath(plan.steps, path) : undefined;
          update({
            linkedPlan: { planId, path },
            title: step?.title ?? form.title,
            repeat: 'none',
            why: form.why.trim() ? form.why : plan?.motive ?? '',
          });
        }}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  card: { gap: spacing.md, marginBottom: spacing.md },
  section: { gap: spacing.sm },
  hint: { color: colors.inkSoft },
  error: { color: colors.amber },
  flex: { flex: 1 },
  topGap: { marginTop: spacing.md },
  headerSave: { color: colors.teal, fontFamily: fonts.bodyMedium, paddingHorizontal: spacing.sm },
  templates: { gap: spacing.xs, marginBottom: spacing.md },
  titleInput: { fontFamily: fonts.headingMedium, fontSize: 20, lineHeight: 26, color: colors.ink, padding: 0, minHeight: 32 },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: withAlpha(colors.teal, 0.1),
  },
  linkText: { flex: 1, color: colors.teal },
  linkAction: { color: colors.teal, fontFamily: fonts.bodyMedium },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: 34,
  },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipTextActive: { color: colors.white },
  reminderBlock: { gap: spacing.xs },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 36 },
  subtaskRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40 },
  subtaskInput: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.ink, paddingVertical: 4 },
  done: { textDecorationLine: 'line-through', color: colors.inkSoft },
  addInput: { fontFamily: fonts.body, fontSize: 16, color: colors.ink, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.line },
  offer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.stone },
  notePage: { minHeight: NOTE_LINE * 5 + 8, borderRadius: radii.md, backgroundColor: colors.stone, paddingHorizontal: spacing.sm, paddingTop: 4 },
  noteInput: { fontFamily: fonts.body, fontSize: 16, lineHeight: NOTE_LINE, color: colors.ink, minHeight: NOTE_LINE * 5, padding: 0 },
  moreToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, marginBottom: spacing.md, minHeight: 44 },
  moreText: { color: colors.teal, fontFamily: fonts.bodyMedium },
  inlineField: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  numberInput: { fontFamily: fonts.body, fontSize: 16, color: colors.ink, minWidth: 64, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
  lineInput: { fontFamily: fonts.body, fontSize: 16, color: colors.ink, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.line },
  attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40 },
  thumb: { width: 56, height: 56, borderRadius: radii.sm },
  deleteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.md, minHeight: 44 },
}));
