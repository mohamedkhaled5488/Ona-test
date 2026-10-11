import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useBackHandler } from '../hooks/useBackHandler';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetModal } from '../components/SheetModal';
import { FeelingPicker, type FeelingPickerStep, type PickedFeeling } from '../components/FeelingPicker';
import { useUi } from '../components/UiProvider';
import { SectionHeading, Eyebrow, Caption } from '../components/Typography';
import { colors, fonts, radii, spacing } from '../theme';
import { useJournalStore } from '../store/useJournalStore';
import type { JournalBackground, JournalFont, JournalPageTemplate, JournalTextSize } from '../types/sections';
import type { FeelingZone } from '../types/sections';
import { JournalPageSurface, MARGIN_INSET } from '../components/JournalPageSurface';
import { withAlpha } from '../utils/color';
import { journalPrompts } from '../data/journalPrompts';
import { countWords, feelingLabel } from '../utils/journalStats';
import { formatDisplayDate } from '../utils/date';
import { feelingZones, zoneMeta } from '../data/feelingsWheel';
import type { RootStackParamList } from '../navigation/types';
import { themedStyles } from '../theme/runtime';
import { useSettingsStore } from '../store/useSettingsStore';

type Props = NativeStackScreenProps<RootStackParamList, 'journalWrite'>;

export const backgroundThemes: Record<JournalBackground, { label: string; bg: string; text: string; soft: string; dark: boolean }> = {
  ink: { label: 'Ink', bg: '#17150F', text: '#F2EEE6', soft: '#9C968A', dark: true },
  paper: { label: 'Paper', bg: '#F6F2E9', text: '#26231E', soft: '#7A7468', dark: false },
  sepia: { label: 'Sepia', bg: '#E9DCC3', text: '#3B2F1E', soft: '#7E6B4B', dark: false },
  midnight: { label: 'Midnight', bg: '#0F1724', text: '#DCE6F5', soft: '#7F90AB', dark: true },
  forest: { label: 'Forest', bg: '#101A15', text: '#DDEBDD', soft: '#7E9A86', dark: true },
};

// sizeMultiplier: Caveat/Patrick Hand read small at a given point size next to
// the other fonts, so they get a ~12% bump — see the Journaling revision doc.
export const fontFamilies: Record<JournalFont, { label: string; family: string; sizeMultiplier: number }> = {
  grotesk: { label: 'Grotesk', family: fonts.headingMedium, sizeMultiplier: 1 },
  inter: { label: 'Inter', family: fonts.body, sizeMultiplier: 1 },
  serif: { label: 'Serif', family: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }) as string, sizeMultiplier: 1 },
  mono: { label: 'Mono', family: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string, sizeMultiplier: 1 },
  // Latin-script only — text in other scripts (e.g. Arabic) falls back to the
  // system font for these two. A script-appropriate handwriting font can be
  // added later if needed.
  caveat: { label: 'Caveat', family: fonts.handwritingCaveat, sizeMultiplier: 1.12 },
  patrickHand: { label: 'Patrick Hand', family: fonts.handwritingPatrickHand, sizeMultiplier: 1.12 },
};

export const textSizes: Record<JournalTextSize, { label: string; size: number; line: number }> = {
  small: { label: 'S', size: 15, line: 24 },
  medium: { label: 'M', size: 18, line: 29 },
  large: { label: 'L', size: 21, line: 33 },
  xlarge: { label: 'XL', size: 25, line: 38 },
};

export const templateOptions: { id: JournalPageTemplate; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'blank', label: 'Blank', icon: 'document-outline' },
  { id: 'lined', label: 'Lined', icon: 'reorder-four-outline' },
  { id: 'margin', label: 'Margin', icon: 'reader-outline' },
  { id: 'grid', label: 'Grid', icon: 'grid-outline' },
  { id: 'dots', label: 'Dots', icon: 'ellipsis-horizontal' },
];


// The shared Feelings Wheel v2 picker (zone → word). Since the color chip
// (Part A) already picked a zone, "Be more specific" opens directly at the
// word step for that zone, skipping the zone step entirely — per the
// Identify the Feeling v2 doc.
function FeelingDepthPicker({
  initialZone,
  onDone,
}: {
  initialZone: FeelingZone;
  onDone: (zone: FeelingZone, feelingId: string) => void;
}) {
  const [step, setStep] = useState<FeelingPickerStep>({ kind: 'word', zone: initialZone });
  return (
    <FeelingPicker
      step={step}
      onPickZone={(zone) => setStep({ kind: 'word', zone })}
      onBack={() => setStep({ kind: 'zone' })}
      onPickFeeling={(f: PickedFeeling) => onDone(f.zone, f.id)}
    />
  );
}

