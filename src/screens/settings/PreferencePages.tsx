// Appearance & Language, Sound, and the per-section settings pages.
import { REMINDER_SOUND } from '../../config/reminderWording';
import { resyncAllReminders } from '../../utils/reminders';
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption } from '../../components/Typography';
import { useUi } from '../../components/UiProvider';
import { useSettingsStore, localeWeekStart, type WeekStart, type FeelingAsk } from '../../store/useSettingsStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { sectionsMeta } from '../../data/sectionsMeta';
import { ambientSoundOptions, studyPresets } from '../../data/studyPresets';
import { currencies } from '../../data/currencies';
import type { PatternsView } from '../../utils/feelingsStats';
import { RECAP_SECTIONS } from '../../utils/recapStats';
import { resyncFeature } from '../../utils/reminders';
import { formatClockTime } from '../../utils/date';
import { ACCENTS, type TextSize } from '../../theme/runtime';
import { colors, radii, spacing } from '../../theme';
import { themedStyles } from '../../theme/runtime';
import { ChoiceRow, Group, NavRow, ToggleRow } from './SettingsParts';
import { alarmSoundOptions } from '../../data/alarmSounds';
import { playAlarmPreview } from '../../utils/alarmPreview';
import { SETTINGS_SECTIONS, type SettingsPage, type SettingsParams, type SettingsSectionId } from './pages';
import { JournalLockGroup } from './SecurityPages';
import { backgroundThemes, fontFamilies, templateOptions, textSizes } from '../JournalWriteScreen';
import type { LockScope } from '../../utils/pinLock';
import type { JournalBackground, JournalFont, JournalPageTemplate, JournalTextSize } from '../../types/sections';
import type { SectionId } from '../../types/sections';

const WEEK_LABEL: Record<WeekStart, string> = { 6: 'Saturday', 0: 'Sunday', 1: 'Monday' };

function sectionTitle(id: SectionId): string {
  return sectionsMeta.find((s) => s.id === id)?.title ?? id;
}

