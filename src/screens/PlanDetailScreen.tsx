import React, { useState } from 'react';
import { Pressable, Share, Switch, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBackHandler } from '../hooks/useBackHandler';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { SheetModal } from '../components/SheetModal';
import { PlanMap } from '../components/PlanMap';
import { MoveToDailyPlanningSheet } from '../components/MoveToDailyPlanningSheet';
import { useUi } from '../components/UiProvider';
import { SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing, radii, fonts } from '../theme';
import { withAlpha } from '../utils/color';
import { usePlanStore, computePlanProgress } from '../store/usePlanStore';
import { useDailyPlanningStore } from '../store/useDailyPlanningStore';
import { priorityColors } from '../data/planPriority';
import { planToText } from '../utils/planExport';
import type { PlanStep } from '../types/sections';
import type { RootStackParamList } from '../navigation/types';
import { themedStyles } from '../theme/runtime';
import { parseWholeNumberInput } from '../utils/numberInput';
import { deletePlanKeepingTasks } from '../utils/planLinks';

type Props = NativeStackScreenProps<RootStackParamList, 'planDetail'>;

const altAccent = '#8B72B0';

function StepRow({
  step,
  path,
  depth,
  index,
  siblingCount,
  onPress,
  onToggleDone,
  onMove,
  onMoveToDaily,
}: {
  step: PlanStep;
  path: string[];
  depth: number;
  index: number;
  siblingCount: number;
  onPress: (path: string[]) => void;
  onToggleDone: (path: string[]) => void;
  onMove: (path: string[], direction: -1 | 1) => void;
  onMoveToDaily: (path: string[], title: string) => void;
}) {
  const isFirst = index === 0;
  const isLast = index === siblingCount - 1;
  return (
    <View>
      <Pressable onPress={() => onPress(path)} style={({ pressed }) => pressed && styles.pressed}>
        <Card style={styles.stepCard}>
          {depth === 0 ? (
            <View style={styles.stepIndexBadge}>
              <Caption style={styles.stepIndexText}>{index + 1}</Caption>
            </View>
          ) : (
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!(step.done) }} accessibilityLabel="Done" hitSlop={8} onPress={() => onToggleDone(path)}>
              <Ionicons
                name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={step.done ? colors.teal : colors.inkSoft}
              />
            </Pressable>
          )}
          <View style={styles.stepMain}>
            <Body style={[styles.stepTitle, step.done && styles.stepTitleDone]}>{step.title}</Body>
            {(step.dueDate || step.priority) && (
              <View style={styles.stepSubMeta}>
                {step.priority && (
                  <View style={styles.priorityDotWrap}>
                    <View style={[styles.priorityDot, { backgroundColor: priorityColors[step.priority] }]} />
                    <Caption>{step.priority}</Caption>
                  </View>
                )}
                {step.dueDate && <Caption>Due {step.dueDate}</Caption>}
              </View>
            )}
          </View>
          {step.color ? <View style={[styles.colorDot, { backgroundColor: step.color }]} /> : null}
          <View style={styles.stepMeta}>
            {step.subSteps.length > 0 && (
              <View style={[styles.countPill, { backgroundColor: withAlpha(colors.teal, 0.16) }]}>
                <Caption style={[styles.countPillText, { color: colors.teal }]}>{step.subSteps.length} sub</Caption>
              </View>
            )}
            {step.alternatives.length > 0 && (
              <View style={[styles.countPill, { backgroundColor: withAlpha(altAccent, 0.16) }]}>
                <Caption style={[styles.countPillText, { color: altAccent }]}>{step.alternatives.length} alt</Caption>
              </View>
            )}
          </View>
          {depth === 0 && (
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!(step.done) }} accessibilityLabel="Done" hitSlop={8} onPress={() => onToggleDone(path)}>
              <Ionicons
                name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={step.done ? colors.teal : colors.inkSoft}
              />
            </Pressable>
          )}
          <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
        </Card>
      </Pressable>

      <View style={styles.stepActionsRow}>
        <Pressable hitSlop={8} onPress={() => onMoveToDaily(path, step.title)} style={styles.stepActionButton}>
          <Ionicons name="calendar-outline" size={14} color={colors.teal} />
          <Caption style={styles.stepActionText}> Move to Daily Planning</Caption>
        </Pressable>
        <View style={styles.reorderCol}>
          <Pressable accessibilityRole="button" accessibilityLabel="Move up" hitSlop={4} disabled={isFirst} onPress={() => onMove(path, -1)}>
            <Ionicons name="chevron-up" size={16} color={isFirst ? colors.line : colors.inkSoft} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Move down" hitSlop={4} disabled={isLast} onPress={() => onMove(path, 1)}>
            <Ionicons name="chevron-down" size={16} color={isLast ? colors.line : colors.inkSoft} />
          </Pressable>
        </View>
      </View>

      {step.subSteps.length > 0 && (
        <View style={styles.nestedGroup}>
          {step.subSteps.map((sub, i) => (
            <StepRow
              key={sub.id}
              step={sub}
              path={[...path, sub.id]}
              depth={depth + 1}
              index={i}
              siblingCount={step.subSteps.length}
              onPress={onPress}
              onToggleDone={onToggleDone}
              onMove={onMove}
              onMoveToDaily={onMoveToDaily}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export function PlanDetailScreen({ route, navigation }: Props) {
  const { planId } = route.params;
  const plan = usePlanStore((s) => s.plans.find((p) => p.id === planId));
  const setPlanTitle = usePlanStore((s) => s.setPlanTitle);
  const setMotive = usePlanStore((s) => s.setMotive);
  const addStep = usePlanStore((s) => s.addStep);
  const moveStep = usePlanStore((s) => s.moveStep);
  const toggleStepDone = usePlanStore((s) => s.toggleStepDone);
  const setPlanTags = usePlanStore((s) => s.setPlanTags);
  const setReviewInterval = usePlanStore((s) => s.setReviewInterval);
  const archivePlan = usePlanStore((s) => s.archivePlan);
  const reopenPlan = usePlanStore((s) => s.reopenPlan);
  const saveAsTemplate = usePlanStore((s) => s.saveAsTemplate);
  const addLinkedTask = useDailyPlanningStore((s) => s.addLinkedTask);
  const setScheduledTime = useDailyPlanningStore((s) => s.setScheduledTime);
  const { requestDelete, showToast } = useUi();

  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [titleDraft, setTitleDraft] = useState(plan?.title ?? '');
  const [motiveDraft, setMotiveDraft] = useState(plan?.motive ?? '');
  const [newStepTitle, setNewStepTitle] = useState('');
  const [tagsDraft, setTagsDraft] = useState(plan?.tags.join(', ') ?? '');
  const [reviewOn, setReviewOn] = useState(!!plan?.reviewIntervalDays);
  const [reviewDays, setReviewDays] = useState(String(plan?.reviewIntervalDays ?? 14));
  const [moveTarget, setMoveTarget] = useState<{ path: string[]; title: string } | null>(null);

  const parseTags = (raw: string) => raw.split(',').map((t) => t.trim()).filter(Boolean);
  const dirty =
    !!plan &&
    (titleDraft !== plan.title ||
      motiveDraft !== plan.motive ||
      parseTags(tagsDraft).join(',') !== plan.tags.join(',') ||
      newStepTitle.trim() !== '');

  const saveChanges = () => {
    if (!plan) return;
    if (titleDraft !== plan.title) setPlanTitle(planId, titleDraft.trim() || plan.title);
    if (motiveDraft !== plan.motive) setMotive(planId, motiveDraft);
    if (parseTags(tagsDraft).join(',') !== plan.tags.join(',')) setPlanTags(planId, parseTags(tagsDraft));
    if (newStepTitle.trim()) {
      addStep(planId, [], newStepTitle);
      setNewStepTitle('');
    }
  };

  const confirmMoveToDailyPlanning = (date: string, time: string | undefined) => {
    if (!moveTarget) return;
    const taskId = addLinkedTask(date, planId, moveTarget.path);
    if (time) setScheduledTime(taskId, time);
    showToast({ message: `Added to Daily Planning for ${date}` });
  };

  useBackHandler({ dirty, onSave: saveChanges });

  const [archiveModalVisible, setArchiveModalVisible] = useState(false);
  const [worked, setWorked] = useState('');
  const [differently, setDifferently] = useState('');

  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  if (!plan) {
    return (
      <Screen>
        <Body>This plan no longer exists.</Body>
      </Screen>
    );
  }

  const confirmDeletePlan = () => {
    // Tasks already moved into your days stay there, as normal tasks.
    let undo: (() => void) | undefined;
    requestDelete({
      message: `"${plan.title}" and all of its steps will be removed. Steps already moved into your days stay there as normal tasks.`,
      toastMessage: 'Plan deleted',
      perform: () => {
        undo = deletePlanKeepingTasks(planId);
        navigation.goBack();
      },
      restore: () => undo?.(),
    });
  };

  const openStep = (path: string[]) => navigation.navigate('planStepDetail', { planId, path });
  const progress = computePlanProgress(plan.steps);

  return (
    <Screen>
      <View style={styles.viewToggleRow}>
        <View style={styles.segmented}>
          {(['list', 'map'] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setViewMode(mode)}
              style={[styles.segment, viewMode === mode && styles.segmentActive]}
            >
              <Caption style={[styles.segmentText, viewMode === mode && styles.segmentTextActive]}>
                {mode === 'list' ? 'List' : 'Map'}
              </Caption>
            </Pressable>
          ))}
        </View>
        <View style={styles.actionIcons}>
          <Pressable accessibilityRole="button" accessibilityLabel="Save as template"
            hitSlop={8}
            onPress={() => setTemplateModalVisible(true)}
            style={styles.actionIcon}
          >
            <Ionicons name="bookmark-outline" size={20} color={colors.inkSoft} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Share plan"
            hitSlop={8}
            onPress={() => Share.share({ message: planToText(plan) })}
            style={styles.actionIcon}
          >
            <Ionicons name="share-outline" size={20} color={colors.inkSoft} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Delete plan" hitSlop={8} onPress={confirmDeletePlan} style={styles.actionIcon}>
            <Ionicons name="trash-outline" size={20} color="#B3413A" />
          </Pressable>
          {plan.status === 'active' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Archive plan" hitSlop={8} onPress={() => setArchiveModalVisible(true)} style={styles.actionIcon}>
              <Ionicons name="archive-outline" size={20} color={colors.inkSoft} />
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Reopen plan" hitSlop={8} onPress={() => reopenPlan(plan.id)} style={styles.actionIcon}>
              <Ionicons name="refresh-outline" size={20} color={colors.inkSoft} />
            </Pressable>
          )}
        </View>
      </View>

      {dirty && (
        <PrimaryButton label="Save changes" style={styles.saveBar} onPress={saveChanges} />
      )}

      <Card style={styles.progressCard}>
        <View style={styles.progressHeaderRow}>
          <Eyebrow>Progress</Eyebrow>
          <Caption>
            {progress.done}/{progress.total} steps · {progress.percent}%
          </Caption>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress.percent}%`, backgroundColor: plan.color }]} />
        </View>
      </Card>

      <Card style={styles.titleCard}>
        <Eyebrow>What this plan is</Eyebrow>
        <TextInput
          value={titleDraft}
          onChangeText={setTitleDraft}
          style={styles.titleInput}
          placeholder="e.g. Learn guitar, Move to a new city..."
          placeholderTextColor={colors.inkSoft}
          multiline
        />
      </Card>

      <Card style={[styles.motiveCard, { backgroundColor: plan.color }]}>
        <Eyebrow style={styles.motiveLabel}>Your Motive</Eyebrow>
        <TextInput
          value={motiveDraft}
          onChangeText={setMotiveDraft}
          style={styles.motiveInput}
          placeholder="Why do you want to do this?"
          placeholderTextColor="rgba(255,255,255,0.7)"
          multiline
        />
      </Card>

      <Card style={styles.metaCard}>
        <Eyebrow>Tags</Eyebrow>
        <TextInput
          value={tagsDraft}
          onChangeText={setTagsDraft}
          placeholder="music, confidence, ..."
          placeholderTextColor={colors.inkSoft}
          style={styles.tagsInput}
        />
      </Card>

      <Card style={styles.metaCard}>
        <View style={styles.reviewRow}>
          <View style={styles.reviewLabelWrap}>
            <Eyebrow>Review reminders</Eyebrow>
            <Caption>Nudges you to revisit this plan periodically</Caption>
          </View>
          <Switch
            value={reviewOn}
            onValueChange={(v) => {
              setReviewOn(v);
              setReviewInterval(planId, v ? Number(reviewDays) || 14 : undefined);
            }}
            trackColor={{ true: colors.teal, false: colors.line }}
          />
        </View>
        {reviewOn && (
          <View style={styles.reviewIntervalRow}>
            <Caption>Every</Caption>
            <TextInput
              value={reviewDays}
              onChangeText={(v) => {
                setReviewDays(v);
                setReviewInterval(planId, parseWholeNumberInput(v) || 14);
              }}
              keyboardType="number-pad"
              style={styles.reviewDaysInput}
            />
            <Caption>days</Caption>
          </View>
        )}
      </Card>

      {viewMode === 'list' ? (
        <View style={styles.stepsSection}>
          {plan.steps.map((step, i) => (
            <StepRow
              key={step.id}
              step={step}
              path={[step.id]}
              depth={0}
              index={i}
              siblingCount={plan.steps.length}
              onPress={openStep}
              onToggleDone={(path) => toggleStepDone(planId, path)}
              onMove={(path, direction) => moveStep(planId, path, direction)}
              onMoveToDaily={(path, title) => setMoveTarget({ path, title })}
            />
          ))}
        </View>
      ) : (
        <View style={styles.stepsSection}>
          {plan.steps.length === 0 ? (
            <Body style={styles.emptyText}>Add a step to see your plan's map.</Body>
          ) : (
            <PlanMap plan={plan} onPressStep={openStep} />
          )}
          <Caption>Solid lines are steps and sub-steps; dashed violet branches are alternatives. Tap a node to edit it.</Caption>
        </View>
      )}

      <Card style={styles.addStepCard}>
        <TextInput
          value={newStepTitle}
          onChangeText={setNewStepTitle}
          placeholder="Add a step..."
          placeholderTextColor={colors.inkSoft}
          style={styles.addStepInput}
          onSubmitEditing={() => {
            addStep(planId, [], newStepTitle);
            setNewStepTitle('');
          }}
          returnKeyType="done"
        />
        <PrimaryButton
          label="Add"
          onPress={() => {
            addStep(planId, [], newStepTitle);
            setNewStepTitle('');
          }}
        />
      </Card>

      <SheetModal visible={archiveModalVisible} onClose={() => setArchiveModalVisible(false)}>
        <>
            <SectionHeading style={styles.modalTitle}>Archive this plan</SectionHeading>
            <Caption style={styles.modalSubtitle}>A quick reflection before you put it away.</Caption>
            <Eyebrow style={styles.fieldLabel}>What worked?</Eyebrow>
            <TextInput
              value={worked}
              onChangeText={setWorked}
              style={styles.modalInput}
              multiline
              placeholder="..."
              placeholderTextColor={colors.inkSoft}
            />
            <Eyebrow style={styles.fieldLabel}>What would you do differently?</Eyebrow>
            <TextInput
              value={differently}
              onChangeText={setDifferently}
              style={styles.modalInput}
              multiline
              placeholder="..."
              placeholderTextColor={colors.inkSoft}
            />
            <View style={styles.modalActions}>
              <PrimaryButton label="Cancel" variant="outline" onPress={() => setArchiveModalVisible(false)} />
              <PrimaryButton
                label="Archive"
                onPress={() => {
                  archivePlan(planId, { worked, differently });
                  setArchiveModalVisible(false);
                  navigation.goBack();
                }}
              />
            </View>
        </>
      </SheetModal>

      <SheetModal visible={templateModalVisible} onClose={() => setTemplateModalVisible(false)}>
        <>
            <SectionHeading style={styles.modalTitle}>Save as template</SectionHeading>
            <Caption style={styles.modalSubtitle}>Reuse this plan's shape for something similar later.</Caption>
            <Eyebrow style={styles.fieldLabel}>Template name</Eyebrow>
            <TextInput
              value={templateName}
              onChangeText={setTemplateName}
              style={styles.modalInputSingle}
              placeholder="e.g. Songwriting sprint"
              placeholderTextColor={colors.inkSoft}
            />
            <Eyebrow style={styles.fieldLabel}>Description</Eyebrow>
            <TextInput
              value={templateDescription}
              onChangeText={setTemplateDescription}
              style={styles.modalInputSingle}
              placeholder="What is this template for?"
              placeholderTextColor={colors.inkSoft}
            />
            <View style={styles.modalActions}>
              <PrimaryButton label="Cancel" variant="outline" onPress={() => setTemplateModalVisible(false)} />
              <PrimaryButton
                label="Save"
                onPress={() => {
                  if (templateName.trim()) {
                    saveAsTemplate(planId, templateName.trim(), templateDescription.trim());
                  }
                  setTemplateModalVisible(false);
                  setTemplateName('');
                  setTemplateDescription('');
                }}
              />
            </View>
        </>
      </SheetModal>

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
  segment: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
  },
  segmentActive: {
    backgroundColor: colors.teal,
  },
  segmentText: {
    fontFamily: fonts.bodyMedium,
  },
  segmentTextActive: {
    color: colors.white,
  },
  actionIcons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBar: {
    marginBottom: spacing.md,
  },
  progressCard: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTrack: {
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.stone,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: radii.full,
  },
  titleCard: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  titleInput: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
    padding: 0,
  },
  motiveCard: {
    backgroundColor: colors.teal,
    marginBottom: spacing.md,
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  motiveLabel: {
    color: colors.amber,
  },
  motiveInput: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.white,
    padding: 0,
  },
  metaCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tagsInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reviewLabelWrap: {
    flex: 1,
    gap: 2,
  },
  reviewIntervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reviewDaysInput: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    width: 40,
    textAlign: 'center',
  },
  stepsSection: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  pressed: {
    opacity: 0.85,
  },
  emptyText: {
    color: colors.inkSoft,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepIndexBadge: {
    width: 26,
    height: 26,
    borderRadius: radii.full,
    backgroundColor: withAlpha(colors.teal, 0.18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndexText: {
    color: colors.teal,
    fontFamily: fonts.bodyMedium,
  },
  stepMain: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {},
  stepTitleDone: {
    textDecorationLine: 'line-through',
    color: colors.inkSoft,
  },
  stepSubMeta: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priorityDotWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: radii.full,
  },
  stepMeta: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  countPill: {
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.full,
  },
  countPillText: {
    fontSize: 11,
    lineHeight: 14,
  },
  stepActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginTop: 2,
  },
  stepActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepActionText: {
    color: colors.teal,
  },
  reorderCol: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  nestedGroup: {
    marginLeft: spacing.lg + 4,
    marginTop: spacing.sm,
    gap: spacing.sm,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.line,
  },
  mapNodeWrap: {
    position: 'relative',
  },
  mapLine: {
    position: 'absolute',
    left: 18,
    top: -spacing.sm,
    bottom: -spacing.sm,
    width: 2,
    backgroundColor: colors.line,
  },
  mapNode: {
    gap: spacing.xs,
  },
  mapNodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mapAltRow: {
    gap: 2,
    marginLeft: spacing.lg,
  },
  mapAltChip: {},
  mapSubList: {
    gap: 2,
    marginLeft: spacing.lg,
  },
  addStepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addStepInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    gap: spacing.xs,
  },
  modalTitle: {},
  modalSubtitle: {
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    marginTop: spacing.sm,
  },
  modalInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    minHeight: 50,
    textAlignVertical: 'top',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 4,
  },
  modalInputSingle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
}));
