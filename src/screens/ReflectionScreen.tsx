// Reflection: a quiet place to ask yourself real questions, answer them in
// writing, and keep every session to come back to. Not a chatbot and not
// therapy: hand-written questions (src/content), chosen by simple rules
// (reflect/questions.ts). Private by default; support lines one tap away on
// every page. Held until the owner's final review (data/sectionsMeta.ts).
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Body, Caption, Eyebrow, ScreenTitle, SectionHeading } from '../components/Typography';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextInput } from '../components/TextInput';
import { SupportLink } from '../components/SupportLink';
import { useUi } from '../components/UiProvider';
import { useBackHandler } from '../hooks/useBackHandler';
import { useSectionStack } from '../hooks/useSectionStack';
import { colors, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import { sectionAccents } from '../theme/accents';
import { useReflectionStore } from '../store/useReflectionStore';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { REFLECT_CLOSING } from '../content';
import { asPlanned, defaultTitle, offerQuestion, questionById, themeById, writtenThemes } from '../reflect/questions';
import { allTags, pastAnswers, questionKey, searchSessions, showSupportCard, SUPPORT_CARD_COPY, yearAgo, type LibraryFilter } from '../reflect/revisit';
import { formatDisplayDate, todayISO } from '../utils/date';
import { formatDuration } from '../utils/recapStats';
import { localDateOf } from '../quit/journey';
import { openSection } from '../navigation/navigationRef';
import type { RootStackParamList } from '../navigation/types';
import type { ReflectAnswer, ReflectSession } from '../types/sections';
import { ClosingStage, REFLECT_COPY, SessionStage, SetupStage, draftLine } from './ReflectionSession';

const accent = sectionAccents.reflection;

export const REFLECTION_HOME_COPY = {
  title: 'Reflection',
  line: 'A space to think with yourself. Not therapy, and nothing is judged.',
  continue: 'Pick up where you left off',
  library: 'Your reflections',
  libraryEmpty: 'Your saved sessions will be here.',
  seeAll: 'See all',
  search: 'Search your reflections',
  favorites: 'Favourites',
  ownQuestions: 'Own questions',
  allThemes: 'All',
  draft: 'Draft',
  yearAgo: (title: string) => `A year ago you reflected on "${title}". Would you like to look back?`,
  yearAgoOpen: 'Open it',
  edit: 'Keep writing',
  redo: 'Do these questions again',
  delete: 'Delete this reflection',
  deleteConfirm: 'Delete this reflection? Its answers go too.',
  again: 'Answer this again',
  rename: 'Title',
  minutes: (m: number) => (m < 1 ? 'under a minute' : formatDuration(m)),
};

type Page =
  | { kind: 'home' }
  | { kind: 'setup' }
  | { kind: 'session'; sessionId: string }
  | { kind: 'closing'; sessionId: string }
  | { kind: 'library' }
  | { kind: 'read'; sessionId: string };

type Props = NativeStackScreenProps<RootStackParamList, 'reflection'>;

export function ReflectionScreen({ route }: Props) {
  const { openSessionId, page } = route.params ?? {};
  // Opened at a session (from Recap, Support, a link): that page is the whole
  // history, so Back returns to where it was opened from.
  const [opened] = useState<Page[]>(() => (openSessionId ? [page === 'session' ? { kind: 'session', sessionId: openSessionId } : { kind: 'read', sessionId: openSessionId }] : []));
  const { current, push, stepBack, up, setStack } = useSectionStack<Page>({ kind: 'home' }, opened, (p) => (p.kind === 'home' ? undefined : { kind: 'home' }));
  const { showToast } = useUi();
  useBackHandler({ stepBack });

  const leaveSession = () => {
    showToast({ message: REFLECT_COPY.savedDraft });
    setStack([{ kind: 'home' }]);
  };
  const startSession = (sessionId: string) => push({ kind: 'session', sessionId });

  return (
    <Screen>
      {current.kind === 'home' && <HomePage onPush={push} onStart={startSession} />}
      {current.kind === 'setup' && <SetupStage onStart={(id) => setStack((s) => [...s.slice(0, -1), { kind: 'session', sessionId: id }])} />}
      {current.kind === 'session' && (
        <SessionStage sessionId={current.sessionId} onClose={() => push({ kind: 'closing', sessionId: current.sessionId })} onLeave={leaveSession} />
      )}
      {current.kind === 'closing' && (
        <ClosingStage
          sessionId={current.sessionId}
          onGoTo={(i) => {
            useReflectionStore.getState().goTo(current.sessionId, i);
            up();
          }}
          onSaved={() => {
            showToast({ message: REFLECT_CLOSING.saved });
            setStack([{ kind: 'home' }, { kind: 'read', sessionId: current.sessionId }]);
          }}
        />
      )}
      {current.kind === 'library' && <LibraryPage onOpen={(id) => push({ kind: 'read', sessionId: id })} />}
      {current.kind === 'read' && (
        <ReadPage
          sessionId={current.sessionId}
          onEdit={(id) => push({ kind: 'session', sessionId: id })}
          onStart={startSession}
          onDeleted={() => (stepBack ? stepBack() : setStack([{ kind: 'home' }]))}
        />
      )}
    </Screen>
  );
}

// --- Home ---------------------------------------------------------------------
function HomePage({ onPush, onStart }: { onPush: (p: Page) => void; onStart: (sessionId: string) => void }) {
  const sessions = useReflectionStore((s) => s.sessions);
  const start = useReflectionStore((s) => s.start);
  const supportShownAt = useReflectionStore((s) => s.supportCardShownAt);
  const setSupportShown = useReflectionStore((s) => s.setSupportCardShown);
  const feelings = useFeelingsStore((s) => s.entries);
  const today = todayISO();
  const drafts = sessions.filter((s) => s.status === 'draft' && !s.conflictCopyOf).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const recent = searchSessions(sessions.filter((s) => s.status === 'done'), {}).slice(0, 3);
  const ago = useMemo(() => yearAgo(sessions, today, feelings), [sessions, today, feelings]);
  // Decided once per visit, so it doesn't flicker away while it's read.
  const [support] = useState(() => showSupportCard(feelings, today, supportShownAt));
  const [supportOpen, setSupportOpen] = useState(support);
  useEffect(() => {
    if (support) setSupportShown(today);
  }, [support, today, setSupportShown]);

  const startAsk = () => {
    const q = offerQuestion({ depth: 'light', exclude: [] }, sessions);
    onStart(start({ mode: 'ask', depth: 'light', title: defaultTitle('ask'), questions: q ? [q] : [] }));
  };
  const startFree = () => onStart(start({ mode: 'free', title: defaultTitle('free'), questions: [] }));

  return (
    <View style={styles.gap}>
      <ScreenTitle>{REFLECTION_HOME_COPY.title}</ScreenTitle>
      <Caption>{REFLECTION_HOME_COPY.line}</Caption>

      {supportOpen && (
        <Card style={styles.card}>
          <Body style={styles.bold}>{SUPPORT_CARD_COPY.title}</Body>
          <Caption>{SUPPORT_CARD_COPY.line}</Caption>
          <View style={styles.row}>
            <PrimaryButton label={SUPPORT_CARD_COPY.action} onPress={() => openSection('settings', { page: 'safety' })} style={styles.flex} />
            <PrimaryButton label={SUPPORT_CARD_COPY.dismiss} variant="outline" onPress={() => setSupportOpen(false)} style={styles.flex} />
          </View>
        </Card>
      )}

      {drafts.length > 0 && (
        <>
          <SectionHeading>{REFLECTION_HOME_COPY.continue}</SectionHeading>
          {drafts.map((s) => (
            <SessionRow key={s.id} session={s} line={draftLine(s)} onPress={() => onStart(s.id)} />
          ))}
        </>
      )}

      <StartCard icon="compass-outline" title={REFLECT_COPY.guided} line={REFLECT_COPY.guidedLine} onPress={() => onPush({ kind: 'setup' })} testID="reflect-start-guided" />
      <StartCard icon="help-circle-outline" title={REFLECT_COPY.ask} line={REFLECT_COPY.askLine} onPress={startAsk} testID="reflect-start-ask" />
      <StartCard icon="create-outline" title={REFLECT_COPY.free} line={REFLECT_COPY.freeLine} onPress={startFree} testID="reflect-start-free" />

      {ago && (
        <Card style={styles.card}>
          <Caption>{REFLECTION_HOME_COPY.yearAgo(ago.title)}</Caption>
          <Pressable onPress={() => onPush({ kind: 'read', sessionId: ago.id })} accessibilityRole="button" style={styles.link}>
            <Body style={{ color: accent }}>{REFLECTION_HOME_COPY.yearAgoOpen}</Body>
          </Pressable>
        </Card>
      )}

      <View style={styles.headerRow}>
        <SectionHeading>{REFLECTION_HOME_COPY.library}</SectionHeading>
        {recent.length > 0 && (
          <Pressable onPress={() => onPush({ kind: 'library' })} accessibilityRole="button" hitSlop={8} testID="reflect-library">
            <Caption style={{ color: accent }}>{REFLECTION_HOME_COPY.seeAll}</Caption>
          </Pressable>
        )}
      </View>
      {recent.length === 0 ? <Caption>{REFLECTION_HOME_COPY.libraryEmpty}</Caption> : recent.map((s) => <SessionRow key={s.id} session={s} onPress={() => onPush({ kind: 'read', sessionId: s.id })} />)}
      <SupportLink />
    </View>
  );
}

function StartCard({ icon, title, line, onPress, testID }: { icon: keyof typeof Ionicons.glyphMap; title: string; line: string; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${line}`} testID={testID}>
      <Card style={styles.startCard}>
        <Ionicons name={icon} size={22} color={accent} />
        <View style={styles.flex}>
          <Body style={styles.bold}>{title}</Body>
          <Caption>{line}</Caption>
        </View>
      </Card>
    </Pressable>
  );
}

function SessionRow({ session, line, onPress }: { session: ReflectSession; line?: string; onPress: () => void }) {
  const theme = themeById(session.theme);
  const sub = line ?? [formatDisplayDate(localDateOf(session.startedAt)), theme && theme.title !== session.title ? theme.title : '', session.status === 'draft' ? REFLECTION_HOME_COPY.draft : ''].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${session.title}, ${sub}`}>
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Body style={[styles.bold, styles.flex]}>{session.title}</Body>
          {session.favorite && <Ionicons name="star" size={14} color={accent} />}
        </View>
        <Caption>{sub}</Caption>
        {session.takeaway ? <Caption numberOfLines={1}>{session.takeaway}</Caption> : null}
      </Card>
    </Pressable>
  );
}