export function AppearancePage() {
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);
  const textSize = useSettingsStore((s) => s.textSize);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const haptics = useSettingsStore((s) => s.haptics);
  const timeFormat = useSettingsStore((s) => s.timeFormat);
  const set = useSettingsStore((s) => s.set);
  const localeStart = localeWeekStart();

  return (
    <>
      <Group title="Look">
        <ChoiceRow
          label="Theme"
          explain="System follows your phone's light or dark mode"
          options={[
            { id: 'system', label: 'System' },
            { id: 'light', label: 'Light' },
            { id: 'dark', label: 'Dark' },
          ]}
          value={theme}
          onChange={(id) => set('theme', id)}
        />
        <View style={styles.block}>
          <Body>Accent color</Body>
          <Caption>Buttons, switches and highlights</Caption>
          <View style={styles.swatches} accessibilityRole="radiogroup">
            {ACCENTS.map((a) => {
              const active = a.id === accent;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => set('accent', a.id)}
                  style={[styles.swatch, { backgroundColor: a.dark }, active && styles.swatchActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Accent color: ${a.label}`}
                >
                  {active && <Ionicons name="checkmark" size={18} color={colors.white} />}
                </Pressable>
              );
            })}
          </View>
        </View>
        <ChoiceRow<TextSize>
          label="Text size"
          explain="Default follows your phone's text size. The others make text bigger on top of that."
          options={[
            { id: 'system', label: 'Default' },
            { id: 'large', label: 'Large' },
            { id: 'larger', label: 'Larger' },
            { id: 'largest', label: 'Largest' },
          ]}
          value={textSize}
          onChange={(id) => set('textSize', id)}
        />
        <ToggleRow label="Haptics" explain="A light tap when you tick something off or enter a PIN" value={haptics} onChange={(on) => set('haptics', on)} />
        <View style={styles.block}>
          <Body>Reduce motion</Body>
          <Caption>Follows your phone's reduce-motion setting.</Caption>
        </View>
      </Group>

      <Group title="Calendar">
        <ChoiceRow<WeekStart>
          label="Week starts on"
          explain={`Used by Recap, calendars and weekly goals everywhere. Your region usually starts on ${WEEK_LABEL[localeStart]}.`}
          options={([6, 0, 1] as WeekStart[]).map((id) => ({ id, label: WEEK_LABEL[id] }))}
          value={weekStartsOn}
          onChange={(id) => set('weekStartsOn', id)}
        />
        <ChoiceRow
          label="Time format"
          explain={`For times shown anywhere in Ona. Now: ${formatClockTime('18:30', timeFormat)}`}
          options={[
            { id: 'system', label: 'Phone setting' },
            { id: '12h', label: '12-hour' },
            { id: '24h', label: '24-hour' },
          ]}
          value={timeFormat}
          onChange={(id) => set('timeFormat', id)}
        />
      </Group>

      <Group title="Language">
        <View style={styles.block}>
          <Body>English</Body>
          <Caption>More languages are coming.</Caption>
        </View>
      </Group>
    </>
  );
}

export function SoundPage() {
  const s = useSettingsStore();
  return (
    <>
      <Group title="Playback" footer="Study and Sleep share one sound engine, so these apply to both.">
        <ToggleRow
          label="Keep sounds playing in the background"
          explain="Keeps going when you switch apps or lock your phone"
          value={s.backgroundAudio}
          onChange={(on) => s.set('backgroundAudio', on)}
        />
        <ChoiceRow
          label="When a call or another app plays sound"
          explain="What happens to Ona's sound"
          options={[
            { id: 'pause', label: 'Pause Ona' },
            { id: 'lower', label: 'Lower it and keep going' },
          ]}
          value={s.interruption}
          onChange={(id) => s.set('interruption', id)}
        />
      </Group>
      <StudySoundSettings />
      <SleepSoundSettings />
    </>
  );
}

function StudySoundSettings() {
  const value = useSettingsStore((s) => s.defaultStudySound);
  const set = useSettingsStore((s) => s.set);
  return (
    <Group title="Study">
      <ChoiceRow
        label="Default ambient sound"
        explain="What a new study session starts with"
        options={ambientSoundOptions.map((o) => ({ id: o.id, label: o.label }))}
        value={value}
        onChange={(id) => set('defaultStudySound', id)}
      />
    </Group>
  );
}

const TIMER_OPTIONS: { id: number | null; label: string }[] = [
  { id: null, label: 'Off' },
  { id: 15, label: '15 min' },
  { id: 30, label: '30 min' },
  { id: 45, label: '45 min' },
  { id: 60, label: '1 hr' },
  { id: 90, label: '1.5 hr' },
];

function SleepSoundSettings() {
  const timer = useSettingsStore((s) => s.defaultSleepTimerMinutes);
  const fade = useSettingsStore((s) => s.defaultFadeOutMinutes);
  const set = useSettingsStore((s) => s.set);
  return (
    <Group title="Sleep">
      <ChoiceRow label="Sleep timer" explain="How long sounds play before stopping" options={TIMER_OPTIONS} value={timer} onChange={(id) => set('defaultSleepTimerMinutes', id)} />
      <ChoiceRow
        label="Fade-out"
        explain="How gently sounds fade at the end of the timer"
        options={[0, 2, 5, 10].map((m) => ({ id: m, label: m === 0 ? 'None' : `${m} min` }))}
        value={fade}
        onChange={(id) => set('defaultFadeOutMinutes', id)}
      />
    </Group>
  );
}

const FEELING_ASK_OPTIONS: { id: FeelingAsk; label: string }[] = [
  { id: 'always', label: 'Always ask' },
  { id: 'sometimes', label: 'Ask sometimes' },
  { id: 'never', label: 'Never' },
];

export function SectionsPage({ openSection }: { openSection: (id: SettingsSectionId) => void }) {
  return (
    <Group footer="The other sections don't have settings yet.">
      {SETTINGS_SECTIONS.map((id) => (
        <NavRow key={id} label={sectionTitle(id)} onPress={() => openSection(id)} />
      ))}
    </Group>
  );
}

export function SectionSettingsPage({
  section,
  go,
  openPin,
}: {
  section: SettingsSectionId;
  go: (page: SettingsPage) => void;
  openPin: (scope: LockScope, mode: NonNullable<SettingsParams['pinMode']>) => void;
}) {
  const s = useSettingsStore();
  const customTags = useFeelingsStore((f) => f.customReasonTags);
  const removeTag = useFeelingsStore((f) => f.removeCustomReasonTag);
  const { requestDelete } = useUi();

  switch (section) {
    case 'dailyPlanning':
      return (
        <>
          <Group>
            <ChoiceRow
              label="Default view"
              explain="How a day opens"
              options={[
                { id: 'list', label: 'List' },
                { id: 'timeline', label: 'Timeline' },
              ]}
              value={s.dailyDefaultView}
              onChange={(id) => s.set('dailyDefaultView', id)}
            />
            <ChoiceRow<WeekStart>
              label="Week starts on"
              explain="For the week strip and Insights. The same setting as in Appearance, used everywhere in Ona."
              options={([6, 0, 1] as WeekStart[]).map((id) => ({ id, label: id === 6 ? 'Saturday' : id === 0 ? 'Sunday' : 'Monday' }))}
              value={s.weekStartsOn}
              onChange={(id) => s.set('weekStartsOn', id)}
            />
          </Group>
          <Group title="New tasks">
            <ChoiceRow<number | null>
              label="Default reminder"
              explain="Added when a new task gets a start time. Each task can change it."
              options={[
                { id: null, label: 'None' },
                { id: 0, label: 'At start' },
                { id: 5, label: '5 min' },
                { id: 10, label: '10 min' },
                { id: 15, label: '15 min' },
                { id: 30, label: '30 min' },
                { id: 60, label: '1 h' },
              ]}
              value={s.dailyDefaultReminder}
              onChange={(id) => s.set('dailyDefaultReminder', id)}
            />
            <ChoiceRow
              label={REMINDER_SOUND.settingLabel}
              explain={REMINDER_SOUND.settingExplain}
              options={alarmSoundOptions.map((o) => ({ id: o.id, label: o.label }))}
              value={s.defaultAlarmSound}
              onChange={(id) => {
                s.set('defaultAlarmSound', id);
                playAlarmPreview(id);
                void resyncAllReminders();
              }}
            />
            <ChoiceRow<number | null>
              label="Default estimate"
              explain="Filled in on new tasks, so Plan my day can add things up."
              options={[
                { id: null, label: 'None' },
                { id: 15, label: '15 min' },
                { id: 30, label: '30 min' },
                { id: 60, label: '1 h' },
              ]}
              value={s.dailyDefaultEstimate}
              onChange={(id) => s.set('dailyDefaultEstimate', id)}
            />
          </Group>
          <Group title="Feelings">
            <ChoiceRow
              label='Ask "How do you feel?" after a task'
              explain="A small sheet you can always skip. It never asks after quick tasks unless you choose Always."
              options={[
                { id: 'auto', label: 'Important or tagged' },
                { id: 'always', label: 'Always' },
                { id: 'tagged', label: 'Tagged only' },
                { id: 'never', label: 'Never' },
              ]}
              value={s.taskFeelingMode}
              onChange={(id) => s.set('taskFeelingMode', id)}
            />
            <ToggleRow
              label="Also ask before starting"
              explain='When you press Start on a task, so you can see how it changed your mood'
              value={s.taskFeelingBefore}
              onChange={(on) => s.set('taskFeelingBefore', on)}
            />
          </Group>
          <Group title="Organise">
            <NavRow icon="pricetags-outline" label="Tags" explain="Rename, recolor, merge or delete" onPress={() => go('dpTags')} />
            <NavRow icon="copy-outline" label="Task templates" explain="Your templates, and the starter ones" onPress={() => go('dpTemplates')} />
            <NavRow icon="leaf-outline" label="Let go" explain="Tasks you chose to let go, and bringing them back" onPress={() => go('dpArchive')} />
          </Group>
          <Group title="Insights">
            <ToggleRow
              label="Planning days card"
              explain="A calm count of days you planned. Breaks pause it; nothing resets it."
              value={s.planningStreakCard}
              onChange={(on) => s.set('planningStreakCard', on)}
            />
          </Group>
          <Group title="Reminders">
            <NavRow label="Quiet hours and reminder switches" onPress={() => go('notifications')} />
          </Group>
        </>
      );
    case 'journaling':
      return (
        <>
          <Group title="Writing" footer="Page changes you make while writing are saved here too.">
            <ChoiceRow<JournalFont>
              label="Default font"
              explain="For new entries, including handwriting styles"
              options={(Object.keys(fontFamilies) as JournalFont[]).map((id) => ({ id, label: fontFamilies[id].label }))}
              value={s.journalDefaultFont}
              onChange={(id) => s.set('journalDefaultFont', id)}
            />
            <ChoiceRow<JournalPageTemplate>
              label="Page style"
              explain="The lines on the page"
              options={templateOptions.map((t) => ({ id: t.id, label: t.label }))}
              value={s.journalPageStyle.template}
              onChange={(id) => s.setJournalPageStyle({ template: id })}
            />
            <ChoiceRow<JournalBackground>
              label="Page color"
              explain="The paper you write on"
              options={(Object.keys(backgroundThemes) as JournalBackground[]).map((id) => ({ id, label: backgroundThemes[id].label }))}
              value={s.journalPageStyle.background}
              onChange={(id) => s.setJournalPageStyle({ background: id })}
            />
            <ChoiceRow<JournalTextSize>
              label="Writing size"
              explain="Text size on the page"
              options={(Object.keys(textSizes) as JournalTextSize[]).map((id) => ({ id, label: textSizes[id].label }))}
              value={s.journalPageStyle.size}
              onChange={(id) => s.setJournalPageStyle({ size: id })}
            />
            <ToggleRow label="Prompts" explain="A lightbulb on the page offers something to write about" value={s.journalPrompts} onChange={(on) => s.set('journalPrompts', on)} />
            <ToggleRow label='"On this day"' explain="Shows what you wrote on this date in past years" value={s.journalOnThisDay} onChange={(on) => s.set('journalOnThisDay', on)} />
          </Group>
          <JournalLockGroup openPin={openPin} />
        </>
      );
    case 'moodCheck':
      return (
        <>
        <Group title="Checking in" footer="Turning a step off skips it. You can always add more later from the entry.">
          <ToggleRow label="Ask for intensity" explain="How strong it is, from 1 to 5" value={s.feelingsAskIntensity} onChange={(on) => s.set('feelingsAskIntensity', on)} />
          <ToggleRow label="Allow two feelings" explain="Offer a second word after the first" value={s.feelingsTwoWords} onChange={(on) => s.set('feelingsTwoWords', on)} />
          <ToggleRow label="Reason tags" explain="What it's connected to: work, sleep, people..." value={s.feelingsReasonTags} onChange={(on) => s.set('feelingsReasonTags', on)} />
          <ChoiceRow<PatternsView>
            label="Patterns opens on"
            explain="The period Patterns shows first"
            options={[
              { id: 'week', label: 'Week' },
              { id: 'month', label: 'Month' },
              { id: 'year', label: 'Year' },
            ]}
            value={s.feelingsPatternsDefault}
            onChange={(id) => s.set('feelingsPatternsDefault', id)}
          />
        </Group>
        <Group title="Your reason tags" footer="Removing a tag takes it off the list. Entries that already use it keep it.">
          {customTags.length === 0 ? (
            <Caption style={styles.pad}>You haven't added any tags of your own yet. Add one while logging a feeling.</Caption>
          ) : (
            customTags.map((tag) => (
              <View key={tag} style={styles.tagRow}>
                <Body style={styles.flex}>{tag}</Body>
                <Pressable
                  hitSlop={8}
                  accessibilityLabel={`Remove tag ${tag}`}
                  onPress={() => requestDelete({ message: `Remove "${tag}" from your tags?`, perform: () => removeTag(tag) })}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.inkSoft} />
                </Pressable>
              </View>
            ))
          )}
        </Group>
        </>
      );
    case 'habitBuilder':
      return (
        <Group title="Feelings" footer={`"Ask sometimes" only asks when you haven't noted a feeling for that habit in the last few days. Either way, the sheet can always be skipped.`}>
          <ChoiceRow<FeelingAsk>
            label='Ask "How do you feel?" after a habit is done'
            explain="It goes into your Feelings log, tagged with the habit's name"
            options={FEELING_ASK_OPTIONS}
            value={s.habitFeelingAsk}
            onChange={(id) => s.set('habitFeelingAsk', id)}
          />
        </Group>
      );
    case 'skills':
      return (
        <Group title="Feelings" footer={`"Ask sometimes" only asks when you haven't noted a feeling for that skill in the last few days. Either way, the sheet can always be skipped.`}>
          <ChoiceRow<FeelingAsk>
            label='Ask "How do you feel?" after a practice session'
            explain="It goes into your Feelings log, tagged with the skill's name"
            options={FEELING_ASK_OPTIONS}
            value={s.skillFeelingAsk}
            onChange={(id) => s.set('skillFeelingAsk', id)}
          />
        </Group>
      );
    case 'quitHabit':
      return (
        <>
          <Group>
            <ChoiceRow
              label="Urge timer length"
              explain="How long the urge-surfing timer starts at"
              options={[5, 10, 15, 20].map((m) => ({ id: m, label: `${m} min` }))}
              value={s.quitUrgeMinutes}
              onChange={(id) => s.set('quitUrgeMinutes', id)}
            />
          </Group>
          <Group title="Feelings" footer="Off by default. When on, it's a gentle offer at the end, never a step you have to go through. You can always note a feeling from the journey page.">
            <ChoiceRow<FeelingAsk>
              label="Offer to note a feeling after an urge or a slip"
              explain="It goes into your Feelings log, tagged with the habit's name"
              options={FEELING_ASK_OPTIONS}
              value={s.quitFeelingAsk}
              onChange={(id) => s.set('quitFeelingAsk', id)}
            />
          </Group>
        </>
      );
    case 'budget':
      return (
        <Group>
          <ChoiceRow
            label="Default currency"
            explain="Pre-selected when you make a new budget"
            options={currencies.map((c) => ({ id: c.code, label: c.code }))}
            value={s.budgetCurrency}
            onChange={(id) => s.set('budgetCurrency', id)}
          />
          <ChoiceRow
            label="Warn me at"
            explain="How close to a spending limit before it's highlighted"
            options={([80, 90, 100] as const).map((p) => ({ id: p, label: `${p}%` }))}
            value={s.budgetWarnAt}
            onChange={(id) => s.set('budgetWarnAt', id)}
          />
        </Group>
      );
    case 'studySession':
      return (
        <>
          <Group title="Timer">
            <ChoiceRow
              label="Default timer"
              explain="Which preset a new session starts with"
              options={studyPresets.map((p) => ({ id: p.id, label: `${p.name} ${p.focusMinutes}/${p.breakMinutes}` }))}
              value={s.studyDefaultPreset}
              onChange={(id) => s.set('studyDefaultPreset', id)}
            />
          </Group>
          <StudySoundSettings />
        </>
      );
    case 'sleep':
      return (
        <>
          <SleepSoundSettings />
          <Group title="Reminders">
            <NavRow label="Bedtime reminder and gentle wake" explain="Set the times in Sleep. Turn them on or off here." onPress={() => go('notifications')} />
          </Group>
        </>
      );
    case 'book':
      return (
        <Group>
          <ChoiceRow
            label="Track progress by"
            explain="Pages asks where you started and stopped. Percent uses quick ±10% buttons."
            options={[
              { id: 'pages', label: 'Pages' },
              { id: 'percent', label: 'Percent' },
            ]}
            value={s.bookTrackBy}
            onChange={(id) => s.set('bookTrackBy', id)}
          />
          <ToggleRow label="Estimated time left" explain="Based on your reading pace, once you've logged a couple of sessions" value={s.bookShowEstimate} onChange={(on) => s.set('bookShowEstimate', on)} />
          <ToggleRow
            label="Feeling after a session"
            explain='Ask "How did that reading feel?" after you log pages'
            value={s.bookFeelingAfterSession}
            onChange={(on) => s.set('bookFeelingAfterSession', on)}
          />
        </Group>
      );
    case 'recap':
      return (
        <>
          <Group title="Choose what Recap shows" footer="A hidden section disappears from every card, chart and story, including anything you share.">
            {RECAP_SECTIONS.map((id) => (
              <ToggleRow key={id} label={sectionTitle(id)} explain="" value={!s.hiddenRecapSections.includes(id)} onChange={() => s.toggleRecapSection(id)} />
            ))}
          </Group>
          <Group title="Privacy on this phone" footer="Recap is private to this phone. Feelings and Quit stay out of anything you share unless you include them.">
            <ToggleRow
              label="Hide sensitive areas on Home"
              explain="Feelings and Quit don't appear on Home, for when you share your phone"
              value={s.hideSensitiveOnHome}
              onChange={(on) => s.set('hideSensitiveOnHome', on)}
            />
          </Group>
          <Group title="Story and comparisons">
            <ToggleRow
              label="Compare with the previous period"
              explain='Shows a neutral "+3 vs last week" under each number'
              value={s.recapComparison}
              onChange={(on) => s.set('recapComparison', on)}
            />
            <ToggleRow
              label="Include Feelings and Quit cards when I share"
              explain="Off by default, so shared images leave them out"
              value={s.shareSensitiveInRecap}
              onChange={(on) => s.set('shareSensitiveInRecap', on)}
            />
            <ToggleRow
              label="Weekly story notification"
              explain="On the evening of the first day of your week"
              value={s.notify.weeklyStory}
              onChange={(on) => {
                s.setNotify('weeklyStory', on);
                void resyncFeature('weeklyStory');
              }}
            />
          </Group>
        </>
      );
  }
}

export function sectionSettingsTitle(id: SettingsSectionId): string {
  return sectionTitle(id);
}

const styles = themedStyles(() => ({
  block: { paddingVertical: spacing.sm + 2, gap: 2 },
  swatches: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  swatch: { width: 36, height: 36, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: colors.ink },
  pad: { paddingVertical: spacing.sm },
  tagRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm },
  flex: { flex: 1 },
}));
