// The craving toolkit's screens (quit/toolkit.ts): the menu in a craving,
// "My toolkit" (pin, order, hide, your own tools, if-then plans, what you're
// quitting), the one-time offer to set it up, and a tool of your own with
// its optional gentle timer.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from '../components/TextInput';
import { Card } from '../components/Card';
import { SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { SettingSwitch } from '../components/SettingSwitch';
import { TimerRing } from '../components/TimerRing';
import { useUi } from '../components/UiProvider';
import { colors, radii, spacing, fonts } from '../theme';
import { sectionAccents } from '../theme/accents';
import { themedStyles } from '../theme/runtime';
import { useQuitHabitsStore } from '../store/useQuitHabitsStore';
import { formatRideTimer } from '../quit/journey';
import {
  HABIT_TYPES,
  TIMES_OF_DAY,
  TOOLKIT_COPY,
  TOOL_CATEGORIES,
  allTools,
  findTool,
  gamesHidden,
  myToolkit,
  needsSubstanceNote,
  suggestionFor,
  surpriseFor,
  toolkitOf,
  toolsByCategory,
  visibleTools,
  type TimeOfDay,
  type ToolDef,
} from '../quit/toolkit';
import type { QuitCravingSession, QuitHabit, QuitHabitType } from '../types/sections';

const accent = sectionAccents.quitHabit;
const OWN_MINUTES = [2, 5, 10, 15];

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && { backgroundColor: accent, borderColor: accent }]} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={label}>
      <Body style={selected ? styles.chipTextActive : undefined}>{label}</Body>
    </Pressable>
  );
}

export function HabitTypeChips({ value, onChange }: { value: QuitHabitType | undefined; onChange: (t: QuitHabitType | undefined) => void }) {
  return (
    <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel={TOOLKIT_COPY.typeHeading}>
      {HABIT_TYPES.map((t) => (
        <Chip key={t.id} label={t.label} selected={value === t.id} onPress={() => onChange(value === t.id ? undefined : t.id)} />
      ))}
    </View>
  );
}

// Once, after a new quit habit is made (when the user is calm). Either answer
// puts it away for good; My toolkit stays on the journey.
export function ToolkitOffer({ habit, onOpen }: { habit: QuitHabit; onOpen: () => void }) {
  const update = useQuitHabitsStore((s) => s.updateQuitHabit);
  if (habit.toolkitOffered !== false) return null;
  return (
    <Card style={[styles.offer, { borderLeftColor: accent }]}>
      <Body>{TOOLKIT_COPY.offerTitle}</Body>
      <Caption>{TOOLKIT_COPY.offerLine}</Caption>
      <View style={styles.row}>
        <PrimaryButton label={TOOLKIT_COPY.offerNo} variant="outline" style={styles.flex} onPress={() => update(habit.id, { toolkitOffered: true })} />
        <PrimaryButton
          label={TOOLKIT_COPY.offerYes}
          style={styles.flex}
          onPress={() => {
            update(habit.id, { toolkitOffered: true });
            onOpen();
          }}
        />
      </View>
    </Card>
  );
}

export function ToolkitEntry({ onOpen }: { onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={TOOLKIT_COPY.title}>
      <Card style={styles.entry}>
        <Ionicons name="star-outline" size={20} color={accent} />
        <View style={styles.flex}>
          <Body>{TOOLKIT_COPY.title}</Body>
          <Caption>{TOOLKIT_COPY.entryLine}</Caption>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
      </Card>
    </Pressable>
  );
}

function ToolCard({ tool, eyebrow, line, onPress, big }: { tool: ToolDef; eyebrow?: string; line?: string; onPress: () => void; big?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={tool.title} accessibilityHint={eyebrow}>
      <Card style={[styles.toolCard, big && styles.toolCardBig, big && { borderLeftColor: accent }]}>
        {eyebrow && <Eyebrow style={{ color: accent }}>{eyebrow}</Eyebrow>}
        <Body style={big ? styles.bigTitle : undefined}>{tool.title}</Body>
        <Caption>{line ?? tool.line}</Caption>
      </Card>
    </Pressable>
  );
}