// --- Library: search and filters -------------------------------------------------
function LibraryPage({ onOpen }: { onOpen: (sessionId: string) => void }) {
  const sessions = useReflectionStore((s) => s.sessions);
  const [filter, setFilter] = useState<LibraryFilter>({});
  const list = searchSessions(sessions, filter);
  const tags = allTags(sessions);
  const themesUsed = writtenThemes().filter((t) => sessions.some((s) => s.theme === t.id));
  const chip = (label: string, on: boolean, toggle: () => void) => (
    <Pressable key={label} onPress={toggle} style={[styles.chip, on && { backgroundColor: accent, borderColor: accent }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <Caption style={on ? styles.chipTextActive : undefined}>{label}</Caption>
    </Pressable>
  );
  return (
    <View style={styles.gap}>
      <ScreenTitle>{REFLECTION_HOME_COPY.library}</ScreenTitle>
      <TextInput value={filter.query ?? ''} onChangeText={(query) => setFilter((f) => ({ ...f, query }))} placeholder={REFLECTION_HOME_COPY.search} accessibilityLabel={REFLECTION_HOME_COPY.search} testID="reflect-search" />
      <View style={styles.chipRow}>
        {chip(REFLECTION_HOME_COPY.allThemes, !filter.theme, () => setFilter((f) => ({ ...f, theme: undefined })))}
        {themesUsed.map((t) => chip(t.title, filter.theme === t.id, () => setFilter((f) => ({ ...f, theme: f.theme === t.id ? undefined : t.id }))))}
        {chip(REFLECTION_HOME_COPY.ownQuestions, filter.theme === 'own', () => setFilter((f) => ({ ...f, theme: f.theme === 'own' ? undefined : 'own' })))}
        {chip(REFLECTION_HOME_COPY.favorites, !!filter.favorites, () => setFilter((f) => ({ ...f, favorites: !f.favorites })))}
      </View>
      {tags.length > 0 && <View style={styles.chipRow}>{tags.map((t) => chip(`#${t}`, filter.tag === t, () => setFilter((f) => ({ ...f, tag: f.tag === t ? undefined : t }))))}</View>}
      {list.map((s) => (
        <SessionRow key={s.id} session={s} onPress={() => onOpen(s.id)} />
      ))}
      {list.length === 0 && <Caption>{REFLECTION_HOME_COPY.libraryEmpty}</Caption>}
      <SupportLink />
    </View>
  );
}

// --- Read mode -------------------------------------------------------------------
function ReadPage({ sessionId, onEdit, onStart, onDeleted }: { sessionId: string; onEdit: (id: string) => void; onStart: (id: string) => void; onDeleted: () => void }) {
  const session = useReflectionStore((s) => s.sessions.find((x) => x.id === sessionId));
  const sessions = useReflectionStore((s) => s.sessions);
  const store = useReflectionStore();
  const { requestDelete } = useUi();
  const [title, setTitle] = useState(session?.title ?? '');
  if (!session) return <Caption>{REFLECTION_HOME_COPY.libraryEmpty}</Caption>;
  const theme = themeById(session.theme);
  const minutes = Math.round(session.seconds / 60);

  const answerAgain = (a: ReflectAnswer) => {
    const q = questionById(a.questionId);
    onStart(store.start({ mode: 'free', theme: q?.theme, title: a.question, questions: [q ? asPlanned(q) : { question: a.question }], againOf: a.id }));
  };
  const redo = () =>
    onStart(
      store.start({
        mode: session.mode,
        theme: session.theme,
        depth: session.depth,
        length: session.length,
        title: session.title,
        redoOf: session.id,
        questions: session.answers.map((a) => ({ questionId: a.questionId, question: a.question, stage: a.stage, depth: a.depth })),
      })
    );

  return (
    <View style={styles.gap}>
      <TextInput value={title} onChangeText={setTitle} onBlur={() => store.rename(sessionId, title)} accessibilityLabel={REFLECTION_HOME_COPY.rename} style={styles.titleInput} testID="reflect-title" />
      <Caption>
        {[formatDisplayDate(localDateOf(session.startedAt)), theme?.title, REFLECTION_HOME_COPY.minutes(minutes), session.status === 'draft' ? REFLECTION_HOME_COPY.draft : ''].filter(Boolean).join(' · ')}
      </Caption>
      {session.takeaway ? (
        <Card style={styles.card}>
          <Eyebrow>{REFLECT_CLOSING.takeaway}</Eyebrow>
          <Body>{session.takeaway}</Body>
        </Card>
      ) : null}
      {session.answers
        .filter((a) => !a.skipped || a.answer.trim())
        .map((a) => {
          const before = pastAnswers(questionKey(a), sessions, a.id).length;
          return (
            <View key={a.id} style={styles.qa}>
              <View style={styles.headerRow}>
                <Body style={[styles.bold, styles.flex]}>{a.question}</Body>
                <Pressable onPress={() => store.toggleFavorite(sessionId, a.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={a.favorite ? 'Remove from favourites' : 'Add to favourites'}>
                  <Ionicons name={a.favorite ? 'star' : 'star-outline'} size={18} color={a.favorite ? accent : colors.inkSoft} />
                </Pressable>
              </View>
              <Body>{a.answer.trim() || '—'}</Body>
              {a.followUp?.answer.trim() ? (
                <>
                  <Caption style={styles.bold}>{a.followUp.question}</Caption>
                  <Body>{a.followUp.answer}</Body>
                </>
              ) : null}
              <Pressable onPress={() => answerAgain(a)} accessibilityRole="button" style={styles.link} testID={`reflect-again-${a.id}`}>
                <Caption style={{ color: accent }}>
                  {REFLECTION_HOME_COPY.again}
                  {before ? ` (${before + 1} answers so far)` : ''}
                </Caption>
              </Pressable>
            </View>
          );
        })}
      <View style={styles.row}>
        <PrimaryButton
          label={REFLECTION_HOME_COPY.edit}
          variant="outline"
          onPress={() => {
            store.reopen(sessionId);
            onEdit(sessionId);
          }}
          style={styles.flex}
        />
        <PrimaryButton label={REFLECTION_HOME_COPY.redo} variant="outline" onPress={redo} style={styles.flex} />
      </View>
      <Pressable
        onPress={() => {
          const copy = session;
          requestDelete({
            message: REFLECTION_HOME_COPY.deleteConfirm,
            perform: () => {
              store.deleteSession(sessionId);
              onDeleted();
            },
            restore: () => useReflectionStore.setState((s) => ({ sessions: [...s.sessions, copy] })),
          });
        }}
        accessibilityRole="button"
        style={styles.link}
        testID="reflect-delete"
      >
        <Caption>{REFLECTION_HOME_COPY.delete}</Caption>
      </Pressable>
      <SupportLink />
    </View>
  );
}

const styles = themedStyles(() => ({
  gap: { gap: spacing.md },
  row: { flexDirection: 'row' as const, gap: spacing.sm },
  flex: { flex: 1 },
  bold: { fontWeight: '600' as const },
  card: { gap: spacing.xs },
  startCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
  headerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.sm },
  chipRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
  chip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, minHeight: 36, justifyContent: 'center' as const },
  chipTextActive: { color: colors.white },
  qa: { gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  titleInput: { fontSize: 22, fontWeight: '600' as const },
  link: { minHeight: 40, justifyContent: 'center' as const },
}));
