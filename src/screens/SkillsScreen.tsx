import React, { useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { SheetModal } from '../components/SheetModal';
import { TimePickerModal } from '../components/TimePickerModal';
import { EntryDetailView } from '../components/EntryDetailView';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { StatRow } from '../components/AnalysisParts';
import { colors, radii, spacing, fonts } from '../theme';
import { sectionAccents } from '../theme/accents';
import { withAlpha } from '../utils/color';
import { useBackHandler } from '../hooks/useBackHandler';
import { useUi } from '../components/UiProvider';
import { todayISO, addDaysISO, formatDisplayDate, formatClockTime } from '../utils/date';
import { daysBetweenISO } from '../utils/feelingsStats';
import { shareSkillPortfolioAsText, exportSkillPortfolioAsPdf } from '../utils/skillExport';
import { skillColorOptions, skillIconOptions, skillTypeMeta, skillTypeOptions, sessionTagOptions } from '../data/skillPresets';
import { isSkillAnalysisAvailable } from '../config/skillAnalysis';
import { useSkillsStore, skillPracticeStreak, resurfaceOldSession, type PracticeSessionInput } from '../store/useSkillsStore';
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_ORDER,
  LEVEL_LABELS,
  activeMetrics,
  activeSubSkills,
  describeMetricChange,
  formatHours,
  lastSessionStruggles,
  metricChange,
  metricSeries,
  primaryMetric,
  skillSessionsChrono,
  suggestedFocus,
  totalMinutesFor,
  weeklyGoalProgress,
} from '../utils/skillProgress';
import { SkillSetupSheet, LevelDots } from './SkillSetupSheet';
import { SkillAnalysisStage, DIFFICULTY_COLORS } from './SkillAnalysis';
import { SkillJourneyStage } from './SkillJourney';
import { MilestoneAchieveSheet, ProgressRing, SessionDetails } from './SkillParts';
import type { FeedbackSource, SessionDifficulty, Skill, SkillMilestone, SkillType } from '../types/sections';
import { themedStyles } from '../theme/runtime';
import { ItemFeelingPrompt } from '../components/ItemFeelingSheet';
import { shouldAskItemFeeling } from '../utils/itemFeelings';
import { useSettingsStore } from '../store/useSettingsStore';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { SeeHowItWorks } from '../discover/SeeHowItWorks';
import { parseNumberInput, parseWholeNumberInput } from '../utils/numberInput';

const accent = sectionAccents.skills;

type Props = NativeStackScreenProps<RootStackParamList, 'skills'>;

type ScreenState =
  | { kind: 'overview' }
  | { kind: 'folder'; skillId: string; openSetup?: boolean }
  | { kind: 'sessionDetail'; skillId: string; sessionId: string }
  | { kind: 'milestoneDetail'; skillId: string; milestoneId: string }
  | { kind: 'analysis'; skillId: string }
  | { kind: 'journey'; skillId: string };

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
function AddSkillSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (id: string, setUp: boolean) => void }) {
  const addSkill = useSkillsStore((s) => s.addSkill);
  const [name, setName] = useState('');
  const [color, setColor] = useState(skillColorOptions[0]);
  const [icon, setIcon] = useState(skillIconOptions[0]);
  const [type, setType] = useState<SkillType | undefined>(undefined);
  const [startOffset, setStartOffset] = useState<'today' | 'week' | 'month' | 'year'>('today');

  const reset = () => {
    setName('');
    setColor(skillColorOptions[0]);
    setIcon(skillIconOptions[0]);
    setType(undefined);
    setStartOffset('today');
  };

  const startDateFor = (offset: typeof startOffset) => {
    if (offset === 'week') return addDaysISO(todayISO(), -7);
    if (offset === 'month') return addDaysISO(todayISO(), -30);
    if (offset === 'year') return addDaysISO(todayISO(), -365);
    return todayISO();
  };

  const create = (setUp: boolean) => {
    const id = addSkill(name, color, icon, type, startDateFor(startOffset));
    reset();
    onClose();
    onCreated(id, setUp);
  };

  return (
    <SheetModal
      visible={visible}
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <SectionHeading>New skill</SectionHeading>

      <Eyebrow style={styles.fieldLabel}>Name</Eyebrow>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. Guitar, Spanish, Chess" placeholderTextColor={colors.inkSoft} style={styles.sheetInput} />

      <Eyebrow style={styles.fieldLabel}>Color</Eyebrow>
      <View style={styles.swatchRow}>
        {skillColorOptions.map((c, i) => (
          <Pressable key={c} onPress={() => setColor(c)} accessibilityRole="radio" accessibilityState={{ selected: color === c }} accessibilityLabel={`Color ${i + 1} of ${skillColorOptions.length}`} style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.swatchActive]} />
        ))}
      </View>

      <Eyebrow style={styles.fieldLabel}>Icon</Eyebrow>
      <View style={styles.swatchRow}>
        {skillIconOptions.map((i) => (
          <Pressable accessibilityRole="radio" accessibilityState={{ selected: icon === i }} accessibilityLabel={`Icon: ${String(i).replace(/-outline$/, '').replace(/-/g, ' ')}`} key={i} onPress={() => setIcon(i)} style={[styles.iconSwatch, icon === i && { backgroundColor: withAlpha(color, 0.25), borderColor: color }]}>
            <Ionicons name={i} size={18} color={icon === i ? color : colors.inkSoft} />
          </Pressable>
        ))}
      </View>

      <Eyebrow style={styles.fieldLabel}>Type (optional — suggests sub-skills and metrics)</Eyebrow>
      <View style={styles.chipRow}>
        {skillTypeOptions.map((t) => (
          <Pressable key={t} onPress={() => setType(type === t ? undefined : t)} style={[styles.chip, type === t && { backgroundColor: accent }]}>
            <Body style={type === t ? styles.chipTextActive : undefined}>{skillTypeMeta[t].label}</Body>
          </Pressable>
        ))}
      </View>

      <Eyebrow style={styles.fieldLabel}>Practicing since</Eyebrow>
      <View style={styles.chipRow}>
        {([
          ['today', 'Today'],
          ['week', 'A week ago'],
          ['month', 'A month ago'],
          ['year', 'A year ago'],
        ] as [typeof startOffset, string][]).map(([val, label]) => (
          <Pressable key={val} onPress={() => setStartOffset(val)} style={[styles.chip, startOffset === val && { backgroundColor: accent }]}>
            <Body style={startOffset === val ? styles.chipTextActive : undefined}>{label}</Body>
          </Pressable>
        ))}
      </View>

      <View style={styles.rowGap}>
        <PrimaryButton label="Create" variant="outline" disabled={!name.trim()} onPress={() => create(false)} style={styles.flex} />
        <PrimaryButton label="Create & set up" disabled={!name.trim()} onPress={() => create(true)} style={styles.flex} />
      </View>
      <Caption style={styles.hint}>Setting up (level, goal, sub-skills, a metric) is optional — you can do it any time.</Caption>
    </SheetModal>
  );
}