// In a craving: one suggestion first, your pinned tools, "Surprise me", and
// everything else one tap away.
export function CravingMenu({ habit, session, onPick }: { habit: QuitHabit; session: QuitCravingSession | undefined; onPick: (toolId: string) => void }) {
  const sessions = useQuitHabitsStore((s) => s.cravingSessions);
  const [all, setAll] = useState(false);
  const suggestion = suggestionFor(habit, new Date());
  const mine = myToolkit(habit).filter((t) => t.id !== suggestion?.tool.id);
  const surprise = surpriseFor(habit, sessions, session);
  const visible = visibleTools(habit);
  const hiddenGames = gamesHidden(habit) && allTools(habit).some((t) => t.screenGame);
  return (
    <>
      {suggestion && (
        <ToolCard
          big
          tool={suggestion.tool}
          eyebrow={suggestion.source === 'plan' ? TOOLKIT_COPY.suggestPlan : suggestion.source === 'pinned' ? TOOLKIT_COPY.suggestPinned : TOOLKIT_COPY.suggestDefault}
          line={suggestion.source === 'plan' ? TOOLKIT_COPY.plan(suggestion.plan.when, suggestion.tool.title) : undefined}
          onPress={() => onPick(suggestion.tool.id)}
        />
      )}
      {mine.length > 0 && (
        <>
          <Eyebrow style={styles.label}>{TOOLKIT_COPY.mineHeading}</Eyebrow>
          {mine.map((t) => (
            <ToolCard key={t.id} tool={t} onPress={() => onPick(t.id)} />
          ))}
        </>
      )}
      <View style={styles.row}>
        {surprise && <PrimaryButton label={TOOLKIT_COPY.surprise} variant="outline" style={styles.flex} onPress={() => onPick(surprise.id)} />}
        {!all && <PrimaryButton label={TOOLKIT_COPY.seeAll} variant="outline" style={styles.flex} onPress={() => setAll(true)} />}
      </View>
      {all &&
        toolsByCategory(visible).map(({ category, tools }) => (
          <View key={category.id} style={styles.category}>
            <View style={styles.categoryHeader}>
              <Ionicons name={category.icon as never} size={16} color={accent} />
              <Eyebrow>{category.title}</Eyebrow>
            </View>
            {tools.map((t) => (
              <ToolCard key={t.id} tool={t} onPress={() => onPick(t.id)} />
            ))}
          </View>
        ))}
      {all && hiddenGames && <Caption style={styles.note}>{TOOLKIT_COPY.gamesHiddenInMenu}</Caption>}
    </>
  );
}

