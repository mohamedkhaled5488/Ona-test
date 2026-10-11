import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TextInput } from '../components/TextInput';
import { Card } from '../components/Card';
import { EntryDetailView } from '../components/EntryDetailView';
import { Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { useUi } from '../components/UiProvider';
import { colors, fonts, radii, spacing } from '../theme';
import { formatDisplayDate, formatTimeOfDay } from '../utils/date';
import { findFeeling, zoneMeta } from '../data/feelingsWheel';
import { ambientSoundOptions } from '../data/studyPresets';
import { useStudyStore } from '../store/useStudyStore';
import { useFeelingsStore } from '../store/useFeelingsStore';
import type { RootStackParamList } from '../navigation/types';
import { themedStyles } from '../theme/runtime';



function time(iso: string | undefined): string | undefined {
  return iso ? formatTimeOfDay(new Date(iso)) : undefined;
}

function stamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${formatTimeOfDay(d)}`;
}

// A past study session on its own page — the shared "past entry detail"
// pattern (same as Skills, Habits, Journaling), with timestamped comments
// that can be added later, edited or deleted.
export function StudySessionDetail({
  sessionId,
  onBack,
  onDirtyChange,
}: {
  sessionId: string;
  onBack: () => void;
  // Lets the screen's back handling (header / swipe / hardware back) show the
  // "Save before leaving?" prompt with this page's unsaved text.
  onDirtyChange: (dirty: boolean, save: () => void) => void;
}) {
  const session = useStudyStore((s) => s.sessions.find((x) => x.id === sessionId));
  const updateSession = useStudyStore((s) => s.updateSession);
  const deleteSession = useStudyStore((s) => s.deleteSession);
  const restoreSessions = useStudyStore((s) => s.restoreSessions);
  const addComment = useStudyStore((s) => s.addComment);
  const editComment = useStudyStore((s) => s.editComment);
  const deleteComment = useStudyStore((s) => s.deleteComment);
  const feelings = useFeelingsStore((s) => s.entries);
  const personalFeelings = useFeelingsStore((s) => s.personalFeelings);
  const { requestDelete, showDialog } = useUi();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [editing, setEditing] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [editingComment, setEditingComment] = useState<{ id: string; text: string } | null>(null);

  const original = session?.comments?.find((c) => c.id === editingComment?.id)?.text;
  const dirty =
    (editing && (subjectDraft !== (session?.subject ?? '') || noteDraft !== (session?.notes ?? ''))) ||
    !!commentDraft.trim() ||
    (!!editingComment && editingComment.text.trim() !== (original ?? ''));

  const saveAll = () => {
    if (!session) return;
    if (editing) {
      updateSession(session.id, { subject: subjectDraft, notes: noteDraft });
      setEditing(false);
    }
    if (commentDraft.trim()) {
      addComment(session.id, commentDraft);
      setCommentDraft('');
    }
    if (editingComment) {
      editComment(session.id, editingComment.id, editingComment.text);
      setEditingComment(null);
    }
  };

  // Keep the screen's back handler in sync with what's unsaved here.
  const saveRef = React.useRef(saveAll);
  saveRef.current = saveAll;
  useEffect(() => {
    onDirtyChange(dirty, () => saveRef.current());
  }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDirtyChange(false, () => {}), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> History</Caption>
        </Pressable>
        <Body>This session isn't around anymore.</Body>
      </>
    );
  }

  const leave = () => {
    if (!dirty) return onBack();
    showDialog({
      title: 'Save your changes before leaving?',
      actions: [
        { label: 'Cancel', style: 'cancel' },
        { label: 'Discard', style: 'destructive', onPress: onBack },
        {
          label: 'Save',
          style: 'default',
          onPress: () => {
            saveAll();
            onBack();
          },
        },
      ],
    });
  };

  const startEditing = () => {
    setSubjectDraft(session.subject ?? '');
    setNoteDraft(session.notes ?? '');
    setEditing(true);
  };

  const sound = ambientSoundOptions.find((o) => o.id === session.ambientSound);
  const feeling = feelings.filter((f) => f.source?.kind === 'study' && f.source.refId === session.id).slice(-1)[0];
  const feelingNames = feeling?.feelingIds.map((id) => findFeeling(id)?.name ?? personalFeelings.find((p) => p.id === id)?.name).filter(Boolean);
  const startTime = time(session.startedAt);
  const endTime = time(session.endedAt);

  const facts: [string, string][] = [
    ['Date', formatDisplayDate(session.date)],
    ...(startTime ? ([['Time', endTime ? `${startTime} – ${endTime}` : startTime]] as [string, string][]) : []),
    ['Focus time', `${session.focusMinutes} min`],
    ...(session.presetLabel ? ([['Preset', session.presetLabel]] as [string, string][]) : []),
    ...(session.cyclesCompleted !== undefined ? ([['Focus cycles', String(session.cyclesCompleted)]] as [string, string][]) : []),
    ['Ambient sound', sound && sound.id !== 'none' ? sound.label : 'None'],
    ['App blocking', session.appBlockingEnabled ? 'On' : 'Off'],
  ];

  return (
    <EntryDetailView
      accent={colors.teal}
      title={session.subject || 'Study session'}
      subtitle={`${formatDisplayDate(session.date)} · ${session.focusMinutes} min`}
      backLabel="History"
      showEmptyNote={false}
      onBack={leave}
      onEdit={editing ? undefined : startEditing}
      onDelete={() => {
        const previous = useStudyStore.getState().sessions;
        requestDelete({
          message: 'Delete this study session and its notes? This can’t be undone.',
          toastMessage: 'Session deleted',
          perform: () => {
            deleteSession(session.id);
            onBack();
          },
          restore: () => restoreSessions(previous),
        });
      }}
    >
      <Card style={styles.card}>
        {facts.map(([label, value]) => (
          <View key={label} style={styles.factRow}>
            <Caption style={styles.muted}>{label}</Caption>
            <Body>{value}</Body>
          </View>
        ))}
      </Card>

      {editing ? (
        <Card style={styles.card}>
          <Eyebrow>Subject</Eyebrow>
          <TextInput value={subjectDraft} onChangeText={setSubjectDraft} placeholder="What were you working on?" placeholderTextColor={colors.inkSoft} style={styles.input} />
          <Eyebrow style={styles.label}>Post-session note</Eyebrow>
          <TextInput value={noteDraft} onChangeText={setNoteDraft} placeholder="What did you cover? What was hard?" placeholderTextColor={colors.inkSoft} style={[styles.input, styles.multiline]} multiline />
          <View style={styles.row}>
            <PrimaryButton label="Cancel" variant="outline" style={styles.flex} onPress={() => setEditing(false)} />
            <PrimaryButton label="Save" style={styles.flex} onPress={saveAll} />
          </View>
        </Card>
      ) : null}

      <Eyebrow style={styles.label}>Notes & comments</Eyebrow>
      {!editing && (
        <Card style={styles.entry}>
          <Caption style={styles.muted}>After the session{session.endedAt ? ` · ${stamp(session.endedAt)}` : ''}</Caption>
          {session.notes ? <Body>{session.notes}</Body> : <Caption style={styles.muted}>No note yet — use Edit below to add one.</Caption>}
        </Card>
      )}
      {(session.comments ?? []).map((c) => (
        <Card key={c.id} style={styles.entry}>
          {editingComment?.id === c.id ? (
            <>
              <TextInput value={editingComment.text} onChangeText={(text) => setEditingComment({ id: c.id, text })} style={[styles.input, styles.multiline]} multiline autoFocus />
              <View style={styles.row}>
                <PrimaryButton label="Cancel" variant="outline" style={styles.flex} onPress={() => setEditingComment(null)} />
                <PrimaryButton
                  label="Save"
                  style={styles.flex}
                  disabled={!editingComment.text.trim()}
                  onPress={() => {
                    editComment(session.id, c.id, editingComment.text);
                    setEditingComment(null);
                  }}
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.commentHead}>
                <Caption style={styles.muted}>
                  {stamp(c.createdAt)}
                  {c.editedAt ? ' · edited' : ''}
                </Caption>
                <View style={styles.row}>
                  <Pressable hitSlop={8} onPress={() => setEditingComment({ id: c.id, text: c.text })} accessibilityLabel="Edit comment">
                    <Ionicons name="create-outline" size={16} color={colors.inkSoft} />
                  </Pressable>
                  <Pressable
                    hitSlop={8}
                    accessibilityLabel="Delete comment"
                    onPress={() => requestDelete({ message: 'Delete this comment?', perform: () => deleteComment(session.id, c.id) })}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.inkSoft} />
                  </Pressable>
                </View>
              </View>
              <Body>{c.text}</Body>
            </>
          )}
        </Card>
      ))}
      <View style={styles.row}>
        <TextInput value={commentDraft} onChangeText={setCommentDraft} placeholder="Add a comment…" placeholderTextColor={colors.inkSoft} style={[styles.input, styles.flex]} multiline />
        <PrimaryButton
          label="Add"
          variant="outline"
          disabled={!commentDraft.trim()}
          onPress={() => {
            addComment(session.id, commentDraft);
            setCommentDraft('');
          }}
        />
      </View>

      <Eyebrow style={styles.label}>How it felt</Eyebrow>
      {feeling ? (
        <Card style={[styles.entry, { borderLeftColor: zoneMeta(feeling.zone).accent }]}>
          <Body style={{ color: zoneMeta(feeling.zone).accent, fontFamily: fonts.bodyMedium }}>{feelingNames?.join(' & ') || zoneMeta(feeling.zone).label}</Body>
          {feeling.reasonTags?.length ? <Caption style={styles.muted}>Tagged: {feeling.reasonTags.join(', ')}</Caption> : null}
        </Card>
      ) : (
        <Pressable onPress={() => navigation.push('moodCheck', { source: { kind: 'study', refId: session.id } })}>
          <Caption style={{ color: colors.teal }}>Log how this session felt (optional)</Caption>
        </Pressable>
      )}
    </EntryDetailView>
  );
}

const styles = themedStyles(() => ({
  backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  card: { gap: spacing.xs, marginTop: spacing.sm },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  muted: { color: colors.inkSoft },
  label: { marginTop: spacing.lg, marginBottom: spacing.xs },
  entry: { gap: 4, marginBottom: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.line },
  commentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
  },
  multiline: { minHeight: 60, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  badge: { borderRadius: radii.full },
}));
