// Letters to Myself: written when calm, for the days you need them. A letter
// is offered after you log a matching feeling (letters/LetterOfferHost.tsx),
// or waits for a date you choose. Edit, pause, hide or delete any time.
// Private; held until the owner's final review (data/sectionsMeta.ts).
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Body, Caption, ScreenTitle, SectionHeading } from '../components/Typography';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextInput } from '../components/TextInput';
import { SettingSwitch } from '../components/SettingSwitch';
import { MonthCalendar } from '../components/MonthCalendar';
import { SupportLink } from '../components/SupportLink';
import { useUi } from '../components/UiProvider';
import { useBackHandler } from '../hooks/useBackHandler';
import { useSectionStack } from '../hooks/useSectionStack';
import { colors, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import { sectionAccents } from '../theme/accents';
import { LETTERS } from '../content';
import { useLettersStore, type LetterInput } from '../store/useLettersStore';
import { feelings as wheel, feelingZones } from '../data/feelingsWheel';
import { lettersDue, needsHardTip } from '../letters/delivery';
import { cancelLetterReminder, syncLetterReminder } from '../letters/reminders';
import { writtenOnText } from '../letters/LetterOfferHost';
import { addDaysISO, formatDisplayDate, todayISO } from '../utils/date';
import type { RootStackParamList } from '../navigation/types';
import type { FeelingZone, Letter, LetterKind } from '../types/sections';
import { useCapGuard } from '../components/PlusGate';

const accent = sectionAccents.letters;

export const LETTERS_COPY = {
  title: 'Letters to Myself',
  line: 'Write to yourself when things feel steadier. Ona offers a letter after you log a feeling it was written for, and only opens it if you choose.',
  write: 'Write a letter',
  waiting: 'Waiting for you',
  savedForLater: 'Saved for later',
  yours: 'Your letters',
  empty: 'No letters yet.',
  paused: 'Paused',
  hidden: 'Hidden for now',
  kind: 'Who is it for?',
  zones: 'When I feel',
  words: 'Or a specific feeling (optional)',
  date: 'The day it waits for',
  remind: 'Also remind me that day',
  remindNote: "The reminder says only that something is waiting. Never the letter's words, never a feeling.",
  text: 'Your letter',
  starters: 'If you want a start',
  save: 'Save',
  open: 'Open',
  edit: 'Edit',
  pause: 'Pause',
  resume: 'Offer it again',
  show: 'Show it again',
  delete: 'Delete this letter',
  deleteConfirm: 'Delete this letter? It can be undone for a moment.',
  forFeeling: (l: Letter) =>
    l.kind === 'feeling'
      ? `When I feel ${[...l.zones.map((z) => feelingZones.find((x) => x.id === z)?.label ?? z), ...l.feelingIds.map((id) => wheel.find((f) => f.id === id)?.name ?? id)].join(', ')}`
      : l.kind === 'date'
        ? `On ${formatDisplayDate(l.deliverOn!)}`
        : LETTERS.kinds.find((k) => k.kind === l.kind)!.title.replace(/^To me, /, '').replace(/^w/, 'W').replace(/^o/, 'O'),
};

type Page = { kind: 'home' } | { kind: 'write'; letterId?: string; write?: LetterKind; draftText?: string; fromReflection?: string } | { kind: 'read'; letterId: string };
type Props = NativeStackScreenProps<RootStackParamList, 'letters'>;

export function LettersScreen({ route }: Props) {
  const { openLetterId, write, draftText, fromReflection } = route.params ?? {};
  const opened: Page[] = openLetterId ? [{ kind: 'read', letterId: openLetterId }] : write || draftText ? [{ kind: 'write', write, draftText, fromReflection }] : [];
  const { current, push, stepBack, setStack } = useSectionStack<Page>({ kind: 'home' }, opened, () => ({ kind: 'home' }));
  const [dirty, setDirty] = useState(false);
  const saveRef = React.useRef<() => boolean>(() => true);
  // A half-written letter: Back asks Save / Discard / Keep editing; Discard
  // goes back one page, like any Back.
  useBackHandler({ stepBack, dirty, onSave: () => saveRef.current() });
  React.useEffect(() => {
    if (current.kind !== 'write') setDirty(false);
  }, [current]);

  return (
    <Screen>
      {current.kind === 'home' && <HomePage onWrite={() => push({ kind: 'write' })} onOpen={(id) => push({ kind: 'read', letterId: id })} />}
      {current.kind === 'write' && (
        <WritePage
          page={current}
          onDirty={setDirty}
          saveRef={saveRef}
          onSaved={(id) => {
            setDirty(false);
            setStack([{ kind: 'home' }, { kind: 'read', letterId: id }]);
          }}
        />
      )}
      {current.kind === 'read' && <ReadPage letterId={current.letterId} onEdit={() => push({ kind: 'write', letterId: current.letterId })} onDeleted={() => setStack([{ kind: 'home' }])} />}
    </Screen>
  );
}

function LetterRow({ letter, onPress }: { letter: Letter; onPress: () => void }) {
  const state = letter.hidden ? LETTERS_COPY.hidden : letter.paused ? LETTERS_COPY.paused : '';
  const label = [LETTERS_COPY.forFeeling(letter), state].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={`letter-${letter.id}`}>
      <Card style={styles.card}>
        <Body style={styles.bold}>{LETTERS_COPY.forFeeling(letter)}</Body>
        <Caption>{[formatDisplayDate(letter.createdAt.slice(0, 10)), state].filter(Boolean).join(' · ')}</Caption>
      </Card>
    </Pressable>
  );
}

