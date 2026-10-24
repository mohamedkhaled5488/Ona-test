import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import { useBackHandler } from '../hooks/useBackHandler';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { SheetModal } from '../components/SheetModal';
import { TimePickerModal, TimeColumns, parseTimeSlot, formatTimeSlot } from '../components/TimePickerModal';
import { MonthCalendar } from '../components/MonthCalendar';
import { PlanStepPicker } from '../components/PlanStepPicker';
import { TagChip } from '../components/TagPicker';
import { REPEAT_LABELS, allSubtasksDone } from '../utils/taskRepeat';
import { useUi } from '../components/UiProvider';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing, radii, fonts } from '../theme';
import { withAlpha } from '../utils/color';
import { useDailyPlanningStore, resolveTaskDone, resolveTaskTitle, taskAppliesToDate } from '../store/useDailyPlanningStore';
import { SwipeRow } from '../components/SwipeRow';
import { CarryOverCard, PlanMyDayCard, SearchResults, ViewOptionsSheet } from './dailyPlanning/DayViewParts';
import {
  DEFAULT_DAY_VIEW,
  applyFilters,
  carryOver,
  dayLoad,
  dropIndex,
  filtersActive,
  groupTasks,
  searchTasks,
  sortForDay,
  sortTasks,
} from '../utils/dayView';
import { usePlanStore, selectStepAtPath, flattenSteps } from '../store/usePlanStore';
import { alarmSoundOptions, alarmSoundLabel } from '../data/alarmSounds';
import { ReminderSoundPicker } from '../components/ReminderSoundPicker';
import { PHONE_CLOCK_NOTE } from '../config/reminderWording';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { weekStartFor } from '../utils/feelingsStats';
import { successFeedback, tapFeedback } from '../utils/haptics';
import { genId } from '../utils/id';
import { SettingSwitch } from '../components/SettingSwitch';
import { findFeeling, zoneMeta } from '../data/feelingsWheel';
import type { RootStackParamList } from '../navigation/types';
import { addDaysISO, formatDisplayDate, todayISO, formatClockTime } from '../utils/date';
import type { DailyTask, FeelingZone, TaskDifficulty, TaskEvaluation, TaskRepeat } from '../types/sections';
import { TaskFeelingSheet, DIFFICULTY } from './dailyPlanning/TaskFeelingSheet';
import { linkedEntry, shouldAskFeeling, type FeelingPhase } from '../utils/taskFeelings';
import { themedStyles } from '../theme/runtime';

const evaluationMeta: Record<TaskEvaluation, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  well: { label: 'Went well', icon: 'happy-outline', color: '#4F9B82' },
  okay: { label: 'Okay', icon: 'remove-circle-outline', color: '#C99A3D' },
  hard: { label: 'Was hard', icon: 'sad-outline', color: '#C97B5A' },
};

const reminderOptions: { label: string; minutes: number | undefined }[] = [
  { label: 'None', minutes: undefined },
  { label: 'At time', minutes: 0 },
  { label: '10 min before', minutes: 10 },
  { label: '30 min before', minutes: 30 },
  { label: '1 hr before', minutes: 60 },
];

const DONE_STRIP_MS = 12000;

function useResolvedTask(task: DailyTask, forDate: string) {
  const linkedStep = usePlanStore((state) => {
    if (!task.linkedPlan) return undefined;
    const plan = state.plans.find((p) => p.id === task.linkedPlan!.planId);
    return plan ? selectStepAtPath(plan.steps, task.linkedPlan.path) : undefined;
  });
  if (task.linkedPlan) {
    return { title: linkedStep?.title ?? 'Linked step was deleted', done: linkedStep?.done ?? false };
  }
  if (task.repeat !== 'none') return { title: task.title, done: task.completedDates.includes(forDate) };
  return { title: task.title, done: task.done };
}

function reminderLabel(minutes: number | undefined): string {
  if (minutes === undefined) return 'No reminder';
  if (minutes === 0) return 'Reminder at time';
  return `Reminder ${minutes >= 60 ? `${minutes / 60} hr` : `${minutes} min`} before`;
}

// ---------------------------------------------------------------------------
// Reschedule — pick any date (and optionally a time) instead of only
// "tomorrow". The calendar and time live in one sheet: a second stacked
// Modal for the time is unreliable on iOS.
// ---------------------------------------------------------------------------
function RescheduleSheet({
  task,
  title,
  fromDate,
  visible,
  onClose,
  onLetGo,
}: {
  task: DailyTask;
  title: string;
  fromDate: string;
  visible: boolean;
  onClose: () => void;
  onLetGo?: () => void; // "Let go": archived without penalty
}) {
  const rescheduleTask = useDailyPlanningStore((s) => s.rescheduleTask);
  const { showToast } = useUi();
  const today = todayISO();
  // Default to the day after this occurrence (what "Move to tomorrow" used to
  // do), but never a date that's already gone.
  const defaultDate = addDaysISO(fromDate, 1) < today ? today : addDaysISO(fromDate, 1);

  const [selected, setSelected] = useState(defaultDate);
  const [month, setMonth] = useState(defaultDate);
  const [withTime, setWithTime] = useState(!!task.scheduledTime);
  const [hour, setHour] = useState(parseTimeSlot(task.scheduledTime).hour);
  const [minute, setMinute] = useState(parseTimeSlot(task.scheduledTime).minute);

  useEffect(() => {
    if (!visible) return;
    setSelected(defaultDate);
    setMonth(defaultDate);
    setWithTime(!!task.scheduledTime);
    const slot = parseTimeSlot(task.scheduledTime);
    setHour(slot.hour);
    setMinute(slot.minute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const time = withTime ? formatTimeSlot(hour, minute) : undefined;
  const unchanged = selected === fromDate && time === task.scheduledTime;
  const pick = (date: string) => {
    setSelected(date);
    setMonth(date);
  };
  const quickPicks = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDaysISO(today, 1) },
    { label: 'Next week', date: addDaysISO(today, 7) },
  ];

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <SectionHeading>Reschedule</SectionHeading>
      <Caption style={styles.rescheduleTaskName} numberOfLines={2}>
        {title || 'This task'}
      </Caption>
      {task.repeat !== 'none' && (
        <Caption style={styles.rescheduleHint}>This task repeats — only this occurrence moves; the rest keep their schedule.</Caption>
      )}

      <View style={styles.reminderOptions}>
        {quickPicks.map((q) => (
          <Pressable key={q.label} onPress={() => pick(q.date)} style={[styles.optionChip, selected === q.date && styles.optionChipActive]}>
            <Caption style={selected === q.date ? styles.optionChipTextActive : undefined}>{q.label}</Caption>
          </Pressable>
        ))}
      </View>

      <MonthCalendar
        accent={colors.teal}
        month={month}
        onMonthChange={setMonth}
        disableFuture={false}
        disablePast
        getDayColor={(d) => (d === selected ? colors.teal : undefined)}
        onDayPress={setSelected}
      />

      <Eyebrow style={styles.rescheduleLabel}>Time</Eyebrow>
      <View style={styles.reminderOptions}>
        <Pressable onPress={() => setWithTime(false)} style={[styles.optionChip, !withTime && styles.optionChipActive]}>
          <Caption style={!withTime ? styles.optionChipTextActive : undefined}>No set time</Caption>
        </Pressable>
        <Pressable onPress={() => setWithTime(true)} style={[styles.optionChip, withTime && styles.optionChipActive]}>
          <Caption style={withTime ? styles.optionChipTextActive : undefined}>At a time</Caption>
        </Pressable>
      </View>
      {withTime && <TimeColumns hour={hour} minute={minute} onHour={setHour} onMinute={setMinute} />}
      {!withTime && task.reminders[0]?.minutesBefore !== undefined && (
        <Caption style={styles.rescheduleHint}>Without a time, this task's reminder is turned off.</Caption>
      )}

      <PrimaryButton
        label={`Move to ${formatDisplayDate(selected)}${time ? ` · ${formatClockTime(time)}` : ''}`}
        disabled={unchanged}
        style={styles.rescheduleSubmit}
        onPress={() => {
          rescheduleTask(task.id, fromDate, selected, time);
          showToast({ message: `Rescheduled to ${formatDisplayDate(selected)}${time ? ` at ${formatClockTime(time)}` : ''}` });
          onClose();
        }}
      />
      {onLetGo && (
        <Pressable
          style={styles.letGoRow}
          onPress={() => {
            onClose();
            onLetGo();
          }}
          accessibilityRole="button"
          accessibilityHint="Archives it. It doesn't count as missed."
        >
          <Ionicons name="leaf-outline" size={16} color={colors.inkSoft} />
          <Caption>Let it go (archived, not missed)</Caption>
        </Pressable>
      )}
    </SheetModal>
  );
}

