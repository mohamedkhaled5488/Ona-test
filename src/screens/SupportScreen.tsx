// Support for this feeling: "I'm feeling… help me with it". For the feeling
// just logged, or one picked here: an acknowledgement, a short note on what
// the feeling often is, and a few options of different kinds, chosen by rules
// from hand-written content (support/engine.ts). Not AI, not therapy. Support
// lines one tap away on every page; in hard-feeling mode "Talk to someone" is
// in view. All of it is free. Held until the owner's final review.
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Body, Caption, ScreenTitle, SectionHeading } from '../components/Typography';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { SettingSwitch } from '../components/SettingSwitch';
import { SupportLink } from '../components/SupportLink';
import { ReasonTagPicker } from '../components/ReasonTagPicker';
import { useBackHandler } from '../hooks/useBackHandler';
import { useSectionStack } from '../hooks/useSectionStack';
import { colors, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import { sectionAccents } from '../theme/accents';
import { HARD_MODE } from '../content';
import type { SupportOption } from '../content/types';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { useSupportStore } from '../store/useSupportStore';
import { useReflectionStore } from '../store/useReflectionStore';
import { feelingZones, feelings as wheel } from '../data/feelingsWheel';
import { isLive } from '../data/sectionsMeta';
import { BUILT_IN_TOOLS } from '../quit/toolkit';
import { CHECK_IN, fromCheckIn, planSupport, type Helped, type SupportFeeling, type SupportPlan } from '../support/engine';
import { logFeeling } from '../feelings/logFeeling';
import { openSection } from '../navigation/navigationRef';
import { cancelReminders, scheduleAt } from '../utils/notifications';
import { PacedBreathing, ToolView } from './QuitTools';
import type { RootStackParamList } from '../navigation/types';
import type { FeelingZone } from '../types/sections';

const accent = sectionAccents.support;

export const SUPPORT_COPY = {
  title: "I'm feeling…",
  line: 'Pick how you feel, and Ona offers a few ideas. Written by people, not generated.',
  latest: (zone: string) => `Your latest feeling: ${zone}`,
  latestHelp: 'Help with this one',
  zone: 'How does it feel?',
  word: 'A more specific word (optional)',
  strength: 'How strong? (optional)',
  save: 'Also save it to my Feelings log',
  show: 'Show me some ideas',
  why: 'Why this can help',
  tryIt: 'Try this',
  write: 'Write about it',
  letter: 'Write a letter to yourself',
  supportLines: 'See support lines',
  hide: 'Not for me',
  didItHelp: (title: string) => `Did "${title}" help?`,
  thanks: "Thanks. Ona will remember, on this phone only.",
  done: 'Done',
  offerAfterLog: 'Offer ideas after I note a Low or Tense feeling',
  noFix: "You don't have to fix this right now.",
};

// The ideas are chosen once, when the page is opened, and kept with it: back
// from a tool, they're the same ones (with "Did this help?").
type Page = { kind: 'pick' } | { kind: 'result'; feeling: SupportFeeling; feelingId?: string; plan: SupportPlan } | { kind: 'tool'; optionId: string; toolId: string };

function choose(feeling: SupportFeeling): SupportPlan {
  const m = useSupportStore.getState();
  return planSupport(feeling, { memory: { votes: m.votes, hidden: m.hidden, history: m.history }, feelings: useFeelingsStore.getState().entries, now: new Date() });
}
// A plan is recorded as shown once, however often its page is drawn.
const recorded = new WeakSet<SupportPlan>();
type Props = NativeStackScreenProps<RootStackParamList, 'support'>;

export function SupportScreen({ route }: Props) {
  const { feelingId } = route.params ?? {};
  const [opened] = useState<Page[]>(() => {
    const f = feelingId ? useFeelingsStore.getState().entries.find((e) => e.id === feelingId) : undefined;
    return f ? [{ kind: 'result', feeling: fromCheckIn(f), feelingId: f.id, plan: choose(fromCheckIn(f)) }] : [];
  });
  const { current, push, stepBack, up } = useSectionStack<Page>({ kind: 'pick' }, opened);
  useBackHandler({ stepBack });
  return (
    <Screen>
      {current.kind === 'pick' && <PickPage onShow={(feeling, id) => push({ kind: 'result', feeling, feelingId: id, plan: choose(feeling) })} />}
      {current.kind === 'result' && <ResultPage feeling={current.feeling} feelingId={current.feelingId} plan={current.plan} onTool={(optionId, toolId) => push({ kind: 'tool', optionId, toolId })} />}
      {current.kind === 'tool' && <ToolPage toolId={current.toolId} onDone={up} />}
    </Screen>
  );
}

function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && { backgroundColor: accent, borderColor: accent }]} accessibilityRole="radio" accessibilityState={{ selected: on }} testID={testID}>
      <Caption style={on ? styles.chipTextActive : undefined}>{label}</Caption>
    </Pressable>
  );
}

