import { PlusGate } from '../components/PlusGate';
import React, { useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing, radii, fonts } from '../theme';
import { withAlpha } from '../utils/color';
import { useJournalStore } from '../store/useJournalStore';
import { feelingZones, zoneColors } from '../data/feelingsWheel';
import { computeStreak, countWords, totalWordCount, findOnThisDay, feelingLabel } from '../utils/journalStats';
import { addMonthsISO, formatDisplayDate, formatMonthLabel, getMonthGrid, rotateWeekdays, todayISO } from '../utils/date';
import { useSettingsStore } from '../store/useSettingsStore';
import { themedStyles } from '../theme/runtime';

type Props = NativeStackScreenProps<RootStackParamList, 'journaling'>;

const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function JournalingScreen({ navigation }: Props) {
  const entries = useJournalStore((s) => s.entries);

  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [calendarMonth, setCalendarMonth] = useState(todayISO());
  const [searchQuery, setSearchQuery] = useState('');
  // The lock lives in Settings (one source of truth); this row links there.
  const lockEnabled = useSettingsStore((s) => s.journalLock);

  const selectedEntry = entries.find((e) => e.date === selectedDate);

  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const grid = getMonthGrid(calendarMonth, weekStartsOn);
  const streak = computeStreak(entries, todayISO());
  const onThisDayOn = useSettingsStore((s) => s.journalOnThisDay);
  const onThisDay = onThisDayOn ? findOnThisDay(entries, todayISO()) : undefined;

  const searchResults = searchQuery.trim()
    ? entries.filter((e) => {
        const q = searchQuery.trim().toLowerCase();
        return e.text.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q));
      })
    : null;

  const historyList = (searchResults ?? entries).slice().sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Screen>
      <View style={styles.headerRow}>
        <ScreenTitle>Journaling</ScreenTitle>
        <View style={styles.headerActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Catch a thought" onPress={() => navigation.navigate('catchAThought')} hitSlop={8}>
            <Ionicons name="sparkles-outline" size={20} color={colors.inkSoft} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Share journal"
            onPress={() =>
              Share.share({
                message: entries
                  .slice()
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((e) => `${e.date} [${feelingLabel(e)}]\n${e.text}`)
                  .join('\n\n'),
              })
            }
            hitSlop={8}
          >
            <Ionicons name="share-outline" size={20} color={colors.inkSoft} />
          </Pressable>
        </View>
      </View>
      <Caption style={styles.subtitle}>A color for every day</Caption>

      <View style={styles.statsRow}>
        <Card style={styles.statCard} flat>
          <Eyebrow style={styles.statText}>Streak</Eyebrow>
          <SectionHeading style={styles.statText}>{streak} {streak === 1 ? 'day' : 'days'}</SectionHeading>
        </Card>
        <Card style={styles.statCard} flat>
          <Eyebrow style={styles.statText}>Words written</Eyebrow>
          <SectionHeading style={styles.statText}>{totalWordCount(entries)}</SectionHeading>
        </Card>
      </View>

      <Pressable
        style={styles.lockRow}
        onPress={() => navigation.navigate('settings', { page: 'section', section: 'journaling' })}
        accessibilityRole="button"
        accessibilityLabel="Journaling lock settings"
      >
        <Caption>Lock Journaling with a PIN</Caption>
        <View style={styles.lockValue}>
          <Caption>{lockEnabled ? 'On' : 'Off'}</Caption>
          <Ionicons name="chevron-forward" size={14} color={colors.inkSoft} />
        </View>
      </Pressable>

      {/* Plus. The entry itself always stays in your journal below. */}
      {onThisDay && (
        <PlusGate feature="journalOnThisDay">
          <Card style={styles.onThisDayCard}>
            <Eyebrow>On this day</Eyebrow>
            <Caption>{onThisDay.date}</Caption>
            <Body numberOfLines={3}>{onThisDay.text}</Body>
          </Card>
        </PlusGate>
      )}

      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search entries or tags..."
        placeholderTextColor={colors.inkSoft}
        style={styles.searchInput}
      />

      {!searchResults && (
        <Card style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={8} onPress={() => setCalendarMonth((m) => addMonthsISO(m, -1))}>
              <Ionicons name="chevron-back" size={18} color={colors.ink} />
            </Pressable>
            <SectionHeading>{formatMonthLabel(calendarMonth)}</SectionHeading>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" hitSlop={8} onPress={() => setCalendarMonth((m) => addMonthsISO(m, 1))}>
              <Ionicons name="chevron-forward" size={18} color={colors.ink} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {rotateWeekdays(weekdayLabels, weekStartsOn).map((label, i) => (
              <Caption key={i} style={styles.weekdayLabel}>
                {label}
              </Caption>
            ))}
          </View>

          <View style={styles.grid}>
            {grid.map((date, i) => {
              if (!date) return <View key={`blank-${i}`} style={styles.dayCell} />;
              const entry = entries.find((e) => e.date === date);
              const isSelected = date === selectedDate;
              const isToday = date === todayISO();
              const dayNumber = Number(date.slice(-2));
              return (
                <Pressable key={date} onPress={() => setSelectedDate(date)} style={styles.dayCell}>
                  <View
                    style={[
                      styles.dayBlock,
                      entry ? { backgroundColor: zoneColors[entry.zone] } : styles.dayBlockEmpty,
                      isSelected && styles.dayBlockSelected,
                    ]}
                  >
                    <Caption style={[styles.dayNumber, !!entry && styles.dayNumberOnColor]}>{dayNumber}</Caption>
                  </View>
                  {isToday && <View style={styles.todayDot} />}
                </Pressable>
              );
            })}
          </View>

          {/* Every color must have a visible name — see the Journaling revision doc. */}
          <View style={styles.legendRow}>
            {feelingZones.map((fam) => (
              <View key={fam.id} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: fam.accent }]} />
                <Caption style={styles.legendLabel}>{fam.label}</Caption>
              </View>
            ))}
          </View>
        </Card>
      )}

      {!searchResults && (
        <Card style={styles.editorCard}>
          <Eyebrow>{selectedDate === todayISO() ? "Today's entry" : formatDisplayDate(selectedDate)}</Eyebrow>

          {selectedEntry ? (
            <>
              <View style={styles.previewBox}>
                <View style={styles.moodTag}>
                  <View style={[styles.moodDot, { backgroundColor: zoneColors[selectedEntry.zone] }]} />
                  <Caption>{feelingLabel(selectedEntry)}</Caption>
                </View>
                <Body numberOfLines={4}>{selectedEntry.text}</Body>
              </View>
              <PrimaryButton
                label="Open entry"
                onPress={() => navigation.navigate('journalWrite', { date: selectedDate })}
              />
            </>
          ) : (
            <>
              <Caption>Nothing written for this day yet.</Caption>
              <PrimaryButton
                label="Start writing"
                onPress={() => navigation.navigate('journalWrite', { date: selectedDate })}
              />
            </>
          )}
        </Card>
      )}

      <SectionHeading style={styles.historyTitle}>{searchResults ? 'Search results' : 'Past entries'}</SectionHeading>
      <View style={styles.entries}>
        {historyList.length === 0 && <Body style={styles.emptyText}>No entries found.</Body>}
        {historyList.map((entry) => (
          <Pressable key={entry.id} onPress={() => navigation.navigate('journalWrite', { date: entry.date })}>
            <Card style={styles.entryCard} flat>
              <View style={styles.entryHeader}>
                <View style={styles.moodTag}>
                  <View style={[styles.moodDot, { backgroundColor: zoneColors[entry.zone] }]} />
                  <Caption>{feelingLabel(entry)}</Caption>
                </View>
                <Caption>{entry.date}</Caption>
              </View>
              <Body numberOfLines={2}>{entry.text}</Body>
              {entry.tags.length > 0 && <Caption style={styles.tagsText}>{entry.tags.map((t) => `#${t}`).join('  ')}</Caption>}
            </Card>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    gap: 2,
    backgroundColor: withAlpha(colors.teal, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  statText: { textAlign: 'center' },
  lockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    minHeight: 32,
  },
  lockValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  onThisDayCard: {
    gap: 4,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.amber,
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
    marginBottom: spacing.md,
  },
  calendarCard: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 3,
  },
  dayBlock: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBlockEmpty: {
    backgroundColor: colors.stone,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dayBlockSelected: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  dayNumber: {
    fontSize: 11,
  },
  dayNumberOnColor: {
    color: colors.white,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.amber,
    marginTop: 3,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
  },
  legendLabel: {},
  previewBox: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  editorCard: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  historyTitle: {
    marginBottom: spacing.sm,
  },
  entries: {
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.inkSoft,
  },
  entryCard: {
    gap: spacing.xs,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  moodTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moodDot: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
  },
  tagsText: {
    color: colors.teal,
  },
}));