function HomePage({ onWrite, onOpen }: { onWrite: () => void; onOpen: (id: string) => void }) {
  const guard = useCapGuard(); // Essentials mode: active letters (config/plans.ts)
  const letters = useLettersStore((s) => s.letters);
  const later = useLettersStore((s) => s.later);
  const due = lettersDue(letters, todayISO());
  const saved = later.map((id) => letters.find((l) => l.id === id)).filter((l): l is Letter => !!l && !l.hidden);
  const mine = [...letters].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <View style={styles.gap}>
      <ScreenTitle>{LETTERS_COPY.title}</ScreenTitle>
      <Caption>{LETTERS_COPY.line}</Caption>
      <PrimaryButton label={LETTERS_COPY.write} onPress={() => guard('activeLetters', onWrite)} testID="letters-write" />
      {due.length + saved.length > 0 && <SectionHeading>{LETTERS_COPY.waiting}</SectionHeading>}
      {due.map((l) => (
        <LetterRow key={`due-${l.id}`} letter={l} onPress={() => onOpen(l.id)} />
      ))}
      {saved.length > 0 && <Caption>{LETTERS_COPY.savedForLater}</Caption>}
      {saved.map((l) => (
        <LetterRow key={`later-${l.id}`} letter={l} onPress={() => onOpen(l.id)} />
      ))}
      <SectionHeading>{LETTERS_COPY.yours}</SectionHeading>
      {mine.length === 0 ? <Caption>{LETTERS_COPY.empty}</Caption> : mine.map((l) => <LetterRow key={l.id} letter={l} onPress={() => onOpen(l.id)} />)}
      <SupportLink />
    </View>
  );
}

function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && { backgroundColor: accent, borderColor: accent }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }} testID={testID}>
      <Caption style={on ? styles.chipTextActive : undefined}>{label}</Caption>
    </Pressable>
  );
}