// ---------------------------------------------------------------------------
// Task row
// ---------------------------------------------------------------------------
interface TaskRowProps {
  task: DailyTask;
  date: string;
  dragHandle?: React.ReactNode; // shown when the list is in the user's own order
  onToggle: (task: DailyTask) => void;
  onDelete: (task: DailyTask) => void;
  onReschedule: (task: DailyTask) => void;
  onStart: (task: DailyTask) => void; // "Start": times the task (and may ask how you feel first)
  onStop: (task: DailyTask) => void;
  // Screen reader actions: the swipe actions plus move up/down.
  a11yActions?: { name: string; label: string }[];
  onA11yAction?: (name: string) => void;
  onPickTime: (task: DailyTask) => void;
  onEditNote: (task: DailyTask) => void;
  onOpen: (task: DailyTask) => void; // the full task page
  // The just-completed strip and the feeling link (see DoneStrip / FeelingLine).
  showDoneStrip?: boolean;
  onDismissStrip?: () => void;
  onLogFeeling?: (task: DailyTask) => void;
  showFeelingLine?: boolean;
}

// How the feeling logged after this task (on this date) reads, if one was.
function useTaskFeeling(task: DailyTask, date: string, phase: FeelingPhase = 'after') {
  const entries = useFeelingsStore((s) => s.entries);
  const personalFeelings = useFeelingsStore((s) => s.personalFeelings);
  const entry = linkedEntry(task, date, phase, entries);
  if (!entry) return undefined;
  const names = entry.feelingIds
    .map((id) => findFeeling(id)?.name ?? personalFeelings.find((p) => p.id === id)?.name)
    .filter(Boolean);
  return { label: names.join(' & ') || zoneMeta(entry.zone).label, color: zoneMeta(entry.zone).accent, note: entry.note };
}

const difficultyLabel = (d: TaskDifficulty) => DIFFICULTY.find((x) => x.id === d)!.label;