export function JournalWriteScreen({ route, navigation }: Props) {
  const { date } = route.params;
  const entries = useJournalStore((s) => s.entries);
  // Shared with Settings → Sections → Journaling (one source of truth).
  const pageStyle = useSettingsStore((s) => s.journalPageStyle);
  const setPageStyle = useSettingsStore((s) => s.setJournalPageStyle);
  const defaultFont = useSettingsStore((s) => s.journalDefaultFont);
  const promptsOn = useSettingsStore((s) => s.journalPrompts);
  const upsertEntry = useJournalStore((s) => s.upsertEntry);
  const deleteEntry = useJournalStore((s) => s.deleteEntry);
  const { requestDelete, showDialog } = useUi();

  const existing = entries.find((e) => e.date === date);

  // One screen, two modes — read mode when an entry already exists (no
  // keyboard, Edit/Delete live in the top bar), edit mode otherwise. Tapping
  // Edit switches this same screen into edit mode in place.
  const [mode, setMode] = useState<'read' | 'edit'>(existing ? 'read' : 'edit');
  const [text, setText] = useState(existing?.text ?? '');
  const [zone, setZone] = useState<FeelingZone>(existing?.zone ?? 'calm');
  const [preciseFeelingId, setPreciseFeelingId] = useState<string | undefined>(existing?.preciseFeelingId);
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '');
  const [font, setFont] = useState<JournalFont>(existing?.font ?? defaultFont);
  const [showTags, setShowTags] = useState(false);
  const [showStyle, setShowStyle] = useState(false);
  const [showColorSheet, setShowColorSheet] = useState(false);
  const [showFeelingPicker, setShowFeelingPicker] = useState(false);
  const [promptIndex, setPromptIndex] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  const theme = backgroundThemes[pageStyle.background];
  const fontMeta = fontFamilies[font];
  const size = textSizes[pageStyle.size];
  const effectiveFontSize = Math.round(size.size * fontMeta.sizeMultiplier);

  const dirty = useMemo(
    () =>
      mode === 'edit' &&
      (text !== (existing?.text ?? '') ||
        zone !== (existing?.zone ?? 'calm') ||
        preciseFeelingId !== existing?.preciseFeelingId ||
        tags !== (existing?.tags.join(', ') ?? '') ||
        font !== (existing?.font ?? defaultFont)),
    [mode, text, zone, preciseFeelingId, tags, font, existing]
  );

  const save = () => {
    upsertEntry(
      date,
      zone,
      text,
      tags.split(',').map((t) => t.trim()).filter(Boolean),
      { preciseFeelingId, font }
    );
    setMode('read');
  };

  useBackHandler({ dirty, onSave: save });

  const confirmDelete = () => {
    if (!existing) return;
    const previous = useJournalStore.getState().entries;
    requestDelete({
      message: `Your entry for ${formatDisplayDate(date)} will be removed.`,
      toastMessage: 'Entry deleted',
      perform: () => {
        deleteEntry(existing.id);
        navigation.goBack();
      },
      restore: () => useJournalStore.setState({ entries: previous }),
    });
  };

  const openOverflow = () => {
    showDialog({
      title: 'This entry',
      actions: [
        { label: 'Delete', style: 'destructive', onPress: confirmDelete },
        { label: 'Cancel', style: 'cancel' },
      ],
    });
  };

  const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <View style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={theme.soft} />
          </Pressable>
          <View style={styles.topActions}>
            {mode === 'read' ? (
              <>
                <Pressable hitSlop={10} onPress={() => setMode('edit')}>
                  <Ionicons name="pencil-outline" size={20} color={theme.text} />
                </Pressable>
                <Pressable hitSlop={10} onPress={openOverflow}>
                  <Ionicons name="ellipsis-horizontal" size={22} color={theme.text} />
                </Pressable>
              </>
            ) : (
              <>
                <Pressable hitSlop={10} onPress={() => setShowStyle(true)}>
                  <Text style={[styles.aa, { color: theme.soft }]}>Aa</Text>
                </Pressable>
                <Pressable hitSlop={10} onPress={save}>
                  <Text style={[styles.saveText, { color: theme.text }]}>Save</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        <KeyboardAwareScrollView
          bottomOffset={70}
          style={styles.flex}
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={[styles.dateLabel, { color: theme.soft }]}>{formatDisplayDate(date)}</Text>

          {/* Every color must have a visible feeling name, one tap away at
              most — see the Journaling revision doc. */}
          <View style={styles.feelingRow}>
            {mode === 'edit' ? (
              <Pressable onPress={() => setShowColorSheet(true)} style={[styles.chip, { borderColor: theme.soft }]}>
                <View style={[styles.chipDot, { backgroundColor: zoneMeta(zone).accent }]} />
                <Text style={[styles.chipText, { color: theme.text }]}>{feelingLabel({ zone, preciseFeelingId })}</Text>
                <Ionicons name="chevron-down" size={12} color={theme.soft} />
              </Pressable>
            ) : (
              <View style={[styles.chip, styles.chipStatic, { borderColor: theme.soft }]}>
                <View style={[styles.chipDot, { backgroundColor: zoneMeta(zone).accent }]} />
                <Text style={[styles.chipText, { color: theme.text }]}>{feelingLabel({ zone, preciseFeelingId })}</Text>
              </View>
            )}
            {mode === 'edit' && (
              <Pressable hitSlop={8} onPress={() => setShowFeelingPicker(true)}>
                <Text style={[styles.beMoreSpecific, { color: theme.soft }]}>Be more specific</Text>
              </Pressable>
            )}
          </View>

          {mode === 'edit' && promptIndex !== null && (
            <Pressable onPress={() => setPromptIndex((i) => ((i ?? 0) + 1) % journalPrompts.length)}>
              <Text style={[styles.prompt, { color: theme.soft, fontFamily: fontMeta.family }]}>
                {journalPrompts[promptIndex]}
              </Text>
            </Pressable>
          )}

          <View
            style={styles.pageWrap}
            onLayout={(e) => setPageSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          >
            <JournalPageSurface
              template={pageStyle.template}
              width={pageSize.width}
              height={pageSize.height}
              lineHeight={size.line}
              color={withAlpha(theme.soft, 0.4)}
            />
            {mode === 'edit' ? (
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Start writing..."
                placeholderTextColor={theme.soft}
                multiline
                autoFocus
                scrollEnabled={false}
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    fontFamily: fontMeta.family,
                    fontSize: effectiveFontSize,
                    lineHeight: size.line,
                    paddingLeft: pageStyle.template === 'margin' ? MARGIN_INSET : 0,
                  },
                ]}
                cursorColor={theme.text}
                selectionColor={theme.soft}
              />
            ) : (
              <Text
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    fontFamily: fontMeta.family,
                    fontSize: effectiveFontSize,
                    lineHeight: size.line,
                    paddingLeft: pageStyle.template === 'margin' ? MARGIN_INSET : 0,
                  },
                ]}
              >
                {text}
              </Text>
            )}
          </View>

          {mode === 'read' && (
            <View style={styles.readFooter}>
              <Text style={[styles.wordCount, { color: theme.soft }]}>{countWords(text)} words</Text>
              {tagList.length > 0 && (
                <Text style={[styles.readTags, { color: theme.soft }]}>{tagList.map((t) => `#${t}`).join('  ')}</Text>
              )}
            </View>
          )}
        </KeyboardAwareScrollView>

        {mode === 'edit' && (
          <KeyboardStickyView>
            <View style={styles.bottomBar}>
              <Text style={[styles.wordCount, { color: theme.soft }]}>{countWords(text)} words</Text>
              <View style={styles.bottomActions}>
                <Pressable hitSlop={10} onPress={() => setShowTags((v) => !v)}>
                  <Ionicons name="pricetag-outline" size={20} color={showTags ? theme.text : theme.soft} />
                </Pressable>
                {promptsOn && (
                  <Pressable hitSlop={10} onPress={() => setPromptIndex((i) => (i === null ? 0 : null))} accessibilityLabel="Writing prompt">
                    <Ionicons name="bulb-outline" size={21} color={promptIndex !== null ? theme.text : theme.soft} />
                  </Pressable>
                )}
              </View>
            </View>
            {showTags && (
              <TextInput
                value={tags}
                onChangeText={setTags}
                placeholder="Tags: gratitude, worry..."
                placeholderTextColor={theme.soft}
                style={[styles.tagsInput, { color: theme.text, borderTopColor: theme.soft }]}
              />
            )}
          </KeyboardStickyView>
        )}
      </View>

      <SheetModal visible={showColorSheet} onClose={() => setShowColorSheet(false)}>
        <View style={styles.sheetHeader}>
          <SectionHeading>Choose a color</SectionHeading>
          <Pressable hitSlop={8} onPress={() => setShowColorSheet(false)}>
            <Ionicons name="close" size={22} color={colors.inkSoft} />
          </Pressable>
        </View>
        {feelingZones.map((z) => (
          <Pressable
            key={z.id}
            style={[styles.colorRow, zone === z.id && { backgroundColor: withAlpha(z.accent, 0.12) }]}
            onPress={() => {
              setZone(z.id);
              setPreciseFeelingId(undefined);
              setShowColorSheet(false);
            }}
          >
            <View style={[styles.colorRowDot, { backgroundColor: z.accent }]} />
            <SectionHeading style={{ color: z.accent }}>{z.label}</SectionHeading>
            {zone === z.id && <Ionicons name="checkmark" size={18} color={z.accent} style={styles.colorRowCheck} />}
          </Pressable>
        ))}
      </SheetModal>

      <SheetModal visible={showFeelingPicker} onClose={() => setShowFeelingPicker(false)}>
        <View style={styles.sheetHeader}>
          <SectionHeading>Be more specific</SectionHeading>
          <Pressable hitSlop={8} onPress={() => setShowFeelingPicker(false)}>
            <Ionicons name="close" size={22} color={colors.inkSoft} />
          </Pressable>
        </View>
        <FeelingDepthPicker
          initialZone={zone}
          onDone={(z, feelingId) => {
            setZone(z);
            setPreciseFeelingId(feelingId);
            setShowFeelingPicker(false);
          }}
        />
      </SheetModal>

      <SheetModal visible={showStyle} onClose={() => setShowStyle(false)}>
        <View style={styles.sheetHeader}>
          <SectionHeading>Page appearance</SectionHeading>
          <Pressable hitSlop={8} onPress={() => setShowStyle(false)}>
            <Ionicons name="close" size={22} color={colors.inkSoft} />
          </Pressable>
        </View>

        <Eyebrow>Background</Eyebrow>
        <View style={styles.swatchRow}>
          {(Object.keys(backgroundThemes) as JournalBackground[]).map((key) => (
            <Pressable key={key} onPress={() => setPageStyle({ background: key })} style={styles.swatchWrap}>
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: backgroundThemes[key].bg },
                  pageStyle.background === key && styles.swatchActive,
                ]}
              >
                <Text style={{ color: backgroundThemes[key].text, fontFamily: fonts.bodyMedium }}>Aa</Text>
              </View>
              <Caption>{backgroundThemes[key].label}</Caption>
            </Pressable>
          ))}
        </View>

        <Eyebrow style={styles.gap}>Page style</Eyebrow>
        <View style={styles.optionRow}>
          {templateOptions.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setPageStyle({ template: t.id })}
              style={[styles.option, styles.optionWithIcon, pageStyle.template === t.id && styles.optionActive]}
            >
              <Ionicons name={t.icon} size={15} color={pageStyle.template === t.id ? colors.white : colors.inkSoft} />
              <Text style={[styles.optionText, pageStyle.template === t.id && { color: colors.white }]}> {t.label}</Text>
            </Pressable>
          ))}
        </View>

        <Eyebrow style={styles.gap}>Font</Eyebrow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.optionRow}>
            {(Object.keys(fontFamilies) as JournalFont[]).map((key) => (
              <Pressable
                key={key}
                onPress={() => setFont(key)}
                style={[styles.option, font === key && styles.optionActive]}
              >
                <Text
                  style={[
                    styles.optionText,
                    { fontFamily: fontFamilies[key].family },
                    font === key && { color: colors.white },
                  ]}
                >
                  {fontFamilies[key].label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <Eyebrow style={styles.gap}>Text size</Eyebrow>
        <View style={styles.optionRow}>
          {(Object.keys(textSizes) as JournalTextSize[]).map((key) => (
            <Pressable
              key={key}
              onPress={() => setPageStyle({ size: key })}
              style={[styles.option, pageStyle.size === key && styles.optionActive]}
            >
              <Text style={[styles.optionText, pageStyle.size === key && { color: colors.white }]}>
                {textSizes[key].label}
              </Text>
            </Pressable>
          ))}
        </View>
      </SheetModal>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  aa: { fontFamily: fonts.headingMedium, fontSize: 18 },
  saveText: { fontFamily: fonts.bodyMedium, fontSize: 16 },
  page: { paddingHorizontal: spacing.lg + 4, paddingBottom: spacing.xxl * 2, flexGrow: 1 },
  dateLabel: { fontFamily: fonts.body, fontSize: 13, marginBottom: spacing.sm },
  feelingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  chipStatic: {},
  chipDot: { width: 10, height: 10, borderRadius: radii.full },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14 },
  beMoreSpecific: { fontFamily: fonts.body, fontSize: 13, textDecorationLine: 'underline' },
  prompt: { fontSize: 16, fontStyle: 'italic', marginBottom: spacing.md },
  pageWrap: { minHeight: 300 },
  input: { padding: 0, minHeight: 300, textAlignVertical: 'top' },
  optionWithIcon: { flexDirection: 'row', alignItems: 'center' },
  readFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  wordCount: { fontFamily: fonts.body, fontSize: 12 },
  readTags: { fontFamily: fonts.body, fontSize: 12 },
  bottomActions: { flexDirection: 'row', gap: spacing.lg },
  tagsInput: {
    fontFamily: fonts.body,
    fontSize: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
  },
  colorRowDot: { width: 16, height: 16, borderRadius: radii.full },
  colorRowCheck: { marginLeft: 'auto' },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  swatchWrap: { alignItems: 'center', gap: 4 },
  swatch: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: { borderColor: colors.teal },
  gap: { marginTop: spacing.sm },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.stone,
  },
  optionActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  optionText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
}));