function PickPage({ onShow }: { onShow: (f: SupportFeeling, feelingId?: string) => void }) {
  const entries = useFeelingsStore((s) => s.entries);
  const [zone, setZone] = useState<FeelingZone | undefined>();
  const [word, setWord] = useState<string | undefined>();
  const [strength, setStrength] = useState<number | undefined>();
  const [tags, setTags] = useState<string[]>([]);
  const [save, setSave] = useState(false);
  const offerAfterLog = useSupportStore((s) => s.offerAfterLog);
  // The latest feeling, if it was logged in the last few hours.
  const latest = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const recent = latest && Date.now() - new Date(latest.createdAt).getTime() < 3 * 3600_000 ? latest : undefined;
  const words = zone ? wheel.filter((f) => f.zone === zone) : [];
  const show = () => {
    if (!zone) return;
    const feeling: SupportFeeling = { zone, feelingIds: word ? [word] : [], intensity: strength, tags };
    const id = save ? logFeeling({ source: { kind: 'support', refId: '' }, zone, feelingIds: word ? [word] : [], intensities: word && strength ? { [word]: strength as 1 } : undefined, tags }) : undefined;
    onShow(feeling, id);
  };
  return (
    <View style={styles.gap}>
      <ScreenTitle>{SUPPORT_COPY.title}</ScreenTitle>
      <Caption>{SUPPORT_COPY.line}</Caption>
      {recent && (
        <Card style={styles.card}>
          <Body>{SUPPORT_COPY.latest([feelingZones.find((z) => z.id === recent.zone)?.label, ...recent.feelingIds.map((id) => wheel.find((f) => f.id === id)?.name)].filter(Boolean).join(' · '))}</Body>
          <PrimaryButton label={SUPPORT_COPY.latestHelp} variant="outline" onPress={() => onShow(fromCheckIn(recent), recent.id)} testID="support-latest" />
        </Card>
      )}
      <SectionHeading>{SUPPORT_COPY.zone}</SectionHeading>
      <View style={styles.chipRow}>
        {feelingZones.map((z) => (
          <Chip key={z.id} label={z.label} on={zone === z.id} onPress={() => (setZone(z.id), setWord(undefined))} testID={`support-zone-${z.id}`} />
        ))}
      </View>
      {words.length > 0 && (
        <>
          <Caption>{SUPPORT_COPY.word}</Caption>
          <View style={styles.chipRow}>
            {words.map((f) => (
              <Chip key={f.id} label={f.name} on={word === f.id} onPress={() => setWord(word === f.id ? undefined : f.id)} testID={`support-word-${f.id}`} />
            ))}
          </View>
          <Caption>{SUPPORT_COPY.strength}</Caption>
          <View style={styles.chipRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Chip key={n} label={String(n)} on={strength === n} onPress={() => setStrength(strength === n ? undefined : n)} testID={`support-strength-${n}`} />
            ))}
          </View>
          <ReasonTagPicker selected={tags} onChange={setTags} accent={accent} />
          <SettingSwitch label={SUPPORT_COPY.save} value={save} onValueChange={setSave} accent={accent} />
        </>
      )}
      <PrimaryButton label={SUPPORT_COPY.show} disabled={!zone} onPress={show} testID="support-show" />
      <SettingSwitch label={SUPPORT_COPY.offerAfterLog} value={offerAfterLog} onValueChange={(on) => useSupportStore.getState().setOfferAfterLog(on)} accent={accent} />
      <SupportLink />
    </View>
  );
}

