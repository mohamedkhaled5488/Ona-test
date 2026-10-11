import React from 'react';
import { Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { SectionHeading, Eyebrow, Body, Caption } from './Typography';
import { PrimaryButton } from './PrimaryButton';
import { colors, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

interface EntryDetailViewProps {
  accent: string;
  title: string; // e.g. a formatted date
  subtitle?: string; // e.g. "20 min · technique" or a status label
  backLabel?: string;
  notes?: string;
  photoUri?: string;
  hasVoiceMemo?: boolean;
  onBack: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  children?: React.ReactNode; // extra section-specific content (e.g. a tag chip)
  // Off for pages whose children already render their own notes.
  showEmptyNote?: boolean;
}

// A dedicated "what was documented that day" detail view — shared by Skills'
// past-session detail and Habit Builder's past-day detail, so tapping into
// history behaves the same way everywhere in the app. Works the same
// whether the entry has just a note, just a photo, both, or neither.
export function EntryDetailView({
  accent,
  title,
  subtitle,
  backLabel = 'Back',
  notes,
  photoUri,
  hasVoiceMemo,
  onBack,
  onEdit,
  onDelete,
  children,
  showEmptyNote = true,
}: EntryDetailViewProps) {
  const hasAnything = !!notes || !!photoUri || !!hasVoiceMemo;

  return (
    <>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> {backLabel}</Caption>
        </Pressable>
        {onDelete && (
          <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete">
            <Ionicons name="trash-outline" size={18} color={colors.inkSoft} />
          </Pressable>
        )}
      </View>

      <SectionHeading style={{ color: accent }}>{title}</SectionHeading>
      {subtitle && <Caption style={styles.subtitle}>{subtitle}</Caption>}

      {children}

      {photoUri && <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />}

      {notes && (
        <Card style={styles.notesCard}>
          <Eyebrow>Notes</Eyebrow>
          <Body>{notes}</Body>
        </Card>
      )}

      {hasVoiceMemo && (
        <View style={styles.voiceBadge}>
          <Ionicons name="mic" size={14} color={colors.inkSoft} />
          <Caption> Voice memo attached</Caption>
        </View>
      )}

      {!hasAnything && showEmptyNote && <Caption style={styles.emptyText}>Nothing else was documented for this entry.</Caption>}

      {onEdit && <PrimaryButton label="Edit" variant="outline" onPress={onEdit} style={styles.editButton} />}
    </>
  );
}

const styles = themedStyles(() => ({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.md,
  },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: radii.md,
    backgroundColor: colors.stone,
    marginBottom: spacing.md,
  },
  notesCard: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  voiceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyText: {
    color: colors.inkSoft,
    marginBottom: spacing.md,
  },
  editButton: {
    marginBottom: spacing.lg,
  },
}));
