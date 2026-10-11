import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { SheetModal } from '../components/SheetModal';
import { useUi } from '../components/UiProvider';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing, radii, fonts } from '../theme';
import { useThoughtsStore } from '../store/useThoughtsStore';
import { addDaysISO, todayISO } from '../utils/date';
import type { CapturedThought, ThoughtKind } from '../types/sections';
import type { RootStackParamList } from '../navigation/types';
import { themedStyles } from '../theme/runtime';

type Props = NativeStackScreenProps<RootStackParamList, 'catchAThought'>;

const kindMeta: Record<ThoughtKind, { label: string; icon: keyof typeof Ionicons.glyphMap; accent: string }> = {
  idea: { label: 'Idea', icon: 'bulb-outline', accent: '#D98F4E' },
  feeling: { label: 'Feeling', icon: 'heart-outline', accent: '#C97B5A' },
  random: { label: 'Random Thought', icon: 'sparkles-outline', accent: '#8B72B0' },
};

const REVISIT_AFTER_DAYS = 5;

function isStale(thought: CapturedThought): boolean {
  if (thought.promotedTo) return false;
  const createdDate = thought.createdAt.slice(0, 10);
  return createdDate <= addDaysISO(todayISO(), -REVISIT_AFTER_DAYS);
}

export function CatchAThoughtScreen({ navigation }: Props) {
  const thoughts = useThoughtsStore((s) => s.thoughts);
  const addThought = useThoughtsStore((s) => s.addThought);
  const deleteThought = useThoughtsStore((s) => s.deleteThought);
  const promoteToPlan = useThoughtsStore((s) => s.promoteToPlan);
  const promoteToJournal = useThoughtsStore((s) => s.promoteToJournal);

  const { showToast, requestDelete, showDialog } = useUi();
  const [filter, setFilter] = useState<ThoughtKind | 'all'>('all');
  const [captureVisible, setCaptureVisible] = useState(false);
  const [captureKind, setCaptureKind] = useState<ThoughtKind>('idea');
  const [captureText, setCaptureText] = useState('');
  const [selectedThought, setSelectedThought] = useState<CapturedThought | null>(null);

  const filtered = filter === 'all' ? thoughts : thoughts.filter((t) => t.kind === filter);

  const closeCapture = () => {
    setCaptureVisible(false);
    setCaptureText('');
    setCaptureKind('idea');
  };

  const requestCloseCapture = () => {
    if (!captureText.trim()) return closeCapture();
    showDialog({
      title: 'Save your changes before leaving?',
      actions: [
        { label: 'Cancel', style: 'cancel' },
        { label: 'Discard', style: 'destructive', onPress: closeCapture },
        {
          label: 'Save',
          style: 'default',
          onPress: () => {
            addThought(captureKind, captureText);
            closeCapture();
          },
        },
      ],
    });
  };

  const handlePromoteToPlan = (thought: CapturedThought) => {
    const planId = promoteToPlan(thought.id);
    setSelectedThought(null);
    if (planId) navigation.navigate('planDetail', { planId });
  };

  const handlePromoteToJournal = (thought: CapturedThought) => {
    promoteToJournal(thought.id);
    setSelectedThought(null);
    showToast({ message: "Added to today's journal entry" });
  };

  return (
    <Screen>
      <ScreenTitle>Catch a Feeling or Idea</ScreenTitle>
      <Caption style={styles.subtitle}>Quick capture, revisit later — not meant to be acted on right away</Caption>

      <View style={styles.filterRow}>
        {(['all', 'idea', 'feeling', 'random'] as const).map((f) => {
          const active = filter === f;
          const label = f === 'all' ? 'All' : kindMeta[f].label;
          return (
            <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filterChip, active && styles.filterChipActive]}>
              <Body style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Body>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.list}>
        {filtered.length === 0 && <Body style={styles.emptyText}>Nothing caught yet.</Body>}
        {filtered.map((thought) => {
          const meta = kindMeta[thought.kind];
          const stale = isStale(thought);
          return (
            <Pressable key={thought.id} onPress={() => setSelectedThought(thought)}>
              <Card style={[styles.thoughtCard, { borderLeftColor: meta.accent, borderLeftWidth: 3 }]}>
                <View style={styles.thoughtHeader}>
                  <View style={styles.kindTag}>
                    <Ionicons name={meta.icon} size={14} color={meta.accent} />
                    <Caption style={[styles.kindText, { color: meta.accent }]}>{meta.label}</Caption>
                  </View>
                  <Caption>{new Date(thought.createdAt).toLocaleDateString()}</Caption>
                </View>
                <Body numberOfLines={3}>{thought.text}</Body>
                {thought.promotedTo && (
                  <Caption style={styles.promotedText}>
                    ✓ Promoted to {thought.promotedTo === 'plan' ? 'Plan Builder' : 'Journal'}
                  </Caption>
                )}
                {stale && <Caption style={styles.staleText}>Worth revisiting — caught a while ago</Caption>}
              </Card>
            </Pressable>
          );
        })}
      </View>

      <PrimaryButton label="Catch something" style={styles.captureButton} onPress={() => setCaptureVisible(true)} />

      <SheetModal visible={captureVisible} onClose={requestCloseCapture}>
        <>
            <View style={styles.modalHeader}>
              <SectionHeading>Catch something</SectionHeading>
              <Pressable hitSlop={8} onPress={requestCloseCapture}>
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </Pressable>
            </View>

            <Eyebrow style={styles.fieldLabel}>What kind is it?</Eyebrow>
            <View style={styles.kindPickerRow}>
              {(Object.keys(kindMeta) as ThoughtKind[]).map((k) => {
                const meta = kindMeta[k];
                const active = captureKind === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setCaptureKind(k)}
                    style={[styles.kindChip, { borderColor: meta.accent }, active && { backgroundColor: meta.accent }]}
                  >
                    <Ionicons name={meta.icon} size={14} color={active ? colors.white : meta.accent} />
                    <Caption style={active ? styles.kindChipTextActive : { color: meta.accent }}> {meta.label}</Caption>
                  </Pressable>
                );
              })}
            </View>

            <Eyebrow style={styles.fieldLabel}>What's on your mind?</Eyebrow>
            <TextInput
              value={captureText}
              onChangeText={setCaptureText}
              placeholder="Type it out..."
              placeholderTextColor={colors.inkSoft}
              style={styles.captureInput}
              multiline
              autoFocus
            />
            <Pressable style={styles.voiceStub} onPress={() => showToast({ message: 'Voice capture arrives once microphone access is wired up' })}>
              <Ionicons name="mic-outline" size={16} color={colors.inkSoft} />
              <Caption> Voice capture (coming soon)</Caption>
            </Pressable>

            <PrimaryButton
              label="Save"
              style={styles.modalSaveButton}
              onPress={() => {
                if (captureText.trim()) addThought(captureKind, captureText);
                closeCapture();
              }}
            />
        </>
      </SheetModal>

      <SheetModal visible={!!selectedThought} onClose={() => setSelectedThought(null)}>
        {selectedThought && (
          <>
              <View style={styles.modalHeader}>
                <View style={styles.kindTag}>
                  <Ionicons name={kindMeta[selectedThought.kind].icon} size={16} color={kindMeta[selectedThought.kind].accent} />
                  <Caption style={{ color: kindMeta[selectedThought.kind].accent }}> {kindMeta[selectedThought.kind].label}</Caption>
                </View>
                <Pressable hitSlop={8} onPress={() => setSelectedThought(null)}>
                  <Ionicons name="close" size={22} color={colors.inkSoft} />
                </Pressable>
              </View>
              <Body style={styles.detailText}>{selectedThought.text}</Body>
              <Caption>{new Date(selectedThought.createdAt).toLocaleString()}</Caption>

              <View style={styles.promoteRow}>
                <PrimaryButton
                  label="Promote to Plan"
                  variant="outline"
                  style={styles.promoteButton}
                  onPress={() => handlePromoteToPlan(selectedThought)}
                />
                <PrimaryButton
                  label="Add to Journal"
                  variant="outline"
                  style={styles.promoteButton}
                  onPress={() => handlePromoteToJournal(selectedThought)}
                />
              </View>
              <Pressable
                style={styles.deleteRow}
                onPress={() => {
                  const thought = selectedThought;
                  const previous = useThoughtsStore.getState().thoughts;
                  setSelectedThought(null);
                  requestDelete({
                    message: `"${thought.text.slice(0, 60)}${thought.text.length > 60 ? '...' : ''}" will be removed.`,
                    toastMessage: 'Deleted',
                    perform: () => deleteThought(thought.id),
                    restore: () => useThoughtsStore.setState({ thoughts: previous }),
                  });
                }}
              >
                <Ionicons name="trash-outline" size={16} color="#B3413A" />
                <Body style={styles.deleteText}> Delete</Body>
              </Pressable>
          </>
        )}
      </SheetModal>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  thoughtCard: {
    gap: spacing.xs,
  },
  thoughtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kindTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kindText: {},
  promotedText: {
    color: colors.teal,
  },
  staleText: {
    color: colors.amber,
  },
  captureButton: {
    marginBottom: spacing.lg,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    gap: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldLabel: {
    marginTop: spacing.xs,
  },
  kindPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kindChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1.5,
  },
  kindChipTextActive: {
    color: colors.white,
  },
  captureInput: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    minHeight: 80,
    textAlignVertical: 'top',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: spacing.sm,
  },
  voiceStub: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalSaveButton: {
    marginTop: spacing.sm,
  },
  detailText: {
    marginTop: spacing.xs,
  },
  promoteRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  promoteButton: {
    flex: 1,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
  },
  deleteText: {
    color: '#B3413A',
  },
}));