function ResultPage({ feeling, feelingId, plan, onTool }: { feeling: SupportFeeling; feelingId?: string; plan: SupportPlan; onTool: (optionId: string, toolId: string) => void }) {
  const memory = useSupportStore();
  const hidden = useSupportStore((s) => s.hidden);
  const [asked, setAsked] = useState<Record<string, Helped>>({});
  const checkIn = useSupportStore((s) => s.checkInIds.length > 0);
  useEffect(() => {
    if (recorded.has(plan)) return;
    recorded.add(plan);
    useSupportStore.getState().recordShown({ at: new Date().toISOString(), feelingId, zone: feeling.zone, intensity: feeling.intensity, ackId: plan.acknowledge?.id, optionIds: plan.options.map((o) => o.id) });
  }, [plan, feeling, feelingId]);
  const used = memory.history[memory.history.length - 1]?.used ?? [];

  const act = (o: SupportOption) => {
    useSupportStore.getState().recordUsed(o.id);
    if (o.support) return openSection('settings', { page: 'safety' });
    if (o.tool) return onTool(o.id, o.tool);
    if (o.letter && isLive('letters')) return openSection('letters', { write: o.letter });
    if (o.prompt && isLive('reflection')) {
      const id = useReflectionStore.getState().start({ mode: 'free', title: o.title, questions: [{ question: o.prompt }] });
      return openSection('reflection', { openSessionId: id, page: 'session' });
    }
  };
  const label = (o: SupportOption) => (o.support ? SUPPORT_COPY.supportLines : o.tool ? SUPPORT_COPY.tryIt : o.letter && isLive('letters') ? SUPPORT_COPY.letter : o.prompt && isLive('reflection') ? SUPPORT_COPY.write : undefined);
  const toggleCheckIn = async (on: boolean) => {
    const store = useSupportStore.getState();
    if (store.checkInIds.length) await cancelReminders(store.checkInIds);
    store.setCheckInIds(on ? await scheduleAt(new Date(Date.now() + 3600_000), 'support', CHECK_IN.title, CHECK_IN.body) : []);
  };

  if (plan.mode === 'danger')
    return (
      <View style={styles.gap} testID="support-danger">
        <Card style={[styles.card, styles.talk]}>
          <SectionHeading>{HARD_MODE.dangerTitle}</SectionHeading>
          <Body>{HARD_MODE.dangerLine}</Body>
          <PrimaryButton label={SUPPORT_COPY.supportLines} onPress={() => openSection('settings', { page: 'safety' })} testID="support-lines" />
        </Card>
        <SupportLink />
      </View>
    );

  const options = plan.options.filter((o) => !hidden.includes(o.id));
  return (
    <View style={styles.gap} testID={`support-${plan.mode}`}>
      {plan.acknowledge && <Body style={styles.ack}>{plan.acknowledge.text}</Body>}
      {plan.lines.map((l) => (
        <Body key={l.id}>{l.text}</Body>
      ))}
      {plan.understand && <Caption>{plan.understand.text}</Caption>}
      {plan.mode === 'hard' && (
        <Card style={[styles.card, styles.talk]}>
          <Body style={styles.bold}>{HARD_MODE.talkTitle}</Body>
          <Caption>{HARD_MODE.talkLine}</Caption>
          <PrimaryButton label={SUPPORT_COPY.supportLines} variant="outline" onPress={() => openSection('settings', { page: 'safety' })} testID="support-talk" />
        </Card>
      )}
      {options.map((o) => (
        <OptionCard
          key={o.id}
          option={o}
          insight={plan.insights[o.id]}
          action={label(o)}
          onAct={() => act(o)}
          onHide={o.support ? undefined : () => useSupportStore.getState().hide(o.id)}
          helped={used.includes(o.id) && !o.support ? asked[o.id] ?? null : undefined}
          onHelped={(h) => (useSupportStore.getState().vote(o.id, h), setAsked((a) => ({ ...a, [o.id]: h })))}
        />
      ))}
      <SettingSwitch label={HARD_MODE.checkInLater} value={checkIn} onValueChange={(on) => void toggleCheckIn(on)} accent={accent} />
      <SupportLink />
    </View>
  );
}

