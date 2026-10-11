import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { TextInput } from '../components/TextInput';
import { SheetModal } from '../components/SheetModal';
import { SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { useUi } from '../components/UiProvider';
import { colors, fonts, radii, spacing } from '../theme';
import { useSkillsStore } from '../store/useSkillsStore';
import { DIFFICULTY_LABELS, LEVEL_LABELS, LEVEL_ORDER, formatMetricValue, subSkillName } from '../utils/skillProgress';
import type { PracticeSession, Skill, SkillMilestone } from '../types/sections';
import { themedStyles } from '../theme/runtime';

// A soft weekly-goal ring: fills toward the goal, never turns red, and going
// over just reads as full.
export function ProgressRing({ fraction, color, size = 56, children }: { fraction: number; color: string; size?: number; children?: React.ReactNode }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * Math.max(0, Math.min(1, fraction))} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

async function pickImage(onPicked: (uri: string) => void, onError: (message: string) => void) {
  try {
    const ImagePicker = await import('expo-image-picker');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return onError('Permission needed to choose a photo.');
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (!result.canceled && result.assets[0]) onPicked(result.assets[0].uri);
  } catch {
    onError("Couldn't open your photos on this device.");
  }
}

// Marking a milestone achieved: an optional reflection and proof photo, then
// a gentle "does this change your level?" — the user decides, the app never
// changes a level on its own.
export function MilestoneAchieveSheet({ skill, milestone, visible, onClose }: { skill: Skill; milestone: SkillMilestone | null; visible: boolean; onClose: () => void }) {
  const achieveMilestone = useSkillsStore((s) => s.achieveMilestone);
  const setLevel = useSkillsStore((s) => s.setLevel);
  const { showToast } = useUi();
  const [step, setStep] = useState<'details' | 'level'>('details');
  const [reflection, setReflection] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!visible) return;
    setStep('details');
    setReflection('');
    setPhotoUri(undefined);
  }, [visible]);

  if (!milestone) return null;
  const current = skill.currentLevel ?? skill.startingLevel;

  return (
    <SheetModal visible={visible} onClose={onClose}>
      {step === 'details' ? (
        <>
          <SectionHeading>{milestone.text}</SectionHeading>
          <Caption style={styles.hint}>Marking this achieved records today's date. The rest is optional.</Caption>
          <Eyebrow style={styles.label}>A short reflection</Eyebrow>
          <TextInput value={reflection} onChangeText={setReflection} placeholder="What it took, how it felt..." placeholderTextColor={colors.inkSoft} style={styles.input} multiline />
          <Eyebrow style={styles.label}>Proof photo</Eyebrow>
          {photoUri ? (
            <>
              <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
              <Pressable onPress={() => setPhotoUri(undefined)}>
                <Caption style={styles.link}>Remove photo</Caption>
              </Pressable>
            </>
          ) : (
            <PrimaryButton label="Choose a photo" variant="outline" onPress={() => pickImage(setPhotoUri, (m) => showToast({ message: m }))} />
          )}
          <PrimaryButton
            label="Mark achieved"
            style={styles.submit}
            onPress={() => {
              achieveMilestone(skill.id, milestone.id, { reflection, proofPhotoUri: photoUri });
              setStep('level');
            }}
          />
        </>
      ) : (
        <>
          <SectionHeading>Nice — that's a real step.</SectionHeading>
          <Body style={styles.hint}>Does this change your level? {current ? `You're at "${LEVEL_LABELS[current]}" now.` : ''}</Body>
          <View style={styles.chipRow}>
            {LEVEL_ORDER.map((l) => (
              <Pressable
                key={l}
                onPress={() => {
                  setLevel(skill.id, l, milestone.id);
                  onClose();
                }}
                style={[styles.chip, current === l && { borderColor: skill.color }]}
              >
                <Caption>{LEVEL_LABELS[l]}</Caption>
              </Pressable>
            ))}
          </View>
          <PrimaryButton label="No change" variant="outline" style={styles.submit} onPress={onClose} />
        </>
      )}
    </SheetModal>
  );
}

// Everything logged under "Add details" for one session, for the session
// detail page and the Analysis log. Renders nothing extra for a bare session.
export function SessionDetails({ skill, session, compact = false }: { skill: Skill; session: PracticeSession; compact?: boolean }) {
  const lines: { label: string; value: string }[] = [];
  if (session.focusSubSkillIds?.length) lines.push({ label: 'Focus', value: session.focusSubSkillIds.map((id) => subSkillName(skill, id)).join(', ') });
  if (session.difficulty) lines.push({ label: 'Difficulty', value: DIFFICULTY_LABELS[session.difficulty] });
  Object.entries(session.metricValues ?? {}).forEach(([id, value]) => {
    const metric = (skill.metrics ?? []).find((m) => m.id === id);
    lines.push({ label: metric ? `${metric.name}${metric.archivedAt ? ' (archived metric)' : ''}` : 'Metric', value: formatMetricValue(value, metric?.unit ?? '') });
  });
  const struggled = [...(session.struggledSubSkillIds ?? []).map((id) => subSkillName(skill, id)), session.struggledText].filter(Boolean);
  if (struggled.length) lines.push({ label: 'Struggled with', value: struggled.join(' · ') });
  if (session.feedback) lines.push({ label: `Feedback (${session.feedback.from === 'self' ? 'self-review' : session.feedback.from})`, value: session.feedback.text });
  if (lines.length === 0 && !session.breakthrough) return null;
  return (
    <View style={compact ? styles.detailsCompact : styles.details}>
      {session.breakthrough && <Caption style={{ color: skill.color, fontFamily: fonts.bodyMedium }}>✦ Something clicked</Caption>}
      {lines.map((l) => (
        <Caption key={l.label} numberOfLines={compact ? 2 : undefined}>
          <Caption style={styles.detailLabel}>{l.label}: </Caption>
          {l.value}
        </Caption>
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  hint: { color: colors.inkSoft, marginBottom: spacing.sm },
  label: { marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  photo: { width: '100%', height: 160, borderRadius: radii.md, backgroundColor: colors.stone },
  link: { color: colors.inkSoft, textDecorationLine: 'underline', marginTop: spacing.xs },
  submit: { marginTop: spacing.lg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  details: { gap: 4, marginTop: spacing.sm },
  detailsCompact: { gap: 2, marginTop: 2 },
  detailLabel: { color: colors.inkSoft },
}));