// ---------------------------------------------------------------------------
function OverviewStage({ onOpenSkill }: { onOpenSkill: (skillId: string, setUp?: boolean) => void }) {
  const skills = useSkillsStore((s) => s.skills);
  const sessions = useSkillsStore((s) => s.sessions);
  const [addOpen, setAddOpen] = useState(false);

  const active = skills.filter((s) => !s.archivedAt);
  const archived = skills.filter((s) => s.archivedAt);

  const renderCard = (skill: Skill) => {
    const level = skill.currentLevel ?? skill.startingLevel;
    return (
      <Pressable key={skill.id} onPress={() => onOpenSkill(skill.id)}>
        <Card style={[styles.skillCard, { borderLeftColor: skill.color, borderLeftWidth: 3 }]}>
          <View style={[styles.skillIconWrap, { backgroundColor: withAlpha(skill.color, 0.18) }]}>
            <Ionicons name={skill.icon} size={22} color={skill.color} />
          </View>
          <View style={styles.skillCardBody}>
            <Body>{skill.name}</Body>
            <Caption>
              {formatHours(totalMinutesFor(sessions, skill.id))} invested{level ? ` · ${LEVEL_LABELS[level]}` : ''}
            </Caption>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
        </Card>
      </Pressable>
    );
  };

  return (
    <>
      <ScreenTitle>Skills</ScreenTitle>
      <Caption style={styles.subtitle}>Am I getting better? Track practice, progress and the milestones along the way.</Caption>

      {skills.length === 0 && <Body style={styles.emptyText}>Nothing yet — add the first skill you're practicing.</Body>}
      {skills.length === 0 && <SeeHowItWorks sectionId="skills" />}

      <View style={styles.skillList}>{active.map(renderCard)}</View>

      <PrimaryButton label="Add a skill" onPress={() => setAddOpen(true)} style={styles.addButton} />

      {archived.length > 0 && (
        <>
          <Eyebrow style={styles.groupLabel}>Archived</Eyebrow>
          <View style={styles.skillList}>{archived.map(renderCard)}</View>
        </>
      )}

      <AddSkillSheet visible={addOpen} onClose={() => setAddOpen(false)} onCreated={onOpenSkill} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Logging a session. The quick path is unchanged — duration (timer or typed)
// and an optional note. Everything else lives behind "Add details".
function LogSessionSheet({ skill, visible, onClose, onSave }: { skill: Skill; visible: boolean; onClose: () => void; onSave: (input: PracticeSessionInput) => void }) {
  const { showToast } = useUi();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const sessions = useSkillsStore((s) => s.sessions);
  // After saving, offer the optional "how did that feel" step rather than
  // forcing it — the session is already saved by this point.
  const [justSaved, setJustSaved] = useState(false);
  const feelingAsk = useSettingsStore((s) => s.skillFeelingAsk);
  const feelingEntries = useFeelingsStore((s) => s.entries);
  const [minutesText, setMinutesText] = useState('');
  const [notes, setNotes] = useState('');
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);

  const [timerRunning, setTimerRunning] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startedAt, setStartedAt] = useState<string | undefined>(undefined);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const [showDetails, setShowDetails] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [focus, setFocus] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<SessionDifficulty | undefined>(undefined);
  const [metricText, setMetricText] = useState<Record<string, string>>({});
  const [struggled, setStruggled] = useState<string[]>([]);
  const [struggledText, setStruggledText] = useState('');
  const [breakthrough, setBreakthrough] = useState(false);
  const [feedbackFrom, setFeedbackFrom] = useState<FeedbackSource | undefined>(undefined);
  const [feedbackText, setFeedbackText] = useState('');

  const reset = () => {
    setMinutesText('');
    setNotes('');
    setTag(undefined);
    setPhotoUri(undefined);
    setTimerRunning(false);
    setTimerPaused(false);
    setElapsedSeconds(0);
    setStartedAt(undefined);
    setJustSaved(false);
    setShowDetails(false);
    setNudgeDismissed(false);
    setFocus([]);
    setDifficulty(undefined);
    setMetricText({});
    setStruggled([]);
    setStruggledText('');
    setBreakthrough(false);
    setFeedbackFrom(undefined);
    setFeedbackText('');
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const close = () => {
    reset();
    onClose();
  };

  const startTimer = () => {
    setTimerRunning(true);
    setTimerPaused(false);
    if (!startedAt) setStartedAt(new Date().toISOString());
    intervalRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
  };

  const togglePause = () => {
    if (timerPaused) {
      setTimerPaused(false);
      intervalRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else {
      setTimerPaused(true);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  };

  const stopTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimerRunning(false);
    setTimerPaused(false);
    setMinutesText(String(Math.max(1, Math.round(elapsedSeconds / 60))));
  };

  React.useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const pickPhoto = async (source: 'camera' | 'library') => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast({ message: 'Permission needed to use the camera/photos.' });
        return;
      }
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync({ quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
    } catch {
      showToast({ message: "Couldn't open the camera on this device." });
    }
  };

  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const subSkills = activeSubSkills(skill);
  const metrics = activeMetrics(skill);
  const lastStruggles = lastSessionStruggles(skill, sessions);
  const nudgeNames = lastStruggles ? [...lastStruggles.subSkills.map((s) => s.name.toLowerCase()), ...(lastStruggles.subSkills.length ? [] : [lastStruggles.text ?? ''])].filter(Boolean) : [];
  const prompt = skill.type ? skillTypeMeta[skill.type].prompt : skillTypeMeta.other.prompt;
  const metricValues = Object.fromEntries(
    Object.entries(metricText)
      .filter(([, v]) => v.trim() !== '' && Number.isFinite(parseNumberInput(v)))
      .map(([k, v]) => [k, parseNumberInput(v)])
  );
  const hasDetails = focus.length || difficulty || Object.keys(metricValues).length || struggled.length || struggledText.trim() || breakthrough || feedbackText.trim();

  if (justSaved) {
    return <ItemFeelingPrompt visible={visible} source={{ kind: 'skill', refId: skill.id }} context={`Practiced: ${skill.name}`} onDone={close} />;
  }

  return (
    <SheetModal visible={visible} onClose={close}>
      <SectionHeading>Practice session</SectionHeading>

      {nudgeNames.length > 0 && !nudgeDismissed && (
        <Card style={[styles.nudge, { borderLeftColor: skill.color }]}>
          <Caption style={styles.flex}>Last time you struggled with {nudgeNames.join(' and ')}. Focus on that today?</Caption>
          {lastStruggles!.subSkills.length > 0 && (
            <Pressable
              hitSlop={6}
              onPress={() => {
                setFocus(lastStruggles!.subSkills.map((s) => s.id));
                setShowDetails(true);
                setNudgeDismissed(true);
              }}
            >
              <Caption style={{ color: skill.color, fontFamily: fonts.bodyMedium }}>Yes</Caption>
            </Pressable>
          )}
          <Pressable hitSlop={6} onPress={() => setNudgeDismissed(true)} accessibilityLabel="Dismiss">
            <Ionicons name="close" size={14} color={colors.inkSoft} />
          </Pressable>
        </Card>
      )}

      <Eyebrow style={styles.fieldLabel}>Timer (optional)</Eyebrow>
      {timerRunning ? (
        <View style={styles.timerRow}>
          <Caption style={styles.timerClock}>{formatClock(elapsedSeconds)}</Caption>
          <View style={styles.timerButtons}>
            <PrimaryButton label={timerPaused ? 'Resume' : 'Pause'} variant="outline" onPress={togglePause} style={styles.timerButton} />
            <PrimaryButton label="Stop" onPress={stopTimer} style={styles.timerButton} />
          </View>
        </View>
      ) : (
        <PrimaryButton label="Start timer" variant="outline" onPress={startTimer} />
      )}

      <Eyebrow style={styles.fieldLabel}>Minutes</Eyebrow>
      <TextInput value={minutesText} onChangeText={setMinutesText} placeholder="e.g. 20" placeholderTextColor={colors.inkSoft} style={styles.sheetInput} keyboardType="number-pad" />

      <Eyebrow style={styles.fieldLabel}>Notes</Eyebrow>
      <Caption style={styles.promptHint}>{prompt}</Caption>
      <TextInput value={notes} onChangeText={setNotes} placeholder="What did you work on, what felt hard, what improved..." placeholderTextColor={colors.inkSoft} style={styles.notesInput} multiline />

      <Eyebrow style={styles.fieldLabel}>Tag (optional)</Eyebrow>
      <View style={styles.chipRow}>
        {sessionTagOptions.map((t) => (
          <Pressable key={t} onPress={() => setTag(tag === t ? undefined : t)} style={[styles.chip, tag === t && { backgroundColor: accent }]}>
            <Body style={tag === t ? styles.chipTextActive : undefined}>{t}</Body>
          </Pressable>
        ))}
      </View>

      <Eyebrow style={styles.fieldLabel}>Photo (optional)</Eyebrow>
      {photoUri ? (
        <View>
          <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
          <Pressable onPress={() => setPhotoUri(undefined)}>
            <Caption style={styles.removePhotoText}>Remove photo</Caption>
          </Pressable>
        </View>
      ) : (
        <View style={styles.photoButtons}>
          <PrimaryButton label="Take photo" variant="outline" onPress={() => pickPhoto('camera')} />
          <PrimaryButton label="Choose from library" variant="outline" onPress={() => pickPhoto('library')} />
        </View>
      )}

      <Pressable onPress={() => setShowDetails((v) => !v)} style={styles.detailsToggle} accessibilityRole="button">
        <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={16} color={skill.color} />
        <Body style={{ color: skill.color }}> {showDetails ? 'Hide details' : 'Add details'}</Body>
        {!showDetails && <Caption style={styles.hint}> — focus, difficulty, {metrics.length ? 'metric, ' : ''}struggles, breakthroughs</Caption>}
      </Pressable>

      {showDetails && (
        <View style={styles.details}>
          {subSkills.length > 0 && (
            <>
              <Eyebrow style={styles.fieldLabel}>Focus</Eyebrow>
              <View style={styles.chipRow}>
                {subSkills.map((s) => (
                  <Pressable key={s.id} onPress={() => setFocus(toggleIn(focus, s.id))} style={[styles.chip, focus.includes(s.id) && { backgroundColor: skill.color }]}>
                    <Caption style={focus.includes(s.id) ? styles.chipTextActive : undefined}>{s.name}</Caption>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Eyebrow style={styles.fieldLabel}>How difficult did it feel?</Eyebrow>
          <View style={styles.chipRow}>
            {DIFFICULTY_ORDER.map((d) => (
              <Pressable key={d} onPress={() => setDifficulty(difficulty === d ? undefined : d)} style={[styles.chip, difficulty === d && { backgroundColor: DIFFICULTY_COLORS[d] }]}>
                <Caption style={difficulty === d ? styles.chipTextActive : undefined}>{DIFFICULTY_LABELS[d]}</Caption>
              </Pressable>
            ))}
          </View>

          {metrics.map((m) => (
            <View key={m.id}>
              <Eyebrow style={styles.fieldLabel}>
                {m.name}
                {m.unit ? ` (${m.unit})` : ''}
              </Eyebrow>
              <TextInput
                value={metricText[m.id] ?? ''}
                onChangeText={(v) => setMetricText((prev) => ({ ...prev, [m.id]: v.replace(',', '.') }))}
                placeholder={m.selfRating ? '1–10' : m.direction === 'lower' ? 'Lower is better' : 'Higher is better'}
                placeholderTextColor={colors.inkSoft}
                keyboardType="decimal-pad"
                style={styles.sheetInput}
              />
            </View>
          ))}

          <Eyebrow style={styles.fieldLabel}>Struggled with</Eyebrow>
          {subSkills.length > 0 && (
            <View style={styles.chipRow}>
              {subSkills.map((s) => (
                <Pressable key={s.id} onPress={() => setStruggled(toggleIn(struggled, s.id))} style={[styles.chip, struggled.includes(s.id) && { backgroundColor: DIFFICULTY_COLORS.tooHard }]}>
                  <Caption style={struggled.includes(s.id) ? styles.chipTextActive : undefined}>{s.name}</Caption>
                </Pressable>
              ))}
            </View>
          )}
          <TextInput value={struggledText} onChangeText={setStruggledText} placeholder="Anything specific? (optional)" placeholderTextColor={colors.inkSoft} style={styles.sheetInput} />

          <Pressable onPress={() => setBreakthrough((v) => !v)} style={[styles.breakthrough, breakthrough && { backgroundColor: withAlpha(skill.color, 0.2), borderColor: skill.color }]}>
            <Ionicons name={breakthrough ? 'sparkles' : 'sparkles-outline'} size={16} color={skill.color} />
            <Body> Something clicked today</Body>
          </Pressable>

          <Eyebrow style={styles.fieldLabel}>Feedback received</Eyebrow>
          <View style={styles.chipRow}>
            {(['teacher', 'peer', 'self', 'other'] as FeedbackSource[]).map((f) => (
              <Pressable key={f} onPress={() => setFeedbackFrom(feedbackFrom === f ? undefined : f)} style={[styles.chip, feedbackFrom === f && { backgroundColor: skill.color }]}>
                <Caption style={feedbackFrom === f ? styles.chipTextActive : undefined}>{f === 'self' ? 'Self-review' : f[0].toUpperCase() + f.slice(1)}</Caption>
              </Pressable>
            ))}
          </View>
          {feedbackFrom && <TextInput value={feedbackText} onChangeText={setFeedbackText} placeholder="What was the feedback?" placeholderTextColor={colors.inkSoft} style={styles.notesInput} multiline />}
        </View>
      )}

      <PrimaryButton
        label="Save session"
        disabled={!minutesText.trim() && !notes.trim() && !photoUri && !hasDetails}
        onPress={() => {
          onSave({
            minutes: parseWholeNumberInput(minutesText) || 0,
            notes,
            photoUri,
            // No voice recording yet, so nothing claims one is attached.
            hasVoiceMemo: false,
            tag,
            startedAt,
            focusSubSkillIds: focus,
            difficulty,
            metricValues,
            struggledSubSkillIds: struggled,
            struggledText,
            breakthrough,
            feedback: feedbackFrom && feedbackText.trim() ? { from: feedbackFrom, text: feedbackText } : undefined,
          });
          // The optional feeling sheet, per Settings.
          if (shouldAskItemFeeling(feelingAsk, feelingEntries, 'skill', skill.id, todayISO())) setJustSaved(true);
          else close();
        }}
        style={styles.sheetSubmit}
      />
    </SheetModal>
  );
}

// ---------------------------------------------------------------------------
// The skill's home: progression first. Level and goal, hours invested, how
// the metric has moved, the next milestone, a suggested focus, then Start.
// Practice rhythm is a small secondary line, never the headline.
function FolderStage({
  skillId,
  openSetup,
  onBack,
  onOpenSession,
  onOpenAnalysis,
  onOpenJourney,
  onSetupConsumed,
}: {
  skillId: string;
  openSetup?: boolean;
  onSetupConsumed: () => void;
  onBack: () => void;
  onOpenSession: (sessionId: string) => void;
  onOpenAnalysis: () => void;
  onOpenJourney: () => void;
}) {
  const { requestDelete, showToast } = useUi();
  const skills = useSkillsStore((s) => s.skills);
  const sessions = useSkillsStore((s) => s.sessions);
  const deleteSkill = useSkillsStore((s) => s.deleteSkill);
  const archiveSkill = useSkillsStore((s) => s.archiveSkill);
  const unarchiveSkill = useSkillsStore((s) => s.unarchiveSkill);
  const addMilestone = useSkillsStore((s) => s.addMilestone);
  const toggleMilestone = useSkillsStore((s) => s.toggleMilestone);
  const deleteMilestone = useSkillsStore((s) => s.deleteMilestone);
  const setSubSkillLevel = useSkillsStore((s) => s.setSubSkillLevel);
  const setReminder = useSkillsStore((s) => s.setReminder);
  const addSession = useSkillsStore((s) => s.addSession);

  const skill = skills.find((s) => s.id === skillId);

  const [logOpen, setLogOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(!!openSetup);
  // "Create & set up" should open the setup sheet once — not every time this
  // screen remounts after coming back from Analysis or Journey.
  React.useEffect(() => {
    if (openSetup) onSetupConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [achieving, setAchieving] = useState<SkillMilestone | null>(null);
  const [milestoneDraft, setMilestoneDraft] = useState('');
  const [milestoneTarget, setMilestoneTarget] = useState<number | null>(null);
  const [reminderPickerOpen, setReminderPickerOpen] = useState(false);

  // Hooks run unconditionally, so this is computed before the early return.
  const resurfaced = useMemo(() => resurfaceOldSession(sessions, skillId, todayISO()), [sessions, skillId]);

  if (!skill) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Back</Caption>
        </Pressable>
        <Body>This skill isn't in your list anymore.</Body>
      </>
    );
  }

  const today = todayISO();
  const color = skill.color;
  const mine = skillSessionsChrono(sessions, skillId);
  const minutes = totalMinutesFor(sessions, skillId);
  const level = skill.currentLevel ?? skill.startingLevel;
  const metric = primaryMetric(skill);
  const change = metric ? metricChange(metricSeries(sessions, skillId, metric.id), metric.direction) : undefined;
  const nextMilestone = skill.milestones.find((m) => !m.achieved);
  const achievedCount = skill.milestones.filter((m) => m.achieved).length;
  const focus = suggestedFocus(skill, sessions);
  const weekly = weeklyGoalProgress(skill, sessions, today);
  const streak = skillPracticeStreak(sessions, skillId, today);
  const last30 = mine.filter((s) => s.date >= addDaysISO(today, -29)).length;
  const subSkills = activeSubSkills(skill);
  const nothingSetUp = !level && !skill.goal && subSkills.length === 0 && !metric;

  const removeSkill = () => {
    requestDelete({
      message: `Delete "${skill.name}" and every session logged for it? This can't be undone. Feelings you logged with it stay in your Feelings log. (Archiving keeps everything instead.)`,
      perform: () => {
        deleteSkill(skillId);
        onBack();
      },
    });
  };

  const submitMilestone = () => {
    if (!milestoneDraft.trim()) return;
    addMilestone(skillId, milestoneDraft, milestoneTarget ? addDaysISO(today, milestoneTarget) : undefined);
    setMilestoneDraft('');
    setMilestoneTarget(null);
  };

  const targetStatus = (date: string) => {
    const days = daysBetweenISO(today, date);
    if (days > 0) return `aiming for ${formatDisplayDate(date)}`;
    if (days === 0) return 'aiming for today';
    return `target date was ${formatDisplayDate(date)} — no rush`;
  };

  return (
    <>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Skills</Caption>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable onPress={() => (skill.archivedAt ? unarchiveSkill(skillId) : archiveSkill(skillId))} hitSlop={8} accessibilityLabel={skill.archivedAt ? 'Restore skill' : 'Archive skill'}>
            <Ionicons name={skill.archivedAt ? 'arrow-undo-outline' : 'archive-outline'} size={18} color={colors.inkSoft} />
          </Pressable>
          <Pressable onPress={removeSkill} hitSlop={8} accessibilityLabel="Delete skill">
            <Ionicons name="trash-outline" size={18} color={colors.inkSoft} />
          </Pressable>
        </View>
      </View>

      <View style={styles.folderTop}>
        <View style={[styles.skillIconWrapLarge, { backgroundColor: withAlpha(color, 0.18) }]}>
          <Ionicons name={skill.icon} size={30} color={color} />
        </View>
        <View style={styles.folderInfo}>
          <SectionHeading>{skill.name}</SectionHeading>
          <Caption>
            {skill.type ? `${skillTypeMeta[skill.type].label} · ` : ''}Practicing since {formatDisplayDate(skill.startDate)}
          </Caption>
        </View>
      </View>

      {skill.archivedAt && (
        <Card style={styles.section}>
          <Caption>Archived on {formatDisplayDate(skill.archivedAt)} — everything is still here to look back on.</Caption>
        </Card>
      )}

      {/* 1. Level and progress toward the goal */}
      {nothingSetUp ? (
        <Pressable onPress={() => setSetupOpen(true)}>
          <Card style={[styles.section, styles.setupPrompt, { borderColor: color }]}>
            <Ionicons name="options-outline" size={18} color={color} />
            <Caption style={styles.flex}>Add a level, goal, sub-skills or a progress metric — all optional.</Caption>
            <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
          </Card>
        </Pressable>
      ) : (
        <Card style={styles.section}>
          <View style={styles.headerRow}>
            <View style={styles.levelBadge}>
              <Ionicons name="ribbon-outline" size={14} color={color} />
              <Caption style={{ color }}> {level ? LEVEL_LABELS[level] : 'Level not set'}</Caption>
            </View>
            <Pressable onPress={() => setSetupOpen(true)} hitSlop={8}>
              <Caption style={{ color }}>Edit setup</Caption>
            </Pressable>
          </View>
          {skill.goal ? <Body style={styles.goalText}>{skill.goal}</Body> : <Caption style={styles.hint}>No goal set yet.</Caption>}
          {skill.goalTargetDate && <Caption style={styles.hint}>{targetStatus(skill.goalTargetDate)}</Caption>}
          {skill.milestones.length > 0 && (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(achievedCount / skill.milestones.length) * 100}%`, backgroundColor: color }]} />
              </View>
              <Caption style={styles.hint}>
                {achievedCount} of {skill.milestones.length} milestones reached
              </Caption>
            </>
          )}
        </Card>
      )}

      {/* 2. Hours invested and sessions — a record of effort */}
      <StatRow
        accent={color}
        stats={[
          { value: formatHours(minutes), label: 'invested' },
          { value: String(mine.length), label: mine.length === 1 ? 'session' : 'sessions' },
        ]}
      />

      {/* 3. Latest metric value and change since the start */}
      {metric && (
        <Card style={styles.section}>
          <Eyebrow style={{ color }}>{metric.name}</Eyebrow>
          {change ? (
            <Body style={styles.metricText}>{describeMetricChange(metric, change)}</Body>
          ) : (
            <Caption style={styles.hint}>No values yet — add one under "Add details" when you log a session.</Caption>
          )}
        </Card>
      )}

      {/* 4. Next milestone */}
      {nextMilestone && (
        <Card style={styles.section}>
          <Eyebrow>Next milestone</Eyebrow>
          <Body>{nextMilestone.text}</Body>
          {nextMilestone.targetDate && <Caption style={styles.hint}>{targetStatus(nextMilestone.targetDate)}</Caption>}
          <PrimaryButton label="I did it" variant="outline" onPress={() => setAchieving(nextMilestone)} style={styles.inlineButton} />
        </Card>
      )}

      {/* 5. Suggested focus — a suggestion, never an instruction */}
      {focus && (
        <Card style={[styles.section, styles.focusCard]}>
          <Ionicons name="bulb-outline" size={18} color={color} />
          <Caption style={styles.flex}>
            Maybe focus on <Caption style={{ fontFamily: fonts.bodyMedium }}>{focus.subSkill.name.toLowerCase()}</Caption>
            {focus.reason === 'struggled' ? ' — it gave you trouble last time.' : focus.lastDate ? ` — last practiced ${formatDisplayDate(focus.lastDate)}.` : ' — you haven\'t practiced it yet.'}
          </Caption>
        </Card>
      )}

      {/* 6. Start Session */}
      {!skill.archivedAt && <PrimaryButton label="Start a session" onPress={() => setLogOpen(true)} style={styles.logButton} />}

      <View style={styles.rhythmRow}>
        {weekly && (
          <ProgressRing fraction={weekly.fraction} color={color} size={44}>
            <Caption style={styles.ringText}>{Math.round(weekly.fraction * 100)}%</Caption>
          </ProgressRing>
        )}
        <Caption style={[styles.hint, styles.flex]}>
          {weekly ? `${formatHours(weekly.minutes)} of ${formatHours(weekly.goal)} this week. ` : ''}
          {last30} session{last30 === 1 ? '' : 's'} in the last 30 days{streak > 1 ? ` · ${streak} days in a row` : ''}
        </Caption>
      </View>

      <View style={styles.rowGap}>
        {isSkillAnalysisAvailable() && (
          <Pressable onPress={onOpenAnalysis} style={styles.flex}>
            <Card style={styles.entryCard}>
              <Ionicons name="analytics-outline" size={20} color={color} />
              <Body>Analysis</Body>
              <Caption style={styles.hint}>Progress, time & patterns</Caption>
            </Card>
          </Pressable>
        )}
        <Pressable onPress={onOpenJourney} style={styles.flex}>
          <Card style={styles.entryCard}>
            <Ionicons name="git-commit-outline" size={20} color={color} />
            <Body>Journey</Body>
            <Caption style={styles.hint}>The whole learning story</Caption>
          </Card>
        </Pressable>
      </View>

      {subSkills.length > 0 && (
        <Card style={styles.section}>
          <Eyebrow>Sub-skills</Eyebrow>
          {subSkills.map((s) => (
            <View key={s.id} style={styles.listRow}>
              <Body style={styles.flex}>{s.name}</Body>
              <LevelDots value={s.level} color={color} onChange={(lv) => setSubSkillLevel(skillId, s.id, lv)} />
            </View>
          ))}
          <Caption style={styles.hint}>Tap the dots to update a level any time.</Caption>
        </Card>
      )}

      <Card style={styles.section}>
        <Eyebrow>Milestones</Eyebrow>
        {skill.milestones.length === 0 && <Caption style={styles.hint}>Capability milestones — "play my first full song", "hold a 10-minute conversation".</Caption>}
        {skill.milestones.map((m) => (
          <View key={m.id} style={styles.milestoneRow}>
            <Pressable onPress={() => (m.achieved ? toggleMilestone(skillId, m.id) : setAchieving(m))} style={styles.milestoneToggle}>
              <Ionicons name={m.achieved ? 'checkbox' : 'square-outline'} size={20} color={m.achieved ? color : colors.inkSoft} />
              <View style={styles.flex}>
                <Body style={m.achieved ? styles.milestoneDone : undefined}>{m.text}</Body>
                {m.achieved && m.achievedAt ? (
                  <Caption style={styles.hint}>Reached {formatDisplayDate(m.achievedAt)}</Caption>
                ) : m.targetDate ? (
                  <Caption style={styles.hint}>{targetStatus(m.targetDate)}</Caption>
                ) : null}
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove milestone ${m.text}`} onPress={() => requestDelete({ message: `Remove milestone "${m.text}"?`, perform: () => deleteMilestone(skillId, m.id) })} hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.inkSoft} />
            </Pressable>
          </View>
        ))}
        <View style={styles.addRow}>
          <TextInput value={milestoneDraft} onChangeText={setMilestoneDraft} placeholder="e.g. Learn my first full song" placeholderTextColor={colors.inkSoft} style={styles.addInput} onSubmitEditing={submitMilestone} />
          <Pressable onPress={submitMilestone} hitSlop={8} accessibilityLabel="Add milestone">
            <Ionicons name="add-circle" size={26} color={color} />
          </Pressable>
        </View>
        {milestoneDraft.trim().length > 0 && (
          <View style={styles.chipRow}>
            {[
              { label: 'No date', days: null },
              { label: '1 month', days: 30 },
              { label: '3 months', days: 91 },
              { label: '6 months', days: 182 },
            ].map((t) => (
              <Pressable key={t.label} onPress={() => setMilestoneTarget(t.days)} style={[styles.chip, milestoneTarget === t.days && { backgroundColor: color }]}>
                <Caption style={milestoneTarget === t.days ? styles.chipTextActive : undefined}>{t.label}</Caption>
              </Pressable>
            ))}
          </View>
        )}
      </Card>

      {resurfaced && (
        <Pressable onPress={() => onOpenSession(resurfaced.id)}>
          <Card style={[styles.resurfaceCard, { borderLeftColor: color }]}>
            <Eyebrow style={{ color }}>A while back in your practice…</Eyebrow>
            <Caption>{formatDisplayDate(resurfaced.date)}</Caption>
            {!!resurfaced.photoUri && <Image source={{ uri: resurfaced.photoUri }} style={styles.resurfacePhoto} resizeMode="cover" />}
            {resurfaced.notes && <Body style={styles.resurfaceText} numberOfLines={3}>{resurfaced.notes}</Body>}
          </Card>
        </Pressable>
      )}

      <Eyebrow style={styles.historyHeading}>Recent sessions</Eyebrow>
      <View style={styles.list}>
        {mine.length === 0 && <Body style={styles.emptyText}>No sessions logged yet.</Body>}
        {[...mine]
          .reverse()
          .slice(0, 3)
          .map((s) => (
            <Pressable key={s.id} onPress={() => onOpenSession(s.id)}>
              <Card style={styles.sessionCard}>
                <View style={styles.sessionHeader}>
                  <Body>{formatDisplayDate(s.date)}</Body>
                  <Caption>{s.minutes ? formatHours(s.minutes) : ''}</Caption>
                </View>
                {s.notes && <Caption numberOfLines={2}>{s.notes}</Caption>}
                <SessionDetails skill={skill} session={s} compact />
              </Card>
            </Pressable>
          ))}
        {mine.length > 3 && isSkillAnalysisAvailable() && (
          <Pressable onPress={onOpenAnalysis}>
            <Caption style={{ color }}>See all {mine.length} sessions in Analysis</Caption>
          </Pressable>
        )}
      </View>

      <Card style={styles.section}>
        <Eyebrow>Practice reminder</Eyebrow>
        <View style={styles.reminderRow}>
          <Body>{skill.reminderEnabled && skill.reminderTime ? `Every day at ${formatClockTime(skill.reminderTime)}` : 'Off'}</Body>
          {!skill.archivedAt && <PrimaryButton label={skill.reminderEnabled ? 'Change' : 'Set time'} variant="outline" onPress={() => setReminderPickerOpen(true)} />}
        </View>
        {skill.reminderEnabled && (
          <Pressable onPress={() => setReminder(skillId, undefined, false)}>
            <Caption style={styles.turnOffLink}>Turn off reminder</Caption>
          </Pressable>
        )}
      </Card>

      {mine.length > 0 && (
        <Card style={styles.section}>
          <Eyebrow>Export your portfolio</Eyebrow>
          <View style={styles.rowGap}>
            <PrimaryButton label="Share as text" variant="outline" style={styles.flex} onPress={() => shareSkillPortfolioAsText(skill, mine)} />
            <PrimaryButton
              label="Export as PDF"
              variant="outline"
              style={styles.flex}
              onPress={async () => {
                const result = await exportSkillPortfolioAsPdf(skill, mine);
                if (!result.ok && result.reason) showToast({ message: result.reason });
              }}
            />
          </View>
        </Card>
      )}

      <TimePickerModal
        visible={reminderPickerOpen}
        value={skill.reminderTime}
        title={`Remind me to practice ${skill.name}`}
        onClose={() => setReminderPickerOpen(false)}
        onPick={(time) => setReminder(skillId, time, !!time)}
      />
      <LogSessionSheet skill={skill} visible={logOpen} onClose={() => setLogOpen(false)} onSave={(input) => addSession(skillId, input)} />
      <SkillSetupSheet skill={skill} visible={setupOpen} onClose={() => setSetupOpen(false)} hasSessions={mine.length > 0} />
      <MilestoneAchieveSheet skill={skill} milestone={achieving} visible={achieving !== null} onClose={() => setAchieving(null)} />
    </>
  );
}

// ---------------------------------------------------------------------------
function SessionDetailStage({ skillId, sessionId, onBack }: { skillId: string; sessionId: string; onBack: () => void }) {
  const { requestDelete } = useUi();
  const skills = useSkillsStore((s) => s.skills);
  const sessions = useSkillsStore((s) => s.sessions);
  const deleteSession = useSkillsStore((s) => s.deleteSession);

  const skill = skills.find((s) => s.id === skillId);
  const session = sessions.find((s) => s.id === sessionId);

  if (!skill || !session) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Back</Caption>
        </Pressable>
        <Body>This session isn't around anymore.</Body>
      </>
    );
  }

  return (
    <EntryDetailView
      accent={skill.color}
      title={formatDisplayDate(session.date)}
      subtitle={[session.minutes ? formatHours(session.minutes) : null, session.tag].filter(Boolean).join(' · ') || undefined}
      backLabel={skill.name}
      notes={session.notes}
      photoUri={session.photoUri}
      hasVoiceMemo={false}
      onBack={onBack}
      onDelete={() =>
        requestDelete({
          message: 'Delete this practice session?',
          perform: () => {
            deleteSession(sessionId);
            onBack();
          },
        })
      }
    >
      <SessionDetails skill={skill} session={session} />
    </EntryDetailView>
  );
}

// A milestone opened from the Journey — the same "past entry detail" page.
function MilestoneDetailStage({ skillId, milestoneId, onBack }: { skillId: string; milestoneId: string; onBack: () => void }) {
  const skill = useSkillsStore((s) => s.skills).find((s) => s.id === skillId);
  const milestone = skill?.milestones.find((m) => m.id === milestoneId);
  if (!skill || !milestone) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Back</Caption>
        </Pressable>
        <Body>This milestone isn't around anymore.</Body>
      </>
    );
  }
  return (
    <EntryDetailView
      accent={skill.color}
      title={milestone.text}
      subtitle={milestone.achievedAt ? `Reached ${formatDisplayDate(milestone.achievedAt)}` : 'Not yet'}
      backLabel="Journey"
      notes={milestone.reflection}
      photoUri={milestone.proofPhotoUri}
      onBack={onBack}
    />
  );
}

// ---------------------------------------------------------------------------
export function SkillsScreen({ route }: Props) {
  const { openSkillId, openSessionId } = route.params ?? {};
  const [stack, setStack] = useState<ScreenState[]>(() => {
    if (openSkillId && openSessionId) {
      return [{ kind: 'overview' }, { kind: 'folder', skillId: openSkillId }, { kind: 'sessionDetail', skillId: openSkillId, sessionId: openSessionId }];
    }
    if (openSkillId) return [{ kind: 'overview' }, { kind: 'folder', skillId: openSkillId }];
    return [{ kind: 'overview' }];
  });
  const current = stack[stack.length - 1];
  const push = (s: ScreenState) => setStack((prev) => [...prev, s]);
  const stepBack = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));

  useBackHandler({ stepBack: stack.length > 1 ? stepBack : undefined });

  return (
    <Screen>
      {current.kind === 'overview' && <OverviewStage onOpenSkill={(skillId, setUp) => push({ kind: 'folder', skillId, openSetup: setUp })} />}
      {current.kind === 'folder' && (
        <FolderStage
          key={current.skillId}
          skillId={current.skillId}
          openSetup={current.openSetup}
          onSetupConsumed={() =>
            setStack((prev) => prev.map((s, i) => (i === prev.length - 1 && s.kind === 'folder' ? { ...s, openSetup: false } : s)))
          }
          onBack={stepBack}
          onOpenSession={(sessionId) => push({ kind: 'sessionDetail', skillId: current.skillId, sessionId })}
          onOpenAnalysis={() => push({ kind: 'analysis', skillId: current.skillId })}
          onOpenJourney={() => push({ kind: 'journey', skillId: current.skillId })}
        />
      )}
      {current.kind === 'analysis' && (
        <SkillAnalysisStage skillId={current.skillId} onBack={stepBack} onOpenSession={(sessionId) => push({ kind: 'sessionDetail', skillId: current.skillId, sessionId })} />
      )}
      {current.kind === 'journey' && (
        <SkillJourneyStage
          skillId={current.skillId}
          onBack={stepBack}
          onOpenSession={(sessionId) => push({ kind: 'sessionDetail', skillId: current.skillId, sessionId })}
          onOpenMilestone={(milestoneId) => push({ kind: 'milestoneDetail', skillId: current.skillId, milestoneId })}
        />
      )}
      {current.kind === 'sessionDetail' && <SessionDetailStage skillId={current.skillId} sessionId={current.sessionId} onBack={stepBack} />}
      {current.kind === 'milestoneDetail' && <MilestoneDetailStage skillId={current.skillId} milestoneId={current.milestoneId} onBack={stepBack} />}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', gap: spacing.md },
  backLink: { flexDirection: 'row', alignItems: 'center' },
  subtitle: { marginTop: 2, marginBottom: spacing.lg },
  hint: { color: colors.inkSoft },
  flex: { flex: 1 },
  rowGap: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  emptyText: { color: colors.inkSoft, marginBottom: spacing.md },
  skillList: { gap: spacing.sm, marginBottom: spacing.lg },
  groupLabel: { marginBottom: spacing.sm },
  skillCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  skillIconWrap: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  skillIconWrapLarge: { width: 60, height: 60, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  skillCardBody: { flex: 1, gap: 2 },
  addButton: { marginBottom: spacing.xl },
  fieldLabel: { marginTop: spacing.sm },
  sheetInput: { fontFamily: fonts.body, fontSize: 15, color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: spacing.sm },
  sheetSubmit: { marginTop: spacing.md },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  colorSwatch: { width: 32, height: 32, borderRadius: radii.full, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: colors.ink },
  iconSwatch: { width: 36, height: 36, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: { paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.stone },
  chipTextActive: { color: colors.white },
  folderTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginBottom: spacing.md },
  folderInfo: { flex: 1, gap: 4 },
  section: { gap: spacing.sm, marginBottom: spacing.md },
  setupPrompt: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderStyle: 'dashed' },
  levelBadge: { flexDirection: 'row', alignItems: 'center' },
  goalText: { fontFamily: fonts.bodyMedium },
  progressTrack: { height: 6, borderRadius: radii.full, backgroundColor: colors.line, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radii.full },
  metricText: { fontFamily: fonts.bodyMedium, fontSize: 17 },
  inlineButton: { alignSelf: 'flex-start' },
  focusCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logButton: { marginBottom: spacing.sm },
  rhythmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  ringText: { fontSize: 10 },
  entryCard: { gap: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  resurfaceCard: { gap: spacing.xs, marginBottom: spacing.md, borderLeftWidth: 3 },
  resurfacePhoto: { width: '100%', height: 140, borderRadius: radii.sm, backgroundColor: colors.stone },
  resurfaceText: { fontStyle: 'italic' },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  milestoneToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  milestoneDone: { textDecorationLine: 'line-through', color: colors.inkSoft },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addInput: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: spacing.xs },
  reminderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  turnOffLink: { color: colors.inkSoft, textDecorationLine: 'underline' },
  historyHeading: { marginTop: spacing.xs, marginBottom: spacing.sm },
  list: { gap: spacing.sm, marginBottom: spacing.md },
  sessionCard: { gap: 4 },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  timerRow: { gap: spacing.sm },
  timerClock: { fontFamily: fonts.headingSemiBold, fontSize: 28, color: accent, textAlign: 'center' },
  timerButtons: { flexDirection: 'row', gap: spacing.sm },
  timerButton: { flex: 1 },
  promptHint: { fontStyle: 'italic', marginBottom: spacing.xs },
  notesInput: { fontFamily: fonts.body, fontSize: 15, color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: spacing.sm, minHeight: 60, textAlignVertical: 'top' },
  photoButtons: { gap: spacing.sm },
  photoPreview: { width: '100%', height: 160, borderRadius: radii.md, backgroundColor: colors.stone },
  removePhotoText: { color: colors.inkSoft, textDecorationLine: 'underline' },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingVertical: spacing.sm, marginTop: spacing.xs },
  details: { gap: spacing.xs },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderLeftWidth: 3, marginBottom: spacing.sm },
  breakthrough: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, marginTop: spacing.sm },
}));