// A tool of your own: its name and, if you gave it one, a gentle countdown
// from when you picked it (right after Ona was closed). Nothing happens when
// it runs out but a quiet line.
export function OwnToolView({ tool, startedAt, onDone }: { tool: ToolDef; startedAt: string; onDone: () => void }) {
  const [, tick] = useState(0);
  React.useEffect(() => {
    if (!tool.minutes) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [tool.minutes]);
  if (!tool.minutes) {
    return (
      <>
        <SectionHeading>{tool.title}</SectionHeading>
        <PrimaryButton label="Done" onPress={onDone} style={styles.submit} />
      </>
    );
  }
  const left = Math.max(0, Math.ceil(tool.minutes * 60 - (Date.now() - new Date(startedAt).getTime()) / 1000));
  return (
    <>
      <SectionHeading>{tool.title}</SectionHeading>
      <TimerRing caption={left > 0 ? TOOLKIT_COPY.ownTimerCaption : TOOLKIT_COPY.ownTimerDone} timeText={formatRideTimer(left)} primaryLabel="Done" onPrimary={onDone} />
    </>
  );
}

// ---------------------------------------------------------------------------
// My toolkit: what you're quitting, if-then plans, pinned tools in order,
// every tool (pin or hide), and your own.
export function ToolkitStage({ habitId, onBack }: { habitId: string; onBack: () => void }) {
  const habit = useQuitHabitsStore((s) => s.habits.find((h) => h.id === habitId));
  const store = useQuitHabitsStore.getState();
  const { showDialog, showToast } = useUi();
  const [when, setWhen] = useState('');
  const [time, setTime] = useState<TimeOfDay | undefined>();
  const [planTool, setPlanTool] = useState<string | undefined>();
  const [ownName, setOwnName] = useState('');
  const [ownMinutes, setOwnMinutes] = useState<number | undefined>();
  if (!habit) return null;

  const tk = toolkitOf(habit);
  const visible = visibleTools(habit);
  const mine = myToolkit(habit);
  const setType = (t: QuitHabitType | undefined) => {
    store.updateQuitHabit(habit.id, { habitType: t });
    if (t && !habit.substanceNoteShown && needsSubstanceNote({ ...habit, habitType: t })) {
      store.updateQuitHabit(habit.id, { substanceNoteShown: true });
      showDialog({ title: TOOLKIT_COPY.substanceTitle, message: TOOLKIT_COPY.substanceNote, actions: [{ label: 'OK', style: 'cancel' }] });
    }
  };
  const toggleHidden = (t: ToolDef) => {
    const hidden = tk.hidden.includes(t.id);
    if (!hidden && visible.length <= 1 && visible[0]?.id === t.id) return showToast({ message: TOOLKIT_COPY.keepOne });
    store.hideTool(habit.id, t.id, !hidden);
  };
  const removeOwn = (t: ToolDef) =>
    showDialog({
      title: TOOLKIT_COPY.removeOwnTitle(t.title),
      message: TOOLKIT_COPY.removeOwnMessage,
      actions: [
        { label: 'Cancel', style: 'cancel' },
        { label: 'Remove', style: 'destructive', onPress: () => store.removeCustomTool(habit.id, t.id) },
      ],
    });

  return (
    <>
      <Pressable onPress={onBack} style={styles.backLink} accessibilityRole="button">
        <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
        <Caption> {habit.name}</Caption>
      </Pressable>
      <SectionHeading>{TOOLKIT_COPY.title}</SectionHeading>

      <Eyebrow style={styles.label}>{TOOLKIT_COPY.typeHeading}</Eyebrow>
      <HabitTypeChips value={habit.habitType} onChange={setType} />
      {needsSubstanceNote(habit) && (
        <Card style={styles.noteCard}>
          <Caption>{TOOLKIT_COPY.substanceNote}</Caption>
        </Card>
      )}
      {gamesHidden(habit) || tk.showGames ? (
        <Card style={styles.noteCard}>
          <Caption>{TOOLKIT_COPY.gamesNote}</Caption>
          <SettingSwitch label={TOOLKIT_COPY.showGames} value={!!tk.showGames} onValueChange={(on) => store.setShowGames(habit.id, on)} accent={accent} />
        </Card>
      ) : null}

      <Eyebrow style={styles.label}>{TOOLKIT_COPY.plansHeading}</Eyebrow>
      <Caption style={styles.note}>{TOOLKIT_COPY.plansLine}</Caption>
      {(habit.plans ?? []).map((p) => {
        const tool = findTool(habit, p.toolId);
        const time = TIMES_OF_DAY.find((t) => t.id === p.timeOfDay)?.label ?? TOOLKIT_COPY.anyTime;
        const text = TOOLKIT_COPY.plan(p.when, tool?.title ?? '…');
        return (
          <Card key={p.id} style={styles.listRow}>
            <View style={styles.flex}>
              <Body>{text}</Body>
              <Caption>{time}</Caption>
            </View>
            <Pressable onPress={() => store.removePlan(habit.id, p.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={TOOLKIT_COPY.remove(text)}>
              <Ionicons name="close" size={18} color={colors.inkSoft} />
            </Pressable>
          </Card>
        );
      })}
      <Card style={styles.form}>
        <Eyebrow>{TOOLKIT_COPY.planWhen}</Eyebrow>
        <TextInput value={when} onChangeText={setWhen} placeholder={TOOLKIT_COPY.planWhenPlaceholder} style={styles.input} accessibilityLabel={TOOLKIT_COPY.planWhen} />
        <Eyebrow>{TOOLKIT_COPY.planTime}</Eyebrow>
        <View style={styles.chipRow}>
          <Chip label={TOOLKIT_COPY.anyTime} selected={!time} onPress={() => setTime(undefined)} />
          {TIMES_OF_DAY.map((t) => (
            <Chip key={t.id} label={t.label} selected={time === t.id} onPress={() => setTime(t.id)} />
          ))}
        </View>
        <Eyebrow>{TOOLKIT_COPY.planThen}</Eyebrow>
        <View style={styles.chipRow}>
          {visible.map((t) => (
            <Chip key={t.id} label={t.title} selected={planTool === t.id} onPress={() => setPlanTool(t.id)} />
          ))}
        </View>
        <PrimaryButton
          label={TOOLKIT_COPY.addPlan}
          disabled={!when.trim() || !planTool}
          onPress={() => {
            store.addPlan(habit.id, { when, timeOfDay: time, toolId: planTool! });
            setWhen('');
            setTime(undefined);
            setPlanTool(undefined);
          }}
        />
      </Card>

      <Eyebrow style={styles.label}>{TOOLKIT_COPY.mineHeading}</Eyebrow>
      <Caption style={styles.note}>{mine.length ? TOOLKIT_COPY.mineLine : TOOLKIT_COPY.mineEmpty}</Caption>
      {mine.map((t, i) => (
        <Card key={t.id} style={styles.listRow}>
          <Body style={styles.flex}>{t.title}</Body>
          <IconButton icon="chevron-up" label={TOOLKIT_COPY.up(t.title)} disabled={i === 0} onPress={() => store.moveTool(habit.id, t.id, -1)} />
          <IconButton icon="chevron-down" label={TOOLKIT_COPY.down(t.title)} disabled={i === mine.length - 1} onPress={() => store.moveTool(habit.id, t.id, 1)} />
          <IconButton icon="star" label={TOOLKIT_COPY.unpin(t.title)} onPress={() => store.pinTool(habit.id, t.id, false)} />
        </Card>
      ))}

      <Eyebrow style={styles.label}>{TOOLKIT_COPY.allHeading}</Eyebrow>
      <Caption style={styles.note}>{TOOLKIT_COPY.allLine}</Caption>
      {TOOL_CATEGORIES.map((category) => {
        const tools = allTools(habit).filter((t) => t.category === category.id && !(gamesHidden(habit) && t.screenGame));
        if (!tools.length) return null;
        return (
          <View key={category.id} style={styles.category}>
            <View style={styles.categoryHeader}>
              <Ionicons name={category.icon as never} size={16} color={accent} />
              <Eyebrow>{category.title}</Eyebrow>
            </View>
            {tools.map((t) => {
              const pinned = tk.pinned.includes(t.id);
              const hidden = tk.hidden.includes(t.id);
              return (
                <Card key={t.id} style={[styles.listRow, hidden && styles.hiddenRow]}>
                  <View style={styles.flex}>
                    <Body>{t.title}</Body>
                    {hidden && <Caption>Hidden</Caption>}
                  </View>
                  {!hidden && <IconButton icon={pinned ? 'star' : 'star-outline'} label={pinned ? TOOLKIT_COPY.unpin(t.title) : TOOLKIT_COPY.pin(t.title)} onPress={() => store.pinTool(habit.id, t.id, !pinned)} />}
                  <IconButton icon={hidden ? 'eye-off-outline' : 'eye-outline'} label={hidden ? TOOLKIT_COPY.show(t.title) : TOOLKIT_COPY.hide(t.title)} onPress={() => toggleHidden(t)} />
                  {t.category === 'own' && <IconButton icon="trash-outline" label={TOOLKIT_COPY.remove(t.title)} onPress={() => removeOwn(t)} />}
                </Card>
              );
            })}
          </View>
        );
      })}

      <Eyebrow style={styles.label}>{TOOLKIT_COPY.ownHeading}</Eyebrow>
      <Card style={styles.form}>
        <Eyebrow>{TOOLKIT_COPY.ownName}</Eyebrow>
        <TextInput value={ownName} onChangeText={setOwnName} placeholder={TOOLKIT_COPY.ownNamePlaceholder} style={styles.input} accessibilityLabel={TOOLKIT_COPY.ownName} />
        <Eyebrow>{TOOLKIT_COPY.ownMinutes}</Eyebrow>
        <View style={styles.chipRow}>
          <Chip label={TOOLKIT_COPY.noTimer} selected={!ownMinutes} onPress={() => setOwnMinutes(undefined)} />
          {OWN_MINUTES.map((m) => (
            <Chip key={m} label={`${m} min`} selected={ownMinutes === m} onPress={() => setOwnMinutes(m)} />
          ))}
        </View>
        <PrimaryButton
          label={TOOLKIT_COPY.addOwn}
          disabled={!ownName.trim()}
          onPress={() => {
            store.addCustomTool(habit.id, ownName, ownMinutes);
            setOwnName('');
            setOwnMinutes(undefined);
          }}
        />
      </Card>
    </>
  );
}

function IconButton({ icon, label, onPress, disabled }: { icon: string; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}>
      <Ionicons name={icon as never} size={20} color={disabled ? colors.line : accent} />
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.sm },
  backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  label: { marginTop: spacing.lg, marginBottom: spacing.xs },
  note: { color: colors.inkSoft, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: { minHeight: 40, justifyContent: 'center', paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  chipTextActive: { color: colors.white },
  offer: { gap: spacing.xs, marginBottom: spacing.md, borderLeftWidth: 3 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  toolCard: { gap: 2, marginBottom: spacing.sm, minHeight: 56, justifyContent: 'center' },
  toolCardBig: { borderLeftWidth: 3, paddingVertical: spacing.lg },
  bigTitle: { fontFamily: fonts.bodyMedium, fontSize: 18 },
  category: { marginTop: spacing.sm },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  hiddenRow: { opacity: 0.6 },
  iconButton: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  noteCard: { backgroundColor: colors.stone, gap: spacing.xs, marginBottom: spacing.sm },
  form: { gap: spacing.xs, marginBottom: spacing.md },
  input: { fontFamily: fonts.body, fontSize: 15, color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  submit: { marginTop: spacing.md },
}));