function WritePage({ page, onDirty, saveRef, onSaved }: { page: Extract<Page, { kind: 'write' }>; onDirty: (d: boolean) => void; saveRef: React.MutableRefObject<() => boolean>; onSaved: (id: string) => void }) {
  const existing = useLettersStore((s) => s.letters.find((l) => l.id === page.letterId));
  const store = useLettersStore();
  const [kind, setKind] = useState<LetterKind>(existing?.kind ?? page.write ?? 'feeling');
  const [zones, setZones] = useState<FeelingZone[]>(existing?.zones ?? []);
  const [feelingIds, setFeelingIds] = useState<string[]>(existing?.feelingIds ?? []);
  const [deliverOn, setDeliverOn] = useState<string | undefined>(existing?.deliverOn);
  const [month, setMonth] = useState(existing?.deliverOn ?? addDaysISO(todayISO(), 30));
  const [remind, setRemind] = useState(!!existing?.remind);
  const [text, setText] = useState(existing?.text ?? page.draftText ?? '');
  const [notWhenIntense, setNotWhenIntense] = useState(!existing?.showWhenIntense);
  const kindCopy = LETTERS.kinds.find((k) => k.kind === kind)!;
  const words = useMemo(() => wheel.filter((f) => zones.includes(f.zone)), [zones]);
  const valid = text.trim().length > 0 && (kind !== 'feeling' || zones.length + feelingIds.length > 0) && (kind !== 'date' || !!deliverOn);

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    onDirty(true);
  };
  const save = (): boolean => {
    if (!valid) return false;
    const input: LetterInput = { kind, zones, feelingIds, text: text.trim(), deliverOn, remind, showWhenIntense: !notWhenIntense, fromReflection: page.fromReflection };
    let id = existing?.id;
    if (id) store.updateLetter(id, input);
    else id = store.addLetter(input);
    const saved = useLettersStore.getState().letters.find((l) => l.id === id)!;
    void syncLetterReminder(saved);
    onSaved(id);
    return true;
  };
  saveRef.current = save;

  return (
    <View style={styles.gap}>
      <ScreenTitle>{existing ? LETTERS_COPY.edit : LETTERS_COPY.write}</ScreenTitle>
      <SectionHeading>{LETTERS_COPY.kind}</SectionHeading>
      <View style={styles.chipRow}>
        {LETTERS.kinds.map((k) => (
          <Chip key={k.kind} label={k.title} on={kind === k.kind} onPress={() => touch(setKind)(k.kind)} testID={`letter-kind-${k.kind}`} />
        ))}
      </View>
      <Caption>{kindCopy.line}</Caption>

      {kind === 'feeling' && (
        <>
          <SectionHeading>{LETTERS_COPY.zones}</SectionHeading>
          <View style={styles.chipRow}>
            {feelingZones.map((z) => (
              <Chip key={z.id} label={z.label} on={zones.includes(z.id)} onPress={() => touch(setZones)(zones.includes(z.id) ? zones.filter((x) => x !== z.id) : [...zones, z.id])} testID={`letter-zone-${z.id}`} />
            ))}
          </View>
          {words.length > 0 && (
            <>
              <Caption>{LETTERS_COPY.words}</Caption>
              <View style={styles.chipRow}>
                {words.map((f) => (
                  <Chip key={f.id} label={f.name} on={feelingIds.includes(f.id)} onPress={() => touch(setFeelingIds)(feelingIds.includes(f.id) ? feelingIds.filter((x) => x !== f.id) : [...feelingIds, f.id])} />
                ))}
              </View>
            </>
          )}
        </>
      )}

      {kind === 'date' && (
        <>
          <SectionHeading>{LETTERS_COPY.date}</SectionHeading>
          <MonthCalendar accent={accent} month={month} onMonthChange={setMonth} onDayPress={(d) => touch(setDeliverOn)(d)} disablePast getDayColor={(d) => (d === deliverOn ? accent : undefined)} />
          {deliverOn && <Caption>{formatDisplayDate(deliverOn)}</Caption>}
          <SettingSwitch label={LETTERS_COPY.remind} value={remind} onValueChange={touch(setRemind)} accent={accent} />
          <Caption>{LETTERS_COPY.remindNote}</Caption>
        </>
      )}

      <Caption>{needsHardTip(kind, zones) ? LETTERS.hardFeelingTip : LETTERS.writeTip}</Caption>
      <Caption>{LETTERS_COPY.starters}</Caption>
      <View style={styles.chipRow}>
        {kindCopy.starters.texts.map((s) => (
          <Chip key={s} label={s} on={false} onPress={() => touch(setText)(text.trim() ? `${text.trim()}\n\n${s}\n` : `${s}\n`)} />
        ))}
      </View>
      <TextInput value={text} onChangeText={touch(setText)} placeholder={LETTERS_COPY.text} multiline textAlignVertical="top" style={styles.text} accessibilityLabel={LETTERS_COPY.text} testID="letter-text" />
      {kind !== 'date' && <SettingSwitch label={LETTERS.dontShowWhenIntense} value={notWhenIntense} onValueChange={touch(setNotWhenIntense)} accent={accent} />}
      <PrimaryButton label={LETTERS_COPY.save} disabled={!valid} onPress={save} testID="letter-save" />
      <SupportLink />
    </View>
  );
}