function OptionCard({ option, insight, action, onAct, onHide, helped, onHelped }: { option: SupportOption; insight?: string; action?: string; onAct: () => void; onHide?: () => void; helped?: Helped | null; onHelped: (h: Helped) => void }) {
  const [why, setWhy] = useState(false);
  return (
    <Card style={styles.card} testID={`support-option-${option.id}`}>
      <Body style={styles.bold}>{option.title}</Body>
      <Body>{option.text}</Body>
      {insight && <Caption style={{ color: accent }}>{insight}</Caption>}
      <Pressable onPress={() => setWhy((w) => !w)} accessibilityRole="button" accessibilityState={{ expanded: why }} style={styles.link}>
        <Caption>{SUPPORT_COPY.why}</Caption>
      </Pressable>
      {why && <Caption>{option.why}</Caption>}
      <View style={styles.row}>
        {action && <PrimaryButton label={action} onPress={onAct} style={styles.flex} />}
        {onHide && <PrimaryButton label={SUPPORT_COPY.hide} variant="outline" onPress={onHide} style={styles.flex} />}
      </View>
      {helped === null && (
        <View style={styles.gapSmall}>
          <Caption>{SUPPORT_COPY.didItHelp(option.title)}</Caption>
          <View style={styles.chipRow}>
            {(
              [
                ['yes', HARD_MODE.helped.yes],
                ['aLittle', HARD_MODE.helped.aLittle],
                ['notReally', HARD_MODE.helped.notReally],
              ] as [Helped, string][]
            ).map(([k, l]) => (
              <Chip key={k} label={l} on={false} onPress={() => onHelped(k)} testID={`support-helped-${k}`} />
            ))}
          </View>
        </View>
      )}
      {helped && <Caption>{SUPPORT_COPY.thanks}</Caption>}
    </Card>
  );
}

function ToolPage({ toolId, onDone }: { toolId: string; onDone: () => void }) {
  const [startedAt] = useState(() => new Date().toISOString());
  const tool = BUILT_IN_TOOLS.find((t) => t.id === toolId);
  return (
    <View style={styles.gap}>
      {toolId === 'breathing' ? <PacedBreathing /> : tool ? <ToolView tool={tool} startedAt={startedAt} onDone={onDone} /> : null}
      <PrimaryButton label={SUPPORT_COPY.done} variant="outline" onPress={onDone} testID="support-tool-done" />
      <SupportLink />
    </View>
  );
}

const styles = themedStyles(() => ({
  gap: { gap: spacing.md },
  gapSmall: { gap: spacing.xs },
  row: { flexDirection: 'row' as const, gap: spacing.sm },
  flex: { flex: 1 },
  bold: { fontWeight: '600' as const },
  ack: { fontSize: 19, lineHeight: 27 },
  card: { gap: spacing.sm },
  talk: { borderWidth: 1, borderColor: accent },
  chipRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
  chip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, minHeight: 40, justifyContent: 'center' as const },
  chipTextActive: { color: colors.white },
  link: { minHeight: 36, justifyContent: 'center' as const },
}));
