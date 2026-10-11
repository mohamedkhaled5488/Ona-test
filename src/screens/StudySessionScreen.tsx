import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import { useBackHandler } from '../hooks/useBackHandler';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { TimerRing } from '../components/TimerRing';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing, radii, fonts } from '../theme';
import { withAlpha } from '../utils/color';
import { useStudyStore } from '../store/useStudyStore';
import { studyPresets, ambientSoundOptions } from '../data/studyPresets';
import { computeStudyStreak, last7DaysMinutes, minutesInLastDays, minutesOnDate } from '../utils/studyStats';
import { formatDisplayDate, todayISO } from '../utils/date';
import type { AmbientSound } from '../types/sections';
import { playLayer, stopLayer } from '../utils/audioEngine';
import { BackgroundAudioToggle } from '../components/BackgroundAudioToggle';
import { StudySessionDetail } from './StudySessionDetail';
import { themedStyles } from '../theme/runtime';
import { useSettingsStore } from '../store/useSettingsStore';

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function SetupView({ onShowHistory }: { onShowHistory: () => void }) {
  const start = useStudyStore((s) => s.start);

  const [presetId, setPresetId] = useState(() => {
    const preferred = useSettingsStore.getState().studyDefaultPreset;
    return studyPresets.some((p) => p.id === preferred) ? preferred : studyPresets[0].id;
  });
  const [customFocus, setCustomFocus] = useState('45');
  const [customBreak, setCustomBreak] = useState('15');
  const [subject, setSubject] = useState('');
  // Starts from Settings → Sound → Default study sound.
  const [ambientSound, setAmbientSound] = useState<AmbientSound>(() => useSettingsStore.getState().defaultStudySound);
  const [appBlockingEnabled, setAppBlockingEnabled] = useState(false);

  const isCustom = presetId === 'custom';
  const preset = studyPresets.find((p) => p.id === presetId);
  const focusMinutes = isCustom ? Number(customFocus) || 25 : preset?.focusMinutes ?? 25;
  const breakMinutes = isCustom ? Number(customBreak) || 5 : preset?.breakMinutes ?? 5;

  return (
    <>
      <View style={styles.headerRow}>
        <ScreenTitle>Study Session</ScreenTitle>
        <Pressable onPress={onShowHistory} style={styles.historyLink}>
          <Ionicons name="stats-chart-outline" size={16} color={colors.inkSoft} />
          <Caption> History</Caption>
        </Pressable>
      </View>
      <Caption style={styles.subtitle}>Set up your session before you start</Caption>

      <Card style={styles.section}>
        <Eyebrow>Length</Eyebrow>
        <View style={styles.presetRow}>
          {studyPresets.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setPresetId(p.id)}
              style={[styles.presetChip, presetId === p.id && styles.presetChipActive]}
            >
              <Body style={[styles.presetChipText, presetId === p.id && styles.presetChipTextActive]}>{p.name}</Body>
              <Caption style={presetId === p.id ? styles.presetChipSubActive : undefined}>
                {p.focusMinutes}/{p.breakMinutes} min
              </Caption>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setPresetId('custom')}
            style={[styles.presetChip, isCustom && styles.presetChipActive]}
          >
            <Body style={[styles.presetChipText, isCustom && styles.presetChipTextActive]}>Custom</Body>
          </Pressable>
        </View>
        {isCustom && (
          <View style={styles.customRow}>
            <View style={styles.customField}>
              <Caption>Focus (min)</Caption>
              <TextInput
                value={customFocus}
                onChangeText={setCustomFocus}
                keyboardType="number-pad"
                style={styles.customInput}
              />
            </View>
            <View style={styles.customField}>
              <Caption>Break (min)</Caption>
              <TextInput
                value={customBreak}
                onChangeText={setCustomBreak}
                keyboardType="number-pad"
                style={styles.customInput}
              />
            </View>
          </View>
        )}
      </Card>

      <Card style={styles.section}>
        <Eyebrow>Subject (optional)</Eyebrow>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="What are you working on?"
          placeholderTextColor={colors.inkSoft}
          style={styles.subjectInput}
        />
      </Card>

      <Card style={styles.section}>
        <Eyebrow>Ambient sound</Eyebrow>
        <View style={styles.soundRow}>
          {ambientSoundOptions.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => setAmbientSound(opt.id)}
              style={[styles.soundChip, ambientSound === opt.id && styles.soundChipActive]}
            >
              <Ionicons
                name={opt.icon as any}
                size={14}
                color={ambientSound === opt.id ? colors.white : colors.inkSoft}
              />
              <Caption style={ambientSound === opt.id ? styles.soundChipTextActive : undefined}> {opt.label}</Caption>
            </Pressable>
          ))}
        </View>
        {ambientSound !== 'none' && <BackgroundAudioToggle accent={colors.teal} />}
      </Card>

      <Card style={styles.section}>
        <View style={styles.blockRow}>
          <View style={styles.blockLabelWrap}>
            <Eyebrow>Block distracting apps</Eyebrow>
            <Caption>Stays off until device-level blocking is wired up</Caption>
          </View>
          <Switch
            value={appBlockingEnabled}
            onValueChange={setAppBlockingEnabled}
            trackColor={{ true: colors.teal, false: colors.line }}
          />
        </View>
      </Card>

      <PrimaryButton
        label={`Start ${focusMinutes} min session`}
        style={styles.startButton}
        onPress={() =>
          start({
            focusMinutes,
            breakMinutes,
            subject: subject.trim() || undefined,
            appBlockingEnabled,
            ambientSound,
            presetLabel: `${isCustom ? 'Custom' : preset?.name ?? 'Custom'} ${focusMinutes}/${breakMinutes}`,
          })
        }
      />
    </>
  );
}