function ReadPage({ letterId, onEdit, onDeleted }: { letterId: string; onEdit: () => void; onDeleted: () => void }) {
  const letter = useLettersStore((s) => s.letters.find((l) => l.id === letterId));
  const store = useLettersStore();
  const { requestDelete } = useUi();
  const guard = useCapGuard();
  // A dated letter, its day come: opened now.
  React.useEffect(() => {
    if (letter && letter.kind === 'date' && letter.deliverOn && letter.deliverOn <= todayISO() && !letter.deliveredAt) store.markDelivered(letter.id);
    if (letter) store.removeLater(letter.id);
  }, [letter?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!letter) return <Caption>{LETTERS_COPY.empty}</Caption>;
  return (
    <View style={styles.gap}>
      <SectionHeading>{LETTERS_COPY.forFeeling(letter)}</SectionHeading>
      <Caption>{writtenOnText(letter)}</Caption>
      <Card>
        <Body style={styles.letter}>{letter.text}</Body>
      </Card>
      <View style={styles.row}>
        <PrimaryButton label={LETTERS_COPY.edit} variant="outline" style={styles.flex} onPress={onEdit} />
        <PrimaryButton
          label={letter.paused ? LETTERS_COPY.resume : LETTERS_COPY.pause}
          variant="outline"
          style={styles.flex}
          onPress={() => {
            const toggle = () => {
              store.setPaused(letter.id, !letter.paused);
              void syncLetterReminder(useLettersStore.getState().letters.find((l) => l.id === letter.id)!);
            };
            if (letter.paused) guard('activeLetters', toggle);
            else toggle();
          }}
        />
      </View>
      <PrimaryButton
        label={letter.hidden ? LETTERS_COPY.show : LETTERS.hideForNow}
        variant="outline"
        onPress={() => {
          store.setHidden(letter.id, !letter.hidden);
          void syncLetterReminder(useLettersStore.getState().letters.find((l) => l.id === letter.id)!);
        }}
      />
      <Pressable
        onPress={() => {
          const copy = letter;
          requestDelete({
            message: LETTERS_COPY.deleteConfirm,
            perform: () => {
              void cancelLetterReminder(copy);
              store.deleteLetter(copy.id);
              onDeleted();
            },
            restore: () => {
              useLettersStore.setState((s) => ({ letters: [...s.letters, { ...copy, notificationIds: undefined }] }));
              void syncLetterReminder({ ...copy, notificationIds: undefined });
            },
          });
        }}
        accessibilityRole="button"
        style={styles.link}
        testID="letter-delete"
      >
        <Caption>{LETTERS_COPY.delete}</Caption>
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
  chipRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
  chip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, minHeight: 36, justifyContent: 'center' as const },
  chipTextActive: { color: colors.white },
  text: { minHeight: 200, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  letter: { lineHeight: 24 },
  link: { minHeight: 40, justifyContent: 'center' as const },
}));
