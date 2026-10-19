import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { SheetModal } from '../components/SheetModal';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing, radii, fonts } from '../theme';
import { withAlpha } from '../utils/color';
import { usePlanStore, computePlanProgress } from '../store/usePlanStore';
import { builtInPlanTemplates } from '../data/planTemplates';
import { planColorPalette } from '../data/planStepColors';
import type { PlanTemplate } from '../data/planTemplates';
import type { RootStackParamList } from '../navigation/types';
import { themedStyles } from '../theme/runtime';
import { SeeHowItWorks } from '../discover/SeeHowItWorks';

type Props = NativeStackScreenProps<RootStackParamList, 'planBuilder'>;

type StatusFilter = 'active' | 'archived';

export function PlanListScreen({ navigation }: Props) {
  const plans = usePlanStore((s) => s.plans);
  const personalTemplates = usePlanStore((s) => s.personalTemplates);
  const createPlan = usePlanStore((s) => s.createPlan);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [query, setQuery] = useState('');

  // New-plan flow: step 1 = choose a starting point, step 2 = what it is
  // (title) then why (motive), plus color. Title is asked first — describe
  // what you're planning before being asked why you want to do it.
  const [sheetVisible, setSheetVisible] = useState(false);
  const [step, setStep] = useState<'start' | 'setup'>('start');
  const [chosenSteps, setChosenSteps] = useState<PlanTemplate['steps'] | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [motive, setMotive] = useState('');
  const [color, setColor] = useState(planColorPalette[0]);

  const filtered = plans.filter((p) => {
    if (p.status !== statusFilter) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return p.title.toLowerCase().includes(q) || p.motive.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q));
  });

  const openSheet = () => {
    setStep('start');
    setChosenSteps(undefined);
    setTitle('');
    setMotive('');
    setColor(planColorPalette[0]);
    setSheetVisible(true);
  };

  const chooseStart = (templateName: string, templateMotive: string, steps?: PlanTemplate['steps']) => {
    setTitle(templateName);
    setMotive(templateMotive);
    setChosenSteps(steps);
    setStep('setup');
  };

  const finishCreate = () => {
    const id = createPlan(title, motive, color, chosenSteps);
    setSheetVisible(false);
    navigation.navigate('planDetail', { planId: id });
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={styles.headerIconWrap}>
          <Ionicons name="compass-outline" size={24} color={colors.amber} />
        </View>
        <ScreenTitle>Plan Builder</ScreenTitle>
      </View>
      <Caption style={styles.subtitle}>What it is → Motive → Steps → Alternatives</Caption>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search plans by motive or tag..."
        placeholderTextColor={colors.inkSoft}
        style={styles.searchInput}
      />

      <View style={styles.filterRow}>
        {(['active', 'archived'] as StatusFilter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setStatusFilter(f)}
            style={[styles.filterChip, statusFilter === f && styles.filterChipActive]}
          >
            <Body style={[styles.filterChipText, statusFilter === f && styles.filterChipTextActive]}>
              {f === 'active' ? 'Active' : 'Archived'}
            </Body>
          </Pressable>
        ))}
      </View>

      <View style={styles.list}>
        {filtered.length === 0 && (
          <Body style={styles.emptyText}>
            {statusFilter === 'active' ? 'No active plans yet — start one below.' : 'No archived plans yet.'}
          </Body>
        )}
        {filtered.length === 0 && statusFilter === 'active' && <SeeHowItWorks sectionId="planBuilder" />}
        {filtered.map((plan) => {
          const progress = computePlanProgress(plan.steps);
          return (
            <Pressable key={plan.id} onPress={() => navigation.navigate('planDetail', { planId: plan.id })}>
              <Card style={[styles.planCard, { borderLeftColor: plan.color, borderLeftWidth: 4 }]}>
                <View style={styles.planHeader}>
                  <SectionHeading style={styles.planTitle}>{plan.title}</SectionHeading>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
                </View>
                {plan.tags.length > 0 && (
                  <Caption style={[styles.tagsText, { color: plan.color }]}>
                    {plan.tags.map((t) => `#${t}`).join('  ')}
                  </Caption>
                )}
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress.percent}%`, backgroundColor: plan.color }]} />
                </View>
                <Caption>
                  {progress.done}/{progress.total} steps done
                  {plan.status === 'archived' ? ' · Archived' : ''}
                </Caption>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <PrimaryButton label="New Plan" style={styles.newPlanButton} onPress={openSheet} />

      <SheetModal visible={sheetVisible} onClose={() => setSheetVisible(false)}>
        <View style={styles.modalHeader}>
          <SectionHeading>{step === 'start' ? 'Start a new plan' : 'Set up your plan'}</SectionHeading>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={() => setSheetVisible(false)}>
            <Ionicons name="close" size={22} color={colors.inkSoft} />
          </Pressable>
        </View>

        {step === 'start' ? (
          <>
            <Pressable onPress={() => chooseStart('', '')} style={styles.templateRow}>
              <Ionicons name="add-circle-outline" size={20} color={colors.teal} />
              <View style={styles.templateInfo}>
                <Body style={styles.templateName}>Start from scratch</Body>
                <Caption>A blank plan you fill in yourself</Caption>
              </View>
            </Pressable>

            <Eyebrow style={styles.templateSectionLabel}>Templates</Eyebrow>
            {builtInPlanTemplates.map((t) => (
              <Pressable key={t.id} onPress={() => chooseStart(t.name, t.motive, t.steps)} style={styles.templateRow}>
                <Ionicons name="sparkles-outline" size={20} color={colors.amber} />
                <View style={styles.templateInfo}>
                  <Body style={styles.templateName}>{t.name}</Body>
                  <Caption>{t.description}</Caption>
                </View>
              </Pressable>
            ))}

            {personalTemplates.length > 0 && (
              <>
                <Eyebrow style={styles.templateSectionLabel}>Your templates</Eyebrow>
                {personalTemplates.map((t) => (
                  <Pressable key={t.id} onPress={() => chooseStart(t.name, t.motive, t.steps)} style={styles.templateRow}>
                    <Ionicons name="bookmark-outline" size={20} color={colors.teal} />
                    <View style={styles.templateInfo}>
                      <Body style={styles.templateName}>{t.name}</Body>
                      <Caption>{t.description}</Caption>
                    </View>
                  </Pressable>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            <Eyebrow style={styles.fieldLabel}>What is this plan?</Eyebrow>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Learn guitar, Move to a new city..."
              placeholderTextColor={colors.inkSoft}
              style={styles.motiveInput}
              multiline
              autoFocus
            />

            <Eyebrow style={styles.fieldLabel}>Your motive</Eyebrow>
            <TextInput
              value={motive}
              onChangeText={setMotive}
              placeholder="Why do you want to do this?"
              placeholderTextColor={colors.inkSoft}
              style={styles.motiveInputSmall}
              multiline
            />

            <Eyebrow style={styles.fieldLabel}>Plan color</Eyebrow>
            <View style={styles.colorRow}>
              {planColorPalette.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSwatchActive]}
                >
                  {color === c && <Ionicons name="checkmark" size={16} color={colors.white} />}
                </Pressable>
              ))}
            </View>

            <View style={styles.setupActions}>
              <PrimaryButton label="Back" variant="outline" style={styles.setupButton} onPress={() => setStep('start')} />
              <PrimaryButton
                label="Create plan"
                style={styles.setupButton}
                disabled={!title.trim()}
                onPress={finishCreate}
              />
            </View>
          </>
        )}
      </SheetModal>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: withAlpha(colors.amber, 0.16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    marginBottom: spacing.lg,
  },
  searchInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  filterChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  filterChipText: {
    fontFamily: fonts.bodyMedium,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  list: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  emptyText: {
    color: colors.inkSoft,
  },
  planCard: {
    gap: spacing.xs,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  planTitle: {
    flex: 1,
  },
  tagsText: {},
  progressTrack: {
    height: 6,
    borderRadius: radii.full,
    backgroundColor: colors.stone,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.full,
  },
  newPlanButton: {
    marginBottom: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  templateSectionLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontFamily: fonts.bodyMedium,
  },
  fieldLabel: {
    marginTop: spacing.sm,
  },
  motiveInput: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 20,
    color: colors.ink,
    minHeight: 60,
    textAlignVertical: 'top',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: spacing.sm,
  },
  motiveInputSmall: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    minHeight: 44,
    textAlignVertical: 'top',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: spacing.sm,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorSwatch: {
    width: 38,
    height: 38,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchActive: {
    borderColor: colors.ink,
  },
  setupActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  setupButton: {
    flex: 1,
  },
}));
