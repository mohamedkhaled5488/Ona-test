import React, { useLayoutEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBackHandler } from '../hooks/useBackHandler';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { useUi } from '../components/UiProvider';
import { SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { MoveToDailyPlanningSheet } from '../components/MoveToDailyPlanningSheet';
import { colors, spacing, radii, fonts } from '../theme';
import { usePlanStore, selectStepAtPath } from '../store/usePlanStore';
import { useDailyPlanningStore } from '../store/useDailyPlanningStore';
import { planStepColors } from '../data/planStepColors';
import { priorityColors, priorityLabels, priorityOrder } from '../data/planPriority';
import type { RootStackParamList } from '../navigation/types';
import { themedStyles } from '../theme/runtime';

type Props = NativeStackScreenProps<RootStackParamList, 'planStepDetail'>;

export function PlanStepDetailScreen({ route, navigation }: Props) {
  const { planId, path } = route.params;
  const step = usePlanStore((state) => {
    const plan = state.plans.find((p) => p.id === planId);
    return plan ? selectStepAtPath(plan.steps, path) : undefined;
  });
  const updateStep = usePlanStore((state) => state.updateStep);
  const toggleStepDone = usePlanStore((state) => state.toggleStepDone);
  const deleteStep = usePlanStore((state) => state.deleteStep);
  const addStep = usePlanStore((state) => state.addStep);
  const addAlternative = usePlanStore((state) => state.addAlternative);
  const removeAlternative = usePlanStore((state) => state.removeAlternative);
  const addAttachment = usePlanStore((state) => state.addAttachment);
  const removeAttachment = usePlanStore((state) => state.removeAttachment);
  const moveStep = usePlanStore((state) => state.moveStep);
  const addLinkedTask = useDailyPlanningStore((state) => state.addLinkedTask);
  const setScheduledTime = useDailyPlanningStore((state) => state.setScheduledTime);
  const { requestDelete, showToast } = useUi();

  // Which step/sub-step the "move to Daily Planning" sheet is currently
  // targeting — null when closed. Works the same for this step itself and
  // for any of its sub-steps.
  const [moveTarget, setMoveTarget] = useState<{ path: string[]; title: string } | null>(null);

  const confirmMoveToDailyPlanning = (date: string, time: string | undefined) => {
    if (!moveTarget) return;
    const taskId = addLinkedTask(date, planId, moveTarget.path);
    if (time) setScheduledTime(taskId, time);
    showToast({ message: `Added to Daily Planning for ${date}` });
  };

  const [notesDraft, setNotesDraft] = useState(step?.notes ?? '');
  const [resourcesDraft, setResourcesDraft] = useState(step?.resources ?? '');
  const [risksDraft, setRisksDraft] = useState(step?.risks ?? '');
  const [timeEstimateDraft, setTimeEstimateDraft] = useState(step?.timeEstimate ?? '');
  const [dueDateDraft, setDueDateDraft] = useState(step?.dueDate ?? '');
  const [newAltLabel, setNewAltLabel] = useState('');
  const [newSubStepTitle, setNewSubStepTitle] = useState('');
  const [newAttachmentLabel, setNewAttachmentLabel] = useState('');
  const [titleDraft, setTitleDraft] = useState(step?.title ?? '');

  const clean = (v: string) => v.trim() || undefined;
  const dirty =
    !!step &&
    (titleDraft !== step.title ||
      notesDraft !== (step.notes ?? '') ||
      clean(resourcesDraft) !== step.resources ||
      clean(risksDraft) !== step.risks ||
      clean(timeEstimateDraft) !== step.timeEstimate ||
      clean(dueDateDraft) !== step.dueDate ||
      newAltLabel.trim() !== '' ||
      newSubStepTitle.trim() !== '' ||
      newAttachmentLabel.trim() !== '');

  const saveChanges = () => {
    if (!step) return;
    updateStep(planId, path, {
      title: titleDraft.trim() || step.title,
      notes: notesDraft,
      resources: clean(resourcesDraft),
      risks: clean(risksDraft),
      timeEstimate: clean(timeEstimateDraft),
      dueDate: clean(dueDateDraft),
    });
    if (newAltLabel.trim()) {
      addAlternative(planId, path, newAltLabel);
      setNewAltLabel('');
    }
    if (newSubStepTitle.trim()) {
      addStep(planId, path, newSubStepTitle);
      setNewSubStepTitle('');
    }
    if (newAttachmentLabel.trim()) {
      addAttachment(planId, path, newAttachmentLabel);
      setNewAttachmentLabel('');
    }
  };

  useBackHandler({ dirty, onSave: saveChanges });

  useLayoutEffect(() => {
    navigation.setOptions({ title: step?.title ?? 'Step' });
  }, [navigation, step?.title]);

  if (!step) {
    return (
      <Screen>
        <Body>This step no longer exists.</Body>
      </Screen>
    );
  }

  const snapshotRestore = () => {
    const previous = usePlanStore.getState().plans;
    return () => usePlanStore.setState({ plans: previous });
  };

  const confirmDelete = () => {
    requestDelete({
      message: `"${step.title}" and everything nested inside it will be removed.`,
      toastMessage: 'Step deleted',
      restore: snapshotRestore(),
      perform: () => {
        deleteStep(planId, path);
        navigation.goBack();
      },
    });
  };

  const confirmRemoveAlternative = (id: string, label: string) =>
    requestDelete({
      message: `Remove the alternative "${label}"?`,
      toastMessage: 'Alternative removed',
      restore: snapshotRestore(),
      perform: () => removeAlternative(planId, path, id),
    });

  const confirmRemoveAttachment = (id: string, label: string) =>
    requestDelete({
      message: `Remove "${label}"?`,
      toastMessage: 'Attachment removed',
      restore: snapshotRestore(),
      perform: () => removeAttachment(planId, path, id),
    });

  return (
    <Screen>
      <View style={styles.titleRow}>
        <Pressable hitSlop={8} onPress={() => toggleStepDone(planId, path)}>
          <Ionicons
            name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
            size={26}
            color={step.done ? colors.teal : colors.inkSoft}
          />
        </Pressable>
        <TextInput
          value={titleDraft}
          onChangeText={setTitleDraft}
          style={styles.titleInput}
          multiline
        />
        {dirty && <PrimaryButton label="Save" style={styles.saveButton} onPress={saveChanges} />}
      </View>

      <Pressable
        style={styles.moveToDailyButton}
        onPress={() => setMoveTarget({ path, title: step.title })}
      >
        <Ionicons name="calendar-outline" size={16} color={colors.teal} />
        <Body style={styles.moveToDailyText}> Move to Daily Planning</Body>
      </Pressable>

      <Card style={styles.section}>
        <Eyebrow>Priority</Eyebrow>
        <View style={styles.priorityRow}>
          {priorityOrder.map((p) => (
            <Pressable
              key={p}
              onPress={() => updateStep(planId, path, { priority: step.priority === p ? undefined : p })}
              style={[
                styles.priorityChip,
                { borderColor: priorityColors[p] },
                step.priority === p && { backgroundColor: priorityColors[p] },
              ]}
            >
              <Caption style={step.priority === p ? styles.priorityChipTextActive : { color: priorityColors[p] }}>
                {priorityLabels[p]}
              </Caption>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card style={styles.section}>
        <Eyebrow>Due date (optional)</Eyebrow>
        <TextInput
          value={dueDateDraft}
          onChangeText={setDueDateDraft}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.inkSoft}
          style={styles.fieldInput}
        />
      </Card>

      <Card style={styles.section}>
        <Eyebrow>Time estimate</Eyebrow>
        <TextInput
          value={timeEstimateDraft}
          onChangeText={setTimeEstimateDraft}
          placeholder="e.g. 2 hours, 3 days"
          placeholderTextColor={colors.inkSoft}
          style={styles.fieldInput}
        />
      </Card>

      <Card style={styles.section}>
        <Eyebrow>Resources needed</Eyebrow>
        <TextInput
          value={resourcesDraft}
          onChangeText={setResourcesDraft}
          placeholder="People, tools, money, time..."
          placeholderTextColor={colors.inkSoft}
          style={styles.notesInput}
          multiline
        />
      </Card>

      <Card style={styles.section}>
        <Eyebrow>Risks / blockers</Eyebrow>
        <Caption style={styles.helperText}>What could go wrong — not a backup plan, just something to watch for.</Caption>
        <TextInput
          value={risksDraft}
          onChangeText={setRisksDraft}
          placeholder="..."
          placeholderTextColor={colors.inkSoft}
          style={styles.notesInput}
          multiline
        />
      </Card>

      <Card style={styles.section}>
        <Caption>Notes</Caption>
        <TextInput
          value={notesDraft}
          onChangeText={setNotesDraft}
          placeholder="Add any details, links, or context..."
          placeholderTextColor={colors.inkSoft}
          style={styles.notesInput}
          multiline
        />
      </Card>

      <Card style={styles.section}>
        <Caption>Color tag</Caption>
        <View style={styles.colorRow}>
          <Pressable
            onPress={() => updateStep(planId, path, { color: undefined })}
            style={[styles.colorSwatch, styles.noColorSwatch, !step.color && styles.colorSwatchActive]}
          >
            <Ionicons name="close" size={14} color={colors.inkSoft} />
          </Pressable>
          {planStepColors.map((color) => (
            <Pressable
              key={color}
              onPress={() => updateStep(planId, path, { color })}
              style={[
                styles.colorSwatch,
                { backgroundColor: color },
                step.color === color && styles.colorSwatchActive,
              ]}
            />
          ))}
        </View>
      </Card>

      <Card style={styles.section}>
        <SectionHeading style={styles.sectionHeading}>Attachments</SectionHeading>
        <Caption style={styles.helperText}>Reference links or notes — actual file/photo uploads arrive later.</Caption>
        {step.attachments.map((att) => (
          <View key={att.id} style={styles.altRow}>
            <Ionicons name="link-outline" size={14} color={colors.teal} />
            <Body style={styles.altText}>{att.label}</Body>
            <Pressable hitSlop={8} onPress={() => confirmRemoveAttachment(att.id, att.label)}>
              <Ionicons name="close-circle-outline" size={20} color={colors.inkSoft} />
            </Pressable>
          </View>
        ))}
        <View style={styles.addRow}>
          <TextInput
            value={newAttachmentLabel}
            onChangeText={setNewAttachmentLabel}
            placeholder="Add a link or reference..."
            placeholderTextColor={colors.inkSoft}
            style={styles.addInput}
            onSubmitEditing={() => {
              addAttachment(planId, path, newAttachmentLabel);
              setNewAttachmentLabel('');
            }}
            returnKeyType="done"
          />
          <PrimaryButton
            label="Add"
            variant="outline"
            onPress={() => {
              addAttachment(planId, path, newAttachmentLabel);
              setNewAttachmentLabel('');
            }}
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <SectionHeading style={styles.sectionHeading}>Alternatives</SectionHeading>
        {step.alternatives.map((alt) => (
          <View key={alt.id} style={styles.altRow}>
            <Body style={styles.altText}>{alt.label}</Body>
            <Pressable hitSlop={8} onPress={() => confirmRemoveAlternative(alt.id, alt.label)}>
              <Ionicons name="close-circle-outline" size={20} color={colors.inkSoft} />
            </Pressable>
          </View>
        ))}
        <View style={styles.addRow}>
          <TextInput
            value={newAltLabel}
            onChangeText={setNewAltLabel}
            placeholder="Add an alternative..."
            placeholderTextColor={colors.inkSoft}
            style={styles.addInput}
            onSubmitEditing={() => {
              addAlternative(planId, path, newAltLabel);
              setNewAltLabel('');
            }}
            returnKeyType="done"
          />
          <PrimaryButton
            label="Add"
            variant="outline"
            onPress={() => {
              addAlternative(planId, path, newAltLabel);
              setNewAltLabel('');
            }}
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <SectionHeading style={styles.sectionHeading}>Sub-steps</SectionHeading>
        <Caption style={styles.helperText}>
          Checking every sub-step here also completes "{step.title}" — and unchecking one reopens it.
        </Caption>
        {step.subSteps.map((sub, i) => (
          <View key={sub.id} style={styles.subStepRow}>
            <Pressable hitSlop={8} onPress={() => toggleStepDone(planId, [...path, sub.id])}>
              <Ionicons
                name={sub.done ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={sub.done ? colors.teal : colors.inkSoft}
              />
            </Pressable>
            <Pressable
              onPress={() => navigation.push('planStepDetail', { planId, path: [...path, sub.id] })}
              style={styles.subStepMain}
            >
              <Body style={styles.subStepTitle}>{sub.title}</Body>
            </Pressable>
            <Pressable hitSlop={8} onPress={() => setMoveTarget({ path: [...path, sub.id], title: sub.title })}>
              <Ionicons name="calendar-outline" size={16} color={colors.teal} />
            </Pressable>
            <View style={styles.reorderCol}>
              <Pressable hitSlop={4} disabled={i === 0} onPress={() => moveStep(planId, [...path, sub.id], -1)}>
                <Ionicons name="chevron-up" size={14} color={i === 0 ? colors.line : colors.inkSoft} />
              </Pressable>
              <Pressable
                hitSlop={4}
                disabled={i === step.subSteps.length - 1}
                onPress={() => moveStep(planId, [...path, sub.id], 1)}
              >
                <Ionicons
                  name="chevron-down"
                  size={14}
                  color={i === step.subSteps.length - 1 ? colors.line : colors.inkSoft}
                />
              </Pressable>
            </View>
            <Pressable
              onPress={() => navigation.push('planStepDetail', { planId, path: [...path, sub.id] })}
              hitSlop={8}
            >
              <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
            </Pressable>
          </View>
        ))}
        <View style={styles.addRow}>
          <TextInput
            value={newSubStepTitle}
            onChangeText={setNewSubStepTitle}
            placeholder="Add a sub-step..."
            placeholderTextColor={colors.inkSoft}
            style={styles.addInput}
            onSubmitEditing={() => {
              addStep(planId, path, newSubStepTitle);
              setNewSubStepTitle('');
            }}
            returnKeyType="done"
          />
          <PrimaryButton
            label="Add"
            variant="outline"
            onPress={() => {
              addStep(planId, path, newSubStepTitle);
              setNewSubStepTitle('');
            }}
          />
        </View>
      </Card>

      <Pressable onPress={confirmDelete} style={styles.deleteRow}>
        <Ionicons name="trash-outline" size={18} color="#B3413A" />
        <Body style={styles.deleteText}>Delete this step</Body>
      </Pressable>

      <MoveToDailyPlanningSheet
        visible={!!moveTarget}
        stepTitle={moveTarget?.title ?? ''}
        onClose={() => setMoveTarget(null)}
        onConfirm={confirmMoveToDailyPlanning}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  saveButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  titleInput: {
    flex: 1,
    fontFamily: fonts.headingSemiBold,
    fontSize: 22,
    color: colors.ink,
    paddingTop: 0,
  },
  section: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionHeading: {
    marginBottom: 2,
  },
  helperText: {
    marginTop: -4,
  },
  fieldInput: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priorityChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1.5,
  },
  priorityChipTextActive: {
    color: colors.white,
  },
  notesInput: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  colorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noColorSwatch: {
    backgroundColor: colors.stone,
    borderWidth: 1,
    borderColor: colors.line,
  },
  colorSwatchActive: {
    borderColor: colors.ink,
  },
  altRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  altText: {
    flex: 1,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  addInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 4,
  },
  subStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  subStepMain: {
    flex: 1,
  },
  subStepTitle: {},
  reorderCol: {
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  moveToDailyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  moveToDailyText: {
    color: colors.teal,
    fontFamily: fonts.bodyMedium,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  deleteText: {
    color: '#B3413A',
  },
}));