function ActiveView() {
  const active = useStudyStore((s) => s.active);
  const tick = useStudyStore((s) => s.tick);
  const togglePause = useStudyStore((s) => s.togglePause);
  const skipPhase = useStudyStore((s) => s.skipPhase);
  const endEarly = useStudyStore((s) => s.endEarly);

  useEffect(() => {
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [tick]);

  // The chosen ambient sound plays for the whole session (focus and breaks)
  // through the shared audio engine — paused with the timer, stopped when
  // the session ends or this view goes away.
  const sound = active?.ambientSound ?? 'none';
  const shouldPlay = !!active && sound !== 'none' && !active.isPaused;
  const [soundError, setSoundError] = useState<string | null>(null);
  useEffect(() => {
    if (!shouldPlay) return;
    let cancelled = false;
    void playLayer(sound, 0.6).then((result) => {
      if (!cancelled) setSoundError(result.ok ? null : result.error);
    });
    return () => {
      cancelled = true;
      stopLayer(sound);
    };
  }, [shouldPlay, sound]);

  if (!active) return null;
  const isBreak = active.phase === 'break';

  return (
    <>
      <ScreenTitle>{isBreak ? 'Break' : 'Focus'}</ScreenTitle>
      {active.subject && <Caption style={styles.subtitle}>{active.subject}</Caption>}

      {active.appBlockingEnabled && (
        <View style={styles.blockingBadge}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.teal} />
          <Caption style={styles.blockingBadgeText}> App blocking active</Caption>
        </View>
      )}

      <TimerRing
        caption={isBreak ? 'Take a breather' : 'Stay with it'}
        timeText={formatClock(active.secondsRemaining)}
        subCaption={`Cycle ${active.cyclesCompleted + 1}`}
        variant={isBreak ? 'alt' : 'default'}
        primaryLabel={active.isPaused ? 'Resume' : 'Pause'}
        onPrimary={togglePause}
        secondaryLabel={isBreak ? 'Skip break' : 'Skip to break'}
        onSecondary={skipPhase}
      />

      {sound !== 'none' && (
        <Caption style={soundError ? styles.soundError : styles.soundPlaying}>
          {soundError
            ? `${soundError}.`
            : active.isPaused
              ? `${ambientSoundOptions.find((o) => o.id === sound)?.label} paused`
              : `Playing ${ambientSoundOptions.find((o) => o.id === sound)?.label.toLowerCase()}`}
        </Caption>
      )}

      <PrimaryButton label="End Session" style={styles.endButton} onPress={endEarly} />
    </>
  );
}

function CompleteView() {
  const pendingSummary = useStudyStore((s) => s.pendingSummary);
  const finish = useStudyStore((s) => s.finish);
  const [note, setNote] = useState('');

  if (!pendingSummary) return null;

  return (
    <>
      <ScreenTitle>Session complete</ScreenTitle>
      <Card style={styles.summaryCard}>
        <Eyebrow>You focused for</Eyebrow>
        <SectionHeading>{pendingSummary.focusMinutes} min</SectionHeading>
        {pendingSummary.subject && <Caption>{pendingSummary.subject}</Caption>}
      </Card>

      <Card style={styles.section}>
        <Eyebrow>What did you cover? What was hard?</Eyebrow>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Optional — but worth a line while it's fresh"
          placeholderTextColor={colors.inkSoft}
          style={styles.noteInput}
          multiline
        />
      </Card>

      <View style={styles.completeActions}>
        <PrimaryButton label="Skip" variant="outline" style={styles.completeButton} onPress={() => finish(undefined)} />
        <PrimaryButton label="Save & Finish" style={styles.completeButton} onPress={() => finish(note)} />
      </View>
    </>
  );
}