// Shown on a task row right after it's ticked off, when the feeling sheet
// isn't asked for. Everything is optional, nothing is a modal, and it goes
// away on its own — ignoring it saves nothing.
function DoneStrip({
  task,
  date,
  onEditNote,
  onDismiss,
}: {
  task: DailyTask;
  date: string;
  onEditNote: (task: DailyTask) => void; // the feeling sheet
  onDismiss?: () => void;
}) {
  const setCompletionNote = useDailyPlanningStore((s) => s.setCompletionNote);
  const mode = useSettingsStore((s) => s.taskFeelingMode);
  const feeling = useTaskFeeling(task, date);
  const note = task.completionNotes[date];

  return (
    <View style={styles.doneStrip}>
      <View style={styles.doneStripTop}>
        <Caption>How did it go?</Caption>
        <Pressable hitSlop={8} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Ionicons name="close" size={14} color={colors.inkSoft} />
        </Pressable>
      </View>
      <View style={styles.evalRow}>
        {DIFFICULTY.map((d) => {
          const active = note?.difficulty === d.id;
          return (
            <Pressable
              key={d.id}
              onPress={() => setCompletionNote(task.id, date, { ...note, difficulty: active ? undefined : d.id })}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.optionChip, active && styles.optionChipActive]}
            >
              <Caption style={active ? styles.optionChipTextActive : undefined}>{d.label.replace(' than expected', '')}</Caption>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.doneStripLinks}>
        {feeling ? (
          <Pressable hitSlop={6} onPress={() => onEditNote(task)} accessibilityRole="button">
            <Caption style={{ color: feeling.color }}>Felt {feeling.label.toLowerCase()}</Caption>
          </Pressable>
        ) : (
          mode !== 'never' && (
            <Pressable hitSlop={6} onPress={() => onEditNote(task)} accessibilityRole="button">
              <Caption style={styles.noteHint}>How do you feel?</Caption>
            </Pressable>
          )
        )}
        <Pressable hitSlop={6} onPress={() => onEditNote(task)} accessibilityRole="button">
          <Caption style={styles.noteHint}>{note?.comment || feeling?.note ? 'Edit note' : 'Add a note'}</Caption>
        </Pressable>
      </View>
    </View>
  );
}

function TaskRow({
  task,
  date,
  dragHandle,
  onToggle,
  onDelete,
  onReschedule,
  onStart,
  onStop,
  a11yActions,
  onA11yAction,
  onPickTime,
  onEditNote,
  onOpen,
  showDoneStrip,
  onDismissStrip,
  onLogFeeling,
  showFeelingLine,
}: TaskRowProps) {
  const resolved = useResolvedTask(task, date);
  const updateTaskTitle = useDailyPlanningStore((s) => s.updateTaskTitle);
  const setReminder = useDailyPlanningStore((s) => s.setReminder);
  const setAlarmSound = useDailyPlanningStore((s) => s.setAlarmSound);
  const defaultSound = useSettingsStore((s) => s.defaultAlarmSound);
  const allTags = useDailyPlanningStore((s) => s.tags);
  const addSubtask = useDailyPlanningStore((s) => s.addSubtask);
  const toggleSubtask = useDailyPlanningStore((s) => s.toggleSubtask);
  const { requestDelete, showToast } = useUi();

  const [titleDraft, setTitleDraft] = useState(resolved.title);
  useEffect(() => setTitleDraft(resolved.title), [resolved.title]);
  const [showReminder, setShowReminder] = useState(false);
  const [showSound, setShowSound] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const note = task.completionNotes[date];
  const feeling = useTaskFeeling(task, date);
  const before = useTaskFeeling(task, date, 'before');
  const running = task.running?.date === date;
  const canStart = !resolved.done && date === todayISO();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [running]);
  const runningMinutes = running ? Math.max(0, Math.round((Date.now() - Date.parse(task.running!.startedAt)) / 60_000)) : 0;

  const confirmDeleteSubtask = (subId: string, label: string) => {
    const previous = useDailyPlanningStore.getState().tasks;
    requestDelete({
      message: `Remove the subtask "${label}"?`,
      toastMessage: 'Subtask removed',
      perform: () => useDailyPlanningStore.getState().deleteSubtask(task.id, subId),
      restore: () => useDailyPlanningStore.getState().restoreTasks(previous),
    });
  };

  return (
    <Card style={styles.taskCard}>
      <View style={styles.taskTopRow}>
        <Pressable
          hitSlop={8}
          onPress={() => onToggle(task)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: resolved.done }}
          accessibilityLabel={resolved.done ? `Mark "${resolved.title}" not done` : `Mark "${resolved.title}" done`}
          accessibilityActions={a11yActions}
          onAccessibilityAction={(e) => onA11yAction?.(e.nativeEvent.actionName)}
        >
          <Ionicons
            name={resolved.done ? 'checkbox' : 'square-outline'}
            size={24}
            color={resolved.done ? colors.teal : colors.inkSoft}
          />
        </Pressable>
        <TextInput
          value={titleDraft}
          onChangeText={setTitleDraft}
          onBlur={() => updateTaskTitle(task.id, titleDraft)}
          style={[styles.taskInput, resolved.done && styles.taskInputDone]}
          multiline
        />
        {task.repeat !== 'none' && (
          <Ionicons name="repeat" size={17} color={colors.teal} accessibilityLabel={`Repeats ${REPEAT_LABELS[task.repeat].toLowerCase()}`} />
        )}
        <Pressable hitSlop={8} onPress={() => onOpen(task)} accessibilityRole="button" accessibilityLabel={`Open "${resolved.title || 'task'}"`}>
          <Ionicons name="open-outline" size={18} color={colors.inkSoft} />
        </Pressable>
        {dragHandle}
        <Pressable hitSlop={8} onPress={() => onDelete(task)} accessibilityRole="button" accessibilityLabel={`Delete "${resolved.title || 'task'}"`}>
          <Ionicons name="trash-outline" size={18} color={colors.inkSoft} />
        </Pressable>
      </View>

      {(task.tagIds.length > 0 || task.priority !== 'none') && (
        <View style={styles.metaRow}>
          {task.priority !== 'none' && (
            <View style={styles.metaChip} accessible accessibilityLabel={`Priority ${task.priority}`}>
              <Ionicons name="flag-outline" size={12} color={colors.inkSoft} />
              <Caption> {task.priority[0].toUpperCase() + task.priority.slice(1)}</Caption>
            </View>
          )}
          {task.tagIds.map((id) => {
            const tag = allTags.find((t) => t.id === id);
            return tag ? <TagChip key={id} tag={tag} /> : null;
          })}
        </View>
      )}

      <View style={styles.metaRow}>
        {task.linkedPlan && (
          <View style={styles.metaChip}>
            <Ionicons name="link-outline" size={12} color={colors.teal} />
            <Caption style={styles.linkedText}> Linked to Plan Builder</Caption>
          </View>
        )}
        {(canStart || running) && (
          <Pressable
            style={[styles.pill, running && styles.pillActive]}
            onPress={() => (running ? onStop(task) : onStart(task))}
            accessibilityRole="button"
            accessibilityLabel={running ? `Stop timing "${resolved.title}", ${runningMinutes} minutes so far` : `Start "${resolved.title}"`}
          >
            <Ionicons name={running ? 'stop-circle-outline' : 'play-outline'} size={13} color={running ? colors.teal : colors.inkSoft} />
            <Caption style={running ? styles.pillTextActive : undefined}> {running ? `${runningMinutes} min · Stop` : 'Start'}</Caption>
          </Pressable>
        )}
        <Pressable style={[styles.pill, task.scheduledTime && styles.pillActive]} onPress={() => onPickTime(task)}>
          <Ionicons name="time-outline" size={13} color={task.scheduledTime ? colors.teal : colors.inkSoft} />
          <Caption style={task.scheduledTime ? styles.pillTextActive : undefined}> {task.scheduledTime ? formatClockTime(task.scheduledTime) : 'Set time'}</Caption>
        </Pressable>
        <Pressable
          style={[styles.pill, task.reminders[0]?.minutesBefore !== undefined && styles.pillActive]}
          onPress={() => {
            if (!task.scheduledTime) onPickTime(task);
            else if (task.reminders.length > 1) onOpen(task);
            else setShowReminder((v) => !v);
          }}
        >
          <Ionicons
            name={task.reminders[0]?.minutesBefore !== undefined ? 'alarm' : 'alarm-outline'}
            size={13}
            color={task.reminders[0]?.minutesBefore !== undefined ? colors.teal : colors.inkSoft}
          />
          <Caption style={task.reminders[0]?.minutesBefore !== undefined ? styles.pillTextActive : undefined}>
            {' '}
            {task.reminders.length > 1
              ? `${task.reminders.length} reminders`
              : task.reminders[0]?.minutesBefore !== undefined
                ? reminderLabel(task.reminders[0]?.minutesBefore)
                : 'Remind me'}
          </Caption>
        </Pressable>
        <Pressable style={styles.pill} onPress={() => setExpanded((v) => !v)}>
          <Ionicons name={expanded ? 'chevron-up-outline' : 'list-outline'} size={13} color={colors.inkSoft} />
          <Caption> {task.subtasks.length > 0 ? `${task.subtasks.length} subtasks` : 'Subtasks'}</Caption>
        </Pressable>
      </View>


      {showReminder && task.scheduledTime && (
        <>
          <View style={styles.reminderOptions}>
            {reminderOptions.map((opt) => (
              <Pressable
                key={opt.label}
                onPress={() => {
                  setReminder(task.id, opt.minutes);
                  setShowReminder(opt.minutes === undefined ? false : showReminder);
                }}
                style={[styles.optionChip, task.reminders[0]?.minutesBefore === opt.minutes && styles.optionChipActive]}
              >
                <Caption style={task.reminders[0]?.minutesBefore === opt.minutes ? styles.optionChipTextActive : undefined}>
                  {opt.label}
                </Caption>
              </Pressable>
            ))}
          </View>
          {task.reminders[0]?.minutesBefore !== undefined && (
            <>
              <Pressable style={styles.soundRow} onPress={() => setShowSound((v) => !v)}>
                <Ionicons name="musical-notes-outline" size={13} color={colors.inkSoft} />
                <Caption> Sound: {alarmSoundLabel(task.reminders[0]?.sound ?? defaultSound)}</Caption>
              </Pressable>
              {showSound && <ReminderSoundPicker value={task.reminders[0]?.sound} onChange={(id) => setAlarmSound(task.id, id)} />}
              <Caption style={styles.clockNote}>{PHONE_CLOCK_NOTE}</Caption>
            </>
          )}
        </>
      )}

      {resolved.done && showDoneStrip && <DoneStrip task={task} date={date} onEditNote={onEditNote} onDismiss={onDismissStrip} />}

      {resolved.done && !showDoneStrip && (
        <Pressable style={styles.noteBox} onPress={() => onEditNote(task)} accessibilityRole="button" accessibilityHint="Edit how it went and how you felt">
          {note?.difficulty || note?.evaluation || note?.comment || feeling ? (
            <>
              {(before || feeling) && (
                <Caption>
                  {before && <Caption style={{ color: before.color }}>Before: {before.label.toLowerCase()}</Caption>}
                  {before && feeling ? '  →  ' : ''}
                  {feeling && <Caption style={{ color: feeling.color }}>{before ? 'After' : 'Felt'}: {feeling.label.toLowerCase()}</Caption>}
                </Caption>
              )}
              {note?.difficulty ? (
                <Caption>{difficultyLabel(note.difficulty)}</Caption>
              ) : (
                note?.evaluation && (
                  <View style={styles.evalTag}>
                    <Ionicons name={evaluationMeta[note.evaluation].icon} size={13} color={evaluationMeta[note.evaluation].color} />
                    <Caption style={{ color: evaluationMeta[note.evaluation].color }}> {evaluationMeta[note.evaluation].label}</Caption>
                  </View>
                )
              )}
              {(note?.comment || feeling?.note) && <Body style={styles.noteText}>{note?.comment || feeling?.note}</Body>}
            </>
          ) : (
            <Caption style={styles.noteHint}>+ How it went, how you feel</Caption>
          )}
        </Pressable>
      )}
      {task.actualMinutes[date] ? <Caption style={styles.noteHint}>Timed: {task.actualMinutes[date]} min</Caption> : null}

      {!resolved.done && (
        <Pressable style={styles.moveButton} onPress={() => onReschedule(task)} accessibilityRole="button">
          <Ionicons name="calendar-outline" size={16} color={colors.amber} />
          <Body style={styles.moveButtonText}> Reschedule</Body>
        </Pressable>
      )}

      {expanded && (
        <View style={styles.subtaskSection}>
          {task.subtasks.map((sub) => (
            <View key={sub.id} style={styles.subtaskRow}>
              <Pressable
                hitSlop={8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sub.done }}
                accessibilityLabel={sub.title}
                onPress={() => {
                  toggleSubtask(task.id, sub.id);
                  const after = useDailyPlanningStore.getState().tasks.find((t) => t.id === task.id);
                  if (after && allSubtasksDone(after) && !resolveTaskDone(after, date)) {
                    showToast({ message: 'All subtasks done', actionLabel: 'Mark task done', onAction: () => onToggle(after) });
                  }
                }}
              >
                <Ionicons
                  name={sub.done ? 'checkbox' : 'square-outline'}
                  size={16}
                  color={sub.done ? colors.teal : colors.inkSoft}
                />
              </Pressable>
              <Body style={[styles.subtaskText, sub.done && styles.taskInputDone]}>{sub.title}</Body>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove subtask ${sub.title}`} hitSlop={8} onPress={() => confirmDeleteSubtask(sub.id, sub.title)}>
                <Ionicons name="close" size={14} color={colors.inkSoft} />
              </Pressable>
            </View>
          ))}
          <TextInput
            value={newSubtaskTitle}
            onChangeText={setNewSubtaskTitle}
            placeholder="Add a subtask..."
            placeholderTextColor={colors.inkSoft}
            style={styles.addSubtaskInput}
            onSubmitEditing={() => {
              addSubtask(task.id, newSubtaskTitle);
              setNewSubtaskTitle('');
            }}
            returnKeyType="done"
          />
        </View>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
const HOUR_H = 64;
const BLOCK_MIN = 50; // visual length of a block, in minutes
const LABEL_W = 46;
// A block is as long as the task (at least BLOCK_MIN, so a short one stays readable).
const blockMinutes = (t: DailyTask) => Math.max(BLOCK_MIN, t.durationMinutes ?? 0);

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

function TimelineBlock({
  task,
  date,
  top,
  height,
  leftPct,
  widthPct,
  onToggle,
  onOpen,
  onStart,
  onStop,
}: {
  task: DailyTask;
  date: string;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  onToggle: (task: DailyTask) => void;
  onOpen: (task: DailyTask) => void;
  onStart: (task: DailyTask) => void;
  onStop: (task: DailyTask) => void;
}) {
  const resolved = useResolvedTask(task, date);
  const running = task.running?.date === date;
  const canStart = !resolved.done && date === todayISO();
  return (
    <Pressable
      onPress={() => onOpen(task)}
      style={[
        styles.timelineBlock,
        { top, height, left: `${leftPct}%`, width: `${widthPct}%` },
        resolved.done && styles.timelineBlockDone,
      ]}
    >
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!(resolved.done) }} accessibilityLabel="Done" hitSlop={6} onPress={() => onToggle(task)}>
        <Ionicons
          name={resolved.done ? 'checkbox' : 'square-outline'}
          size={16}
          color={resolved.done ? colors.teal : colors.inkSoft}
        />
      </Pressable>
      <View style={styles.timelineBlockText}>
        <Caption numberOfLines={1} style={styles.timelineBlockTime}>{task.scheduledTime && formatClockTime(task.scheduledTime)}</Caption>
        <Body numberOfLines={2} style={[styles.timelineBlockTitle, resolved.done && styles.taskInputDone]}>
          {resolved.title}
        </Body>
      </View>
      {(canStart || running) && (
        <Pressable
          hitSlop={8}
          onPress={() => (running ? onStop(task) : onStart(task))}
          accessibilityRole="button"
          accessibilityLabel={running ? `Stop timing "${resolved.title}"` : `Start "${resolved.title}"`}
        >
          <Ionicons name={running ? 'stop-circle' : 'play-circle-outline'} size={22} color={colors.teal} />
        </Pressable>
      )}
    </Pressable>
  );
}

function TimelineView({
  tasks,
  date,
  onToggle,
  onOpen,
  onStart,
  onStop,
}: {
  tasks: DailyTask[];
  date: string;
  onToggle: (task: DailyTask) => void;
  onOpen: (task: DailyTask) => void;
  onStart: (task: DailyTask) => void;
  onStop: (task: DailyTask) => void;
}) {
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const scheduled = tasks.filter((t) => t.scheduledTime).sort((a, b) => toMinutes(a.scheduledTime!) - toMinutes(b.scheduledTime!));
  const unscheduled = tasks.filter((t) => !t.scheduledTime);

  const starts = scheduled.map((t) => toMinutes(t.scheduledTime!));
  const startHour = Math.max(0, Math.min(7, starts.length ? Math.floor(Math.min(...starts) / 60) : 7));
  const endHour = Math.min(24, Math.max(21, starts.length ? Math.floor(Math.max(...starts) / 60) + 2 : 21));
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const totalHeight = (endHour - startHour) * HOUR_H;

  // Side-by-side columns for overlapping blocks so nothing is drawn on top of anything else.
  const placed: { task: DailyTask; col: number; cols: number }[] = [];
  let cluster: { task: DailyTask; col: number; start: number }[] = [];
  let colEnds: number[] = [];
  const flush = () => {
    cluster.forEach((c) => placed.push({ task: c.task, col: c.col, cols: colEnds.length }));
    cluster = [];
    colEnds = [];
  };
  scheduled.forEach((task) => {
    const start = toMinutes(task.scheduledTime!);
    if (colEnds.length && start >= Math.max(...colEnds)) flush();
    let col = colEnds.findIndex((end) => end <= start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(0);
    }
    colEnds[col] = start + blockMinutes(task);
    cluster.push({ task, col, start });
  });
  flush();

  const isToday = date === todayISO();
  const nowTop = ((nowMinutes - startHour * 60) / 60) * HOUR_H;
  const showNow = isToday && nowTop >= 0 && nowTop <= totalHeight;

  return (
    <View>
      <View style={[styles.timeline, { height: totalHeight + 8 }]}>
        {hours.map((h) => (
          <View key={h} style={[styles.hourRow, { top: (h - startHour) * HOUR_H }]}>
            <Caption style={styles.hourLabel}>{String(h).padStart(2, '0')}:00</Caption>
            <View style={styles.hourLine} />
          </View>
        ))}

        <View style={[styles.blocksLayer, { left: LABEL_W + spacing.sm }]}>
          {placed.map(({ task, col, cols }) => (
            <TimelineBlock
              key={task.id}
              task={task}
              date={date}
              top={((toMinutes(task.scheduledTime!) - startHour * 60) / 60) * HOUR_H}
              height={(blockMinutes(task) / 60) * HOUR_H - 4}
              leftPct={(col / cols) * 100}
              widthPct={100 / cols - 1}
              onToggle={onToggle}
              onOpen={onOpen}
              onStart={onStart}
              onStop={onStop}
            />
          ))}
        </View>

        {showNow && (
          <View pointerEvents="none" style={[styles.nowRow, { top: nowTop }]}>
            <View style={styles.nowDot} />
            <View style={styles.nowLine} />
          </View>
        )}
      </View>

      {scheduled.length === 0 && <Caption style={styles.timelineHint}>Give a task a time and it lands here.</Caption>}

      {unscheduled.length > 0 && (
        <View style={styles.unscheduled}>
          <Eyebrow>No time set</Eyebrow>
          {unscheduled.map((task) => (
            <UnscheduledRow key={task.id} task={task} date={date} onToggle={onToggle} onOpen={onOpen} />
          ))}
        </View>
      )}
    </View>
  );
}

function UnscheduledRow({ task, date, onToggle, onOpen }: { task: DailyTask; date: string; onToggle: (t: DailyTask) => void; onOpen: (t: DailyTask) => void }) {
  const resolved = useResolvedTask(task, date);
  return (
    <Pressable style={styles.unscheduledRow} onPress={() => onOpen(task)}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!(resolved.done) }} accessibilityLabel="Done" hitSlop={8} onPress={() => onToggle(task)}>
        <Ionicons name={resolved.done ? 'checkbox' : 'square-outline'} size={18} color={resolved.done ? colors.teal : colors.inkSoft} />
      </Pressable>
      <Body style={[styles.unscheduledText, resolved.done && styles.taskInputDone]}>{resolved.title}</Body>
      <Ionicons name="chevron-forward" size={14} color={colors.inkSoft} />
    </Pressable>
  );
}

// Hold, then drag, to move a task within the day. A long press first, so
// scrolling the list never starts a drag by accident.
function DragHandle({ label, onStart, onMove, onEnd }: { label: string; onStart: () => void; onMove: (dy: number) => void; onEnd: (dy: number) => void }) {
  const active = useRef(false);
  const gesture = Gesture.Pan()
    .activateAfterLongPress(180)
    .runOnJS(true)
    .onStart(() => {
      active.current = true;
      onStart();
    })
    .onUpdate((e) => {
      if (active.current) onMove(e.translationY);
    })
    .onFinalize((e) => {
      if (!active.current) return;
      active.current = false;
      onEnd(e.translationY);
    });
  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.dragHandle} accessible accessibilityLabel={label} accessibilityHint="Hold and drag to reorder. Screen reader users: use the actions on the checkbox.">
        <Ionicons name="reorder-three-outline" size={22} color={colors.inkSoft} />
      </View>
    </GestureDetector>
  );
}

const SWIPE_COLORS = { done: '#4F9B82', tomorrow: '#5B8FC7', pick: '#C98A4E', delete: '#8A847A' };

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export function DailyPlanningScreen() {
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskTime, setNewTaskTime] = useState<string | undefined>(undefined);
  const [newTaskRepeat, setNewTaskRepeat] = useState<TaskRepeat>('none');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [templatesVisible, setTemplatesVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>(() => useSettingsStore.getState().dailyDefaultView);

  const [timeTarget, setTimeTarget] = useState<DailyTask | 'new' | null>(null);
  const [feelingSheet, setFeelingSheet] = useState<{ taskId: string; date: string; phase: FeelingPhase } | null>(null);
  const [reflectionDraft, setReflectionDraft] = useState('');
  const [justDone, setJustDone] = useState<{ taskId: string; date: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [viewOptions, setViewOptions] = useState(false);
  const [reschedule, setReschedule] = useState<{ task: DailyTask; fromDate: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragY = useRef(new Animated.Value(0)).current;
  const rowHeights = useRef(new Map<string, number>());
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // The just-completed strip fades out by itself.
  useEffect(() => {
    if (!justDone) return;
    const id = setTimeout(() => setJustDone(null), DONE_STRIP_MS);
    return () => clearTimeout(id);
  }, [justDone]);

  const tasks = useDailyPlanningStore((s) => s.tasks);
  const dayTemplates = useDailyPlanningStore((s) => s.dayTemplates);
  const dayReflections = useDailyPlanningStore((s) => s.dayReflections);
  const addTask = useDailyPlanningStore((s) => s.addTask);
  const addLinkedTask = useDailyPlanningStore((s) => s.addLinkedTask);
  const toggleTask = useDailyPlanningStore((s) => s.toggleTask);
  const setScheduledTime = useDailyPlanningStore((s) => s.setScheduledTime);
  const setCompletionNote = useDailyPlanningStore((s) => s.setCompletionNote);
  const moveIncompleteToTomorrow = useDailyPlanningStore((s) => s.moveIncompleteToTomorrow);
  const saveDayAsTemplate = useDailyPlanningStore((s) => s.saveDayAsTemplate);
  const applyTemplate = useDailyPlanningStore((s) => s.applyTemplate);
  const setDayReflection = useDailyPlanningStore((s) => s.setDayReflection);
  const feelingMode = useSettingsStore((s) => s.taskFeelingMode);
  const feelingBefore = useSettingsStore((s) => s.taskFeelingBefore);
  const dayOrder = useDailyPlanningStore((s) => s.dayOrder);
  const tags = useDailyPlanningStore((s) => s.tags);
  const prefs = useSettingsStore((s) => s.dailyViewPrefs);
  const availableMinutes = useSettingsStore((s) => s.dailyAvailableMinutes);
  const setSetting = useSettingsStore((s) => s.set);
  usePlanStore((s) => s.plans); // re-render when a linked Plan Builder step changes
  const { showToast, showDialog, requestDelete } = useUi();

  useEffect(() => setReflectionDraft(dayReflections[selectedDate] ?? ''), [selectedDate, dayReflections]);

  const today = todayISO();
  const doneOn = (t: DailyTask, d: string) => resolveTaskDone(t, d);
  const tasksForDate = sortForDay(
    tasks.filter((t) => taskAppliesToDate(t, selectedDate)),
    selectedDate,
    dayOrder
  );
  const visibleTasks = sortTasks(applyFilters(tasksForDate, selectedDate, prefs.filters, doneOn), prefs.sortBy);
  const groups = groupTasks(visibleTasks, prefs.groupBy, selectedDate, tags, doneOn);
  const activeFilters = filtersActive(prefs.filters);
  // Dragging only makes sense in the user's own order, with everything shown.
  const canDrag = prefs.sortBy === 'manual' && prefs.groupBy === 'none' && activeFilters === 0;
  const load = dayLoad(tasksForDate, selectedDate, availableMinutes, doneOn);
  const carried = selectedDate === today ? carryOver(tasks, today, doneOn) : [];
  const hits = searchOpen ? searchTasks(tasks, query, resolveTaskTitle, today) : [];
  const doneCount = tasksForDate.filter((t) => resolveTaskDone(t, selectedDate)).length;
  const percent = tasksForDate.length === 0 ? 0 : Math.round((doneCount / tasksForDate.length) * 100);
  const incompleteCount = tasksForDate.length - doneCount;

  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const weekStart = weekStartFor(selectedDate, weekStartsOn);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));


  const openCompletion = (task: DailyTask, date: string) => setFeelingSheet({ taskId: task.id, date, phase: 'after' });

  // Finishing a task: the feeling sheet for tasks that call for it (see
  // shouldAskFeeling), otherwise the quiet strip on the row.
  const handleToggle = (task: DailyTask) => {
    const nowDone = toggleTask(task.id, selectedDate);
    if (nowDone) successFeedback();
    const ask = nowDone && shouldAskFeeling(task, feelingMode);
    if (ask) setFeelingSheet({ taskId: task.id, date: selectedDate, phase: 'after' });
    setJustDone(nowDone && !ask ? { taskId: task.id, date: selectedDate } : null);
  };

  const startTask = (task: DailyTask) => {
    useDailyPlanningStore.getState().startTask(task.id, selectedDate);
    if (feelingBefore) setFeelingSheet({ taskId: task.id, date: selectedDate, phase: 'before' });
  };
  const stopTask = (task: DailyTask) => {
    const minutes = useDailyPlanningStore.getState().stopTask(task.id);
    showToast({ message: minutes ? `Timed ${minutes} min` : 'Stopped' });
  };

  const openTaskFeelingFlow = (task: DailyTask, date = selectedDate, phase: FeelingPhase = 'after', zone?: FeelingZone) => {
    setJustDone(null);
    setFeelingSheet(null);
    navigation.push('moodCheck', { source: { kind: 'task', refId: task.id, date, phase }, ...(zone ? { startZone: zone } : {}) });
  };

  const openTask = (task: DailyTask) => {
    navigation.push('taskEditor', { taskId: task.id, date: selectedDate });
  };
  const newTask = (title?: string) => {
    navigation.push('taskEditor', { date: selectedDate, ...(title?.trim() ? { title: title.trim() } : {}) });
    setNewTaskTitle('');
  };

  const openTimePicker = (task: DailyTask) => {
    setTimeTarget(task);
  };

  const submitNewTask = () => {
    const { dailyDefaultReminder, dailyDefaultEstimate } = useSettingsStore.getState();
    addTask(selectedDate, newTaskTitle, {
      repeat: newTaskRepeat,
      scheduledTime: newTaskTime,
      ...(dailyDefaultEstimate ? { estimateMinutes: dailyDefaultEstimate } : {}),
      ...(newTaskTime && dailyDefaultReminder !== null ? { reminders: [{ id: genId('reminder'), minutesBefore: dailyDefaultReminder }] } : {}),
    });
    setNewTaskTitle('');
    setNewTaskTime(undefined);
    setNewTaskRepeat('none');
  };

  const reflectionDirty = reflectionDraft !== (dayReflections[selectedDate] ?? '');
  useBackHandler({
    dirty: newTaskTitle.trim() !== '' || reflectionDirty,
    onSave: () => {
      if (newTaskTitle.trim()) submitNewTask();
      if (reflectionDirty) setDayReflection(selectedDate, reflectionDraft);
    },
  });

  const snapshot = () => {
    const previous = useDailyPlanningStore.getState().tasks;
    return () => useDailyPlanningStore.getState().restoreTasks(previous);
  };

  const confirmDelete = (task: DailyTask, date = selectedDate) => {
    const title = resolveTaskTitle(task) || 'This task';
    const restore = snapshot();
    const s = useDailyPlanningStore.getState();
    if (task.repeat === 'none') {
      requestDelete({ message: `"${title}" will be removed from your plan.`, toastMessage: 'Task deleted', perform: () => s.deleteTask(task.id), restore });
      return;
    }
    showDialog({
      title: 'Delete a repeating task?',
      message: `"${title}" repeats. Earlier days and their history are kept either way.`,
      actions: [
        { label: 'Keep it', style: 'cancel' },
        {
          label: 'Only this day',
          onPress: () => {
            s.deleteOccurrence(task.id, date, 'this');
            showToast({ message: 'Removed from this day', actionLabel: 'Undo', onAction: restore });
          },
        },
        {
          label: 'This and later days',
          style: 'destructive',
          onPress: () => {
            s.deleteOccurrence(task.id, date, 'future');
            showToast({ message: 'Task deleted from this day on', actionLabel: 'Undo', onAction: restore });
          },
        },
      ],
    });
  };

  const moveTomorrow = (task: DailyTask, from = selectedDate) => {
    const restore = snapshot();
    useDailyPlanningStore.getState().moveToTomorrow(task.id, from);
    showToast({ message: 'Moved to tomorrow', actionLabel: 'Undo', onAction: restore });
  };

  const letGoOf = (task: DailyTask, date: string) => {
    const s = useDailyPlanningStore.getState();
    s.letGo(task.id, date);
    showToast({ message: 'Let go. It\'s kept in Settings → Daily Planning.', actionLabel: 'Undo', onAction: () => s.undoLetGo(task.id, date) });
  };

  const bringToToday = (task: DailyTask) => {
    const restore = snapshot();
    useDailyPlanningStore.getState().rescheduleTask(task.id, task.date, today, task.scheduledTime);
    showToast({ message: 'Moved to today', actionLabel: 'Undo', onAction: restore });
  };

  const rowActions = (task: DailyTask, done: boolean) => {
    const list = [{ name: done ? 'undo' : 'complete', label: done ? 'Mark not done' : 'Mark done' }];
    if (!done) list.push({ name: 'tomorrow', label: 'Move to tomorrow' }, { name: 'reschedule', label: 'Pick a date' });
    list.push({ name: 'delete', label: 'Delete' });
    if (canDrag) list.push({ name: 'moveUp', label: 'Move up' }, { name: 'moveDown', label: 'Move down' });
    return list;
  };

  const onRowAction = (task: DailyTask) => (name: string) => {
    if (name === 'complete' || name === 'undo') handleToggle(task);
    else if (name === 'tomorrow') moveTomorrow(task);
    else if (name === 'reschedule') setReschedule({ task, fromDate: selectedDate });
    else if (name === 'delete') confirmDelete(task);
    else if (name === 'moveUp') useDailyPlanningStore.getState().reorderTask(selectedDate, task.id, -1);
    else if (name === 'moveDown') useDailyPlanningStore.getState().reorderTask(selectedDate, task.id, 1);
  };

  const endDrag = (task: DailyTask, dy: number) => {
    const ids = visibleTasks.map((t) => t.id);
    const heights = ids.map((id) => rowHeights.current.get(id) ?? 120);
    const to = dropIndex(heights, ids.indexOf(task.id), dy);
    if (to !== ids.indexOf(task.id)) useDailyPlanningStore.getState().moveTaskInDay(selectedDate, task.id, to);
    dragY.setValue(0);
    setDragId(null);
  };

  const renderRow = (task: DailyTask) => {
    const done = resolveTaskDone(task, selectedDate);
    const title = resolveTaskTitle(task) || 'task';
    return (
      <Animated.View
        key={task.id}
        onLayout={(e) => rowHeights.current.set(task.id, e.nativeEvent.layout.height + spacing.sm)}
        style={dragId === task.id ? [styles.dragging, { transform: [{ translateY: dragY }] }] : undefined}
      >
        <SwipeRow
          enabled={dragId === null}
          left={[{ key: 'done', label: done ? 'Not done' : 'Done', icon: done ? 'arrow-undo-outline' : 'checkmark', color: SWIPE_COLORS.done, onPress: () => handleToggle(task) }]}
          right={[
            ...(done
              ? []
              : [
                  { key: 'tomorrow', label: 'Tomorrow', icon: 'arrow-forward' as const, color: SWIPE_COLORS.tomorrow, onPress: () => moveTomorrow(task) },
                  { key: 'pick', label: 'Pick date', icon: 'calendar-outline' as const, color: SWIPE_COLORS.pick, onPress: () => setReschedule({ task, fromDate: selectedDate }) },
                ]),
            { key: 'delete', label: 'Delete', icon: 'trash-outline', color: SWIPE_COLORS.delete, onPress: () => confirmDelete(task) },
          ]}
        >
          <TaskRow
            {...rowProps(task)}
            a11yActions={rowActions(task, done)}
            onA11yAction={onRowAction(task)}
            dragHandle={
              canDrag && visibleTasks.length > 1 ? (
                <DragHandle
                  label={`Reorder "${title}"`}
                  onStart={() => {
                    tapFeedback();
                    dragY.setValue(0);
                    setDragId(task.id);
                  }}
                  onMove={(dy) => dragY.setValue(dy)}
                  onEnd={(dy) => endDrag(task, dy)}
                />
              ) : undefined
            }
          />
        </SwipeRow>
      </Animated.View>
    );
  };

  const rowProps = (task: DailyTask) => ({
    task,
    date: selectedDate,
    onToggle: handleToggle,
    onDelete: (t: DailyTask) => confirmDelete(t),
    onStart: startTask,
    onStop: stopTask,
    onReschedule: (t: DailyTask) => setReschedule({ task: t, fromDate: selectedDate }),
    onPickTime: openTimePicker,
    onEditNote: (t: DailyTask) => {
      setJustDone(null);
      openCompletion(t, selectedDate);
    },
    showDoneStrip: justDone?.taskId === task.id && justDone.date === selectedDate,
    onDismissStrip: () => setJustDone(null),
    onLogFeeling: openTaskFeelingFlow,
    onOpen: openTask,
  });

  return (
    <Screen>
      <ScreenTitle>Daily Planning</ScreenTitle>

      <View style={styles.dateNav}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous day" hitSlop={8} onPress={() => setSelectedDate((d) => addDaysISO(d, -1))}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.dateLabelWrap}>
          {selectedDate === today ? (
            <Caption>Today</Caption>
          ) : (
            <Pressable onPress={() => setSelectedDate(today)} hitSlop={6} accessibilityRole="button">
              <Caption style={styles.pillTextActive}>Back to today</Caption>
            </Pressable>
          )}
          <SectionHeading>{formatDisplayDate(selectedDate)}</SectionHeading>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Next day" hitSlop={8} onPress={() => setSelectedDate((d) => addDaysISO(d, 1))}>
          <Ionicons name="chevron-forward" size={22} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.weekStrip}>
        {weekDays.map((day) => {
          const count = tasks.filter((t) => taskAppliesToDate(t, day)).length;
          const isSelected = day === selectedDate;
          return (
            <Pressable key={day} onPress={() => setSelectedDate(day)} style={styles.weekDayCell}>
              <Caption style={isSelected ? styles.weekDaySelectedText : undefined}>
                {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}
              </Caption>
              <View style={[styles.weekDot, isSelected && styles.weekDotSelected, count === 0 && styles.weekDotEmpty]}>
                {count > 0 && <Caption style={[styles.weekDotText, isSelected && styles.weekDotTextSelected]}>{count}</Caption>}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.viewToggleRow}>
        <View style={styles.segmented}>
          {(['list', 'timeline'] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setViewMode(mode)}
              style={[styles.segment, viewMode === mode && styles.segmentActive]}
            >
              <Caption style={[styles.segmentText, viewMode === mode && styles.segmentTextActive]}>
                {mode === 'list' ? 'List' : 'Timeline'}
              </Caption>
            </Pressable>
          ))}
        </View>
        <View style={styles.toolbarRight}>
          <Pressable
            style={[styles.iconButton, searchOpen && styles.iconButtonActive]}
            onPress={() => {
              setSearchOpen((v) => !v);
              setQuery('');
            }}
            accessibilityRole="button"
            accessibilityLabel={searchOpen ? 'Close search' : 'Search tasks'}
          >
            <Ionicons name={searchOpen ? 'close' : 'search'} size={20} color={searchOpen ? colors.white : colors.inkSoft} />
          </Pressable>
          <Pressable
            style={[styles.iconButton, activeFilters > 0 && styles.iconButtonActive]}
            onPress={() => setViewOptions(true)}
            accessibilityRole="button"
            accessibilityLabel={activeFilters ? `Group, sort and filter, ${activeFilters} filter${activeFilters === 1 ? '' : 's'} on` : 'Group, sort and filter'}
          >
            <Ionicons name="options-outline" size={20} color={activeFilters > 0 ? colors.white : colors.inkSoft} />
          </Pressable>
        </View>
        <Pressable style={styles.newTaskButton} onPress={() => newTask()} accessibilityRole="button" accessibilityLabel="New task">
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </View>

      {searchOpen && (
        <View style={styles.searchBox}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search all tasks..."
            placeholderTextColor={colors.inkSoft}
            style={styles.searchInput}
            autoFocus
            returnKeyType="search"
            accessibilityLabel="Search all tasks"
          />
          <SearchResults hits={hits} query={query} titleOf={resolveTaskTitle} onOpen={(h) => navigation.push('taskEditor', { taskId: h.task.id, date: h.date })} />
        </View>
      )}

      {!searchOpen && (activeFilters > 0 || prefs.groupBy !== 'none' || prefs.sortBy !== 'manual') && (
        <View style={styles.filterLine}>
          <Caption style={styles.flexText}>
            {[
              activeFilters ? `${activeFilters} filter${activeFilters === 1 ? '' : 's'} on` : '',
              prefs.groupBy !== 'none' ? `grouped by ${prefs.groupBy === 'status' ? 'done or not' : prefs.groupBy}` : '',
              prefs.sortBy !== 'manual' ? `sorted by ${prefs.sortBy}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Caption>
          <Pressable onPress={() => setSetting('dailyViewPrefs', DEFAULT_DAY_VIEW)} hitSlop={6} accessibilityRole="button">
            <Caption style={styles.pillTextActive}>Reset</Caption>
          </Pressable>
        </View>
      )}

      {!searchOpen && (
        <CarryOverCard
          tasks={carried}
          titleOf={resolveTaskTitle}
          onToday={bringToToday}
          onPickDate={(t) => setReschedule({ task: t, fromDate: t.date })}
          onLetGo={(t) => letGoOf(t, t.date)}
        />
      )}

      {!searchOpen && viewMode === 'list' && tasksForDate.length > 0 && (
        <PlanMyDayCard load={load} onChangeAvailable={(m) => setSetting('dailyAvailableMinutes', m)} />
      )}

      {!searchOpen &&
        (viewMode === 'list' ? (
          <View style={styles.list}>
            {tasksForDate.length === 0 && <Body style={styles.emptyText}>Nothing planned for this day yet.</Body>}
            {tasksForDate.length > 0 && visibleTasks.length === 0 && <Body style={styles.emptyText}>No tasks on this day match what's chosen in "Show".</Body>}
            {groups.map((g) => (
              <View key={g.key} style={styles.list}>
                {g.label !== '' && (
                  <Eyebrow accessibilityRole="header" style={styles.groupLabel}>
                    {g.label} · {g.tasks.length}
                  </Eyebrow>
                )}
                {g.tasks.map(renderRow)}
              </View>
            ))}
            {visibleTasks.length > 1 && <Caption style={styles.swipeHint}>Swipe a task for quick actions{canDrag ? ', or hold the handle to reorder' : ''}.</Caption>}
          </View>
        ) : (
          <View style={styles.list}>
            <TimelineView tasks={visibleTasks} date={selectedDate} onToggle={handleToggle} onOpen={openTask} onStart={startTask} onStop={stopTask} />
          </View>
        ))}

      <Card style={styles.addTaskCard}>
        <View style={styles.addTaskTop}>
          <TextInput
            value={newTaskTitle}
            onChangeText={setNewTaskTitle}
            placeholder="Add a task..."
            placeholderTextColor={colors.inkSoft}
            style={styles.addTaskInput}
            onSubmitEditing={submitNewTask}
            returnKeyType="done"
          />
          <PrimaryButton label="Add" onPress={submitNewTask} />
        </View>
        <Pressable style={styles.moreDetails} onPress={() => newTask(newTaskTitle)} accessibilityRole="button" hitSlop={6}>
          <Caption style={styles.pillTextActive}>More details</Caption>
        </Pressable>
        <View style={styles.addOptionsRow}>
          <Pressable style={[styles.pill, newTaskTime && styles.pillActive]} onPress={() => setTimeTarget('new')}>
            <Ionicons name="time-outline" size={13} color={newTaskTime ? colors.teal : colors.inkSoft} />
            <Caption style={newTaskTime ? styles.pillTextActive : undefined}> {newTaskTime ?? 'Time'}</Caption>
          </Pressable>
          {(['none', 'daily', 'weekly'] as TaskRepeat[]).map((r) => (
            <Pressable
              key={r}
              onPress={() => setNewTaskRepeat(r)}
              style={[styles.pill, newTaskRepeat === r && styles.pillActive]}
            >
              <Caption style={newTaskRepeat === r ? styles.pillTextActive : undefined}>
                {r === 'none' ? 'Once' : r === 'daily' ? 'Daily' : 'Weekly'}
              </Caption>
            </Pressable>
          ))}
        </View>
      </Card>

      <View style={styles.pullRow}>
        <PrimaryButton label="Pull a step from Plan Builder" variant="outline" onPress={() => setPickerVisible(true)} />
        <View style={styles.linkRow}>
          <Pressable style={styles.templatesButton} onPress={() => navigation.push('planningInsights')} accessibilityRole="button">
            <Ionicons name="stats-chart-outline" size={16} color={colors.inkSoft} />
            <Caption> Insights</Caption>
          </Pressable>
          <Pressable style={styles.templatesButton} onPress={() => setTemplatesVisible(true)} accessibilityRole="button">
            <Ionicons name="copy-outline" size={16} color={colors.inkSoft} />
            <Caption> Day templates</Caption>
          </Pressable>
        </View>
      </View>

      <Card style={styles.summaryCard}>
        <Eyebrow>Day summary</Eyebrow>
        <View style={styles.summaryTop}>
          <SectionHeading>
            {doneCount} of {tasksForDate.length} done
          </SectionHeading>
          <Caption>{percent}%</Caption>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${percent}%` }]} />
        </View>
        {incompleteCount > 0 && (
          <PrimaryButton
            label={`Move ${incompleteCount} unfinished to tomorrow`}
            variant="outline"
            onPress={() => {
              const moved = moveIncompleteToTomorrow(selectedDate);
              showToast({ message: `Moved ${moved} task${moved === 1 ? '' : 's'} to tomorrow` });
            }}
          />
        )}
        <TextInput
          value={reflectionDraft}
          onChangeText={setReflectionDraft}
          onBlur={() => setDayReflection(selectedDate, reflectionDraft)}
          placeholder="One line on how the day went (optional)..."
          placeholderTextColor={colors.inkSoft}
          style={styles.reflectionInput}
          multiline
        />
      </Card>

      {reschedule && (
        <RescheduleSheet
          task={reschedule.task}
          title={resolveTaskTitle(reschedule.task)}
          fromDate={reschedule.fromDate}
          visible
          onClose={() => setReschedule(null)}
          onLetGo={() => letGoOf(reschedule.task, reschedule.fromDate)}
        />
      )}

      <ViewOptionsSheet visible={viewOptions} onClose={() => setViewOptions(false)} prefs={prefs} onChange={(p) => setSetting('dailyViewPrefs', p)} tags={tags} />

      <PlanStepPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onPick={(planId, path) => addLinkedTask(selectedDate, planId, path)}
      />

      <TimePickerModal
        visible={timeTarget !== null}
        value={timeTarget === 'new' ? newTaskTime : timeTarget?.scheduledTime}
        onClose={() => setTimeTarget(null)}
        onPick={(time) => {
          if (timeTarget === 'new') setNewTaskTime(time);
          else if (timeTarget) setScheduledTime(timeTarget.id, time);
        }}
      />

      <TaskFeelingSheet
        taskId={feelingSheet?.taskId ?? null}
        date={feelingSheet?.date ?? selectedDate}
        phase={feelingSheet?.phase ?? 'after'}
        onClose={() => setFeelingSheet(null)}
        onMoreSpecific={(zone) => {
          const t = feelingSheet && useDailyPlanningStore.getState().tasks.find((x) => x.id === feelingSheet.taskId);
          if (t && feelingSheet) openTaskFeelingFlow(t, feelingSheet.date, feelingSheet.phase, zone);
        }}
      />

      <SheetModal visible={templatesVisible} onClose={() => setTemplatesVisible(false)}>
        <View style={styles.modalHeader}>
          <SectionHeading>Day templates</SectionHeading>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={() => setTemplatesVisible(false)}>
            <Ionicons name="close" size={22} color={colors.inkSoft} />
          </Pressable>
        </View>
        <PrimaryButton
          label="Save this day as a template"
          variant="outline"
          onPress={() => saveDayAsTemplate(selectedDate, formatDisplayDate(selectedDate))}
        />
        {dayTemplates.length === 0 && <Body style={styles.emptyText}>No templates saved yet.</Body>}
        {dayTemplates.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => {
              applyTemplate(selectedDate, t.id);
              setTemplatesVisible(false);
            }}
            style={styles.templateRow}
          >
            <Ionicons name="copy-outline" size={18} color={colors.teal} />
            <View style={styles.templateInfo}>
              <Body style={styles.templateName}>{t.name}</Body>
              <Caption>{t.taskTitles.length} tasks</Caption>
            </View>
          </Pressable>
        ))}
      </SheetModal>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  dateLabelWrap: { alignItems: 'center' },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  weekDayCell: { alignItems: 'center', gap: 4 },
  weekDot: {
    width: 24,
    height: 24,
    borderRadius: radii.full,
    backgroundColor: withAlpha(colors.teal, 0.18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDotEmpty: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  weekDotSelected: { backgroundColor: colors.teal },
  weekDotText: { fontSize: 10, color: colors.teal },
  weekDotTextSelected: { color: colors.white },
  weekDaySelectedText: { color: colors.ink, fontFamily: fonts.bodyMedium },
  viewToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 2,
  },
  segment: { paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radii.full },
  segmentActive: { backgroundColor: colors.teal },
  segmentText: { fontFamily: fonts.bodyMedium },
  segmentTextActive: { color: colors.white },
  templatesButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  list: { gap: spacing.sm, marginBottom: spacing.md },
  emptyText: { color: colors.inkSoft },

  taskCard: { gap: spacing.sm },
  taskTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  taskInput: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.ink, padding: 0 },
  taskInputDone: { textDecorationLine: 'line-through', color: colors.inkSoft },
  reorderCol: { alignItems: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  metaChip: { flexDirection: 'row', alignItems: 'center' },
  linkedText: { color: colors.teal },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pillActive: { borderColor: colors.teal, backgroundColor: withAlpha(colors.teal, 0.12) },
  pillTextActive: { color: colors.teal },
  toolbarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginLeft: 'auto' },
  iconButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  iconButtonActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  searchBox: { gap: spacing.sm, marginBottom: spacing.md },
  searchInput: { fontFamily: fonts.body, fontSize: 16, color: colors.ink, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line },
  filterLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  flexText: { flex: 1 },
  groupLabel: { marginTop: spacing.xs },
  swipeHint: { color: colors.inkSoft, textAlign: 'center' },
  dragging: { zIndex: 10, elevation: 8, opacity: 0.95 },
  dragHandle: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  linkRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
  pullRow: { gap: spacing.sm, marginBottom: spacing.lg, alignItems: 'stretch' },
  letGoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.md, minHeight: 44 },
  newTaskButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.sm },
  moreDetails: { alignSelf: 'flex-start', paddingVertical: 4 },
  reminderOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  clockNote: { color: colors.inkSoft, marginTop: spacing.xs },
  soundRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  optionChip: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
  },
  optionChipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  optionChipTextActive: { color: colors.white },
  noteBox: {
    backgroundColor: colors.stone,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: 4,
  },
  evalTag: { flexDirection: 'row', alignItems: 'center' },
  noteText: { fontSize: 14 },
  noteHint: { color: colors.teal },
  doneStrip: {
    backgroundColor: colors.stone,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  doneStripTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  doneStripLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  evalChipSmall: { paddingVertical: 4, paddingHorizontal: spacing.sm },
  feelingLine: { paddingHorizontal: spacing.sm },
  moveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: withAlpha(colors.amber, 0.5),
    backgroundColor: withAlpha(colors.amber, 0.08),
  },
  moveButtonText: { color: colors.amber, fontFamily: fonts.bodyMedium, fontSize: 14 },
  rescheduleTaskName: { color: colors.inkSoft, marginBottom: spacing.sm },
  rescheduleHint: { color: colors.inkSoft, marginBottom: spacing.sm },
  rescheduleLabel: { marginTop: spacing.md, marginBottom: spacing.xs },
  rescheduleSubmit: { marginTop: spacing.md },
  subtaskSection: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.xs,
  },
  subtaskRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  subtaskText: { flex: 1, fontSize: 14 },
  addSubtaskInput: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 4,
  },

  timeline: { position: 'relative', marginBottom: spacing.sm },
  hourRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', height: 20, marginTop: -10 },
  hourLabel: { width: LABEL_W, fontSize: 11 },
  hourLine: { flex: 1, height: 1, backgroundColor: colors.line },
  blocksLayer: { position: 'absolute', top: 0, right: 0, bottom: 0 },
  timelineBlock: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 6,
    padding: 6,
    borderRadius: radii.md,
    backgroundColor: withAlpha(colors.teal, 0.16),
    borderLeftWidth: 3,
    borderLeftColor: colors.teal,
    overflow: 'hidden',
  },
  timelineBlockDone: { opacity: 0.6 },
  timelineBlockText: { flex: 1 },
  timelineBlockTime: { fontSize: 11, lineHeight: 13 },
  timelineBlockTitle: { fontSize: 13, lineHeight: 16, fontFamily: fonts.bodyMedium },
  nowRow: { position: 'absolute', left: LABEL_W - 4, right: 0, flexDirection: 'row', alignItems: 'center', height: 8, marginTop: -4 },
  nowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  nowLine: { flex: 1, height: 2, backgroundColor: colors.amber },
  timelineHint: { textAlign: 'center' },
  unscheduled: { gap: spacing.xs, marginTop: spacing.md },
  unscheduledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm,
  },
  unscheduledText: { flex: 1 },

  addTaskCard: { gap: spacing.sm, marginBottom: spacing.sm },
  addTaskTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addTaskInput: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.ink },
  addOptionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pullButton: { marginBottom: spacing.lg },

  summaryCard: { gap: spacing.sm, marginBottom: spacing.lg },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressTrack: { height: 8, borderRadius: radii.full, backgroundColor: colors.stone, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.teal, borderRadius: radii.full },
  reflectionInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
    minHeight: 40,
  },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planGroup: { marginBottom: spacing.sm, gap: 2 },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  modalRowText: { flex: 1 },
  templateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  templateInfo: { flex: 1 },
  templateName: { fontFamily: fonts.bodyMedium },
  evalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  evalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1.5,
  },
  commentInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    minHeight: 60,
    textAlignVertical: 'top',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  sheetButton: { flex: 1 },
}));