function HistoryView({ onBack, onOpenSession }: { onBack: () => void; onOpenSession: (id: string) => void }) {
  const sessions = useStudyStore((s) => s.sessions);
  const today = todayISO();
  const week = last7DaysMinutes(sessions, today);
  const maxMinutes = Math.max(...week.map((d) => d.minutes), 1);
  const subjects = Array.from(new Set(sessions.map((s) => s.subject).filter(Boolean))) as string[];
  const [subjectFilter, setSubjectFilter] = useState<string | 'all'>('all');
  const [groupMode, setGroupMode] = useState<'day' | 'subject'>('day');
  const filtered = subjectFilter === 'all' ? sessions : sessions.filter((s) => s.subject === subjectFilter);
  const days = Array.from(new Set(sessions.map((s) => s.date)))
    .sort((a, b) => b.localeCompare(a))
    .map((date) => {
      const daySessions = sessions.filter((s) => s.date === date);
      return { date, sessions: daySessions, total: daySessions.reduce((sum, s) => sum + s.focusMinutes, 0) };
    });

  return (
    <>
      <View style={styles.headerRow}>
        <ScreenTitle>History</ScreenTitle>
        <Pressable onPress={onBack} style={styles.historyLink}>
          <Ionicons name="timer-outline" size={16} color={colors.inkSoft} />
          <Caption> New session</Caption>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <Card style={styles.statCard} flat>
          <Eyebrow>Today</Eyebrow>
          <SectionHeading>{minutesOnDate(sessions, today)} min</SectionHeading>
        </Card>
        <Card style={styles.statCard} flat>
          <Eyebrow>This week</Eyebrow>
          <SectionHeading>{minutesInLastDays(sessions, today, 7)} min</SectionHeading>
        </Card>
        <Card style={styles.statCard} flat>
          <Eyebrow>Streak</Eyebrow>
          <SectionHeading>{computeStudyStreak(sessions, today)}d</SectionHeading>
        </Card>
      </View>

      <Card style={styles.chartCard}>
        <Eyebrow style={styles.chartLabel}>Last 7 days</Eyebrow>
        <View style={styles.chartRow}>
          {week.map((d) => (
            <View key={d.date} style={styles.chartBarWrap}>
              <View style={[styles.chartBar, { height: 6 + (d.minutes / maxMinutes) * 60 }]} />
              <Caption>{d.date.slice(8)}</Caption>
            </View>
          ))}
        </View>
      </Card>

      <View style={styles.groupToggle}>
        {(['day', 'subject'] as const).map((mode) => (
          <Pressable key={mode} onPress={() => setGroupMode(mode)} style={[styles.groupSegment, groupMode === mode && styles.groupSegmentActive]}>
            <Caption style={groupMode === mode ? styles.filterChipTextActive : undefined}>
              {mode === 'day' ? 'By day' : 'By subject'}
            </Caption>
          </Pressable>
        ))}
      </View>

      {groupMode === 'subject' && subjects.length > 0 && (
        <View style={styles.filterRow}>
          <Pressable onPress={() => setSubjectFilter('all')} style={[styles.filterChip, subjectFilter === 'all' && styles.filterChipActive]}>
            <Caption style={subjectFilter === 'all' ? styles.filterChipTextActive : undefined}>All</Caption>
          </Pressable>
          {subjects.map((subj) => (
            <Pressable
              key={subj}
              onPress={() => setSubjectFilter(subj)}
              style={[styles.filterChip, subjectFilter === subj && styles.filterChipActive]}
            >
              <Caption style={subjectFilter === subj ? styles.filterChipTextActive : undefined}>{subj}</Caption>
            </Pressable>
          ))}
        </View>
      )}

      {groupMode === 'subject' ? (
        <View style={styles.list}>
          {filtered.map((session) => (
            <Pressable key={session.id} onPress={() => onOpenSession(session.id)} accessibilityRole="button">
              <Card style={styles.sessionCard}>
                <View style={styles.sessionHeader}>
                  <Body>
                    {session.focusMinutes} min{session.subject ? ` · ${session.subject}` : ''}
                  </Body>
                  <Caption>{formatDisplayDate(session.date)}</Caption>
                </View>
                {session.notes && <Caption numberOfLines={2}>{session.notes}</Caption>}
              </Card>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.list}>
          {days.length === 0 && <Body style={styles.emptyText}>No sessions yet.</Body>}
          {days.map((day) => (
            <Card key={day.date} style={styles.sessionCard}>
              <View style={styles.sessionHeader}>
                <SectionHeading>{formatDisplayDate(day.date)}</SectionHeading>
                <Caption>{day.total} min</Caption>
              </View>
              {day.sessions.map((session) => (
                <Pressable key={session.id} onPress={() => onOpenSession(session.id)} style={styles.daySession} accessibilityRole="button">
                  <View style={styles.sessionHeader}>
                    <Body>
                      {session.focusMinutes} min{session.subject ? ` · ${session.subject}` : ''}
                    </Body>
                    <Ionicons name="chevron-forward" size={14} color={colors.inkSoft} />
                  </View>
                  {session.notes && <Caption numberOfLines={2}>{session.notes}</Caption>}
                </Pressable>
              ))}
            </Card>
          ))}
        </View>
      )}
    </>
  );
}

type StudyView = { kind: 'setup' } | { kind: 'history' } | { kind: 'detail'; sessionId: string };

export function StudySessionScreen() {
  const active = useStudyStore((s) => s.active);
  const pendingSummary = useStudyStore((s) => s.pendingSummary);
  const [view, setView] = useState<StudyView>({ kind: 'setup' });

  // History keeps its scroll position across opening a session and coming back.
  const scrollRef = React.useRef<ScrollView>(null);
  const scrollY = React.useRef(0);
  const historyScrollY = React.useRef(0);
  const openSession = (sessionId: string) => {
    historyScrollY.current = scrollY.current;
    setView({ kind: 'detail', sessionId });
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };
  const backToHistory = () => {
    setView({ kind: 'history' });
    // Wait for the list to lay out again before restoring the position.
    setTimeout(() => scrollRef.current?.scrollTo({ y: historyScrollY.current, animated: false }), 50);
  };

  // The detail page reports unsaved text so header / swipe / hardware back
  // can offer "Save before leaving?" — back always goes exactly one step.
  const [detailDirty, setDetailDirty] = useState(false);
  const detailSave = React.useRef<() => void>(() => {});
  const idle = !active && !pendingSummary;
  useBackHandler({
    dirty: idle && view.kind === 'detail' && detailDirty,
    onSave: () => detailSave.current(),
    stepBack: !idle || view.kind === 'setup' ? undefined : view.kind === 'detail' ? backToHistory : () => setView({ kind: 'setup' }),
  });

  return (
    <Screen scrollRef={scrollRef} onScroll={(y) => (scrollY.current = y)}>
      {active ? (
        <ActiveView />
      ) : pendingSummary ? (
        <CompleteView />
      ) : view.kind === 'detail' ? (
        <StudySessionDetail
          sessionId={view.sessionId}
          onBack={backToHistory}
          onDirtyChange={(dirty, save) => {
            setDetailDirty(dirty);
            detailSave.current = save;
          }}
        />
      ) : view.kind === 'history' ? (
        <HistoryView onBack={() => setView({ kind: 'setup' })} onOpenSession={openSession} />
      ) : (
        <SetupView onShowHistory={() => setView({ kind: 'history' })} />
      )}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  section: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  presetChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.stone,
  },
  presetChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  presetChipText: {
    fontFamily: fonts.bodyMedium,
  },
  presetChipTextActive: {
    color: colors.white,
  },
  presetChipSubActive: {
    color: withAlpha(colors.white, 0.85),
  },
  customRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  customField: {
    gap: 2,
  },
  customInput: {
    fontFamily: fonts.bodyMedium,
    fontSize: 18,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    width: 60,
  },
  subjectInput: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  soundRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  soundChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.stone,
  },
  soundChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  soundChipTextActive: {
    color: colors.white,
  },
  soundPlaying: {
    textAlign: 'center',
    color: colors.inkSoft,
    marginTop: spacing.sm,
  },
  soundError: {
    textAlign: 'center',
    color: '#C97B5A',
    marginTop: spacing.sm,
  },
  blockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  blockLabelWrap: {
    flex: 1,
    gap: 2,
  },
  startButton: {
    marginBottom: spacing.lg,
  },
  blockingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
    backgroundColor: withAlpha(colors.teal, 0.14),
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
  },
  blockingBadgeText: {
    color: colors.teal,
  },
  endButton: {
    marginBottom: spacing.lg,
  },
  summaryCard: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  noteInput: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  completeActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  completeButton: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    gap: 2,
    backgroundColor: withAlpha(colors.teal, 0.1),
    alignItems: 'center',
  },
  chartCard: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  chartLabel: {},
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 90,
  },
  chartBarWrap: {
    alignItems: 'center',
    gap: 4,
  },
  chartBar: {
    width: 18,
    backgroundColor: colors.teal,
    borderRadius: radii.sm,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
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
  filterChipTextActive: {
    color: colors.white,
  },
  list: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sessionCard: {
    gap: 4,
  },
  daySession: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 4,
    gap: 2,
  },
  groupToggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 2,
    marginBottom: spacing.md,
  },
  groupSegment: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
  },
  groupSegmentActive: {
    backgroundColor: colors.teal,
  },
  emptyText: {
    color: colors.inkSoft,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
}));
