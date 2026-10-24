import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import { Body, Caption } from '../../components/Typography';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TimePickerModal } from '../../components/TimePickerModal';
import { useUi } from '../../components/UiProvider';
import { useSettingsStore, type NotificationFeature } from '../../store/useSettingsStore';
import { alarmSoundOptions } from '../../data/alarmSounds';
import { playAlarmPreview } from '../../utils/alarmPreview';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendTestNotification,
  type PermissionState,
} from '../../utils/notifications';
import { resyncAllReminders, resyncFeature } from '../../utils/reminders';
import { spacing } from '../../theme';
import { formatClockTime } from '../../utils/date';
import { themedStyles } from '../../theme/runtime';
import { ChoiceRow, Group, NavRow, Notice, ToggleRow } from './SettingsParts';
import { PHONE_CLOCK_NOTE, REMINDER_SOUND, TROUBLESHOOTING } from '../../config/reminderWording';

const FEATURES: { id: NotificationFeature; label: string; explain: string }[] = [
  { id: 'tasks', label: 'Daily task reminders', explain: 'Reminders you set on tasks in Daily Planning' },
  { id: 'habits', label: 'Habit and practice reminders', explain: 'Cue reminders for Build habits and Skills' },
  { id: 'studyEnd', label: 'Study session end', explain: 'When a focus block or break ends, even if your phone is locked' },
  { id: 'sleep', label: 'Bedtime and wake-up reminders', explain: 'The ones you set up in Sleep' },
  { id: 'weeklyStory', label: 'Weekly "Your week in Ona" story', explain: 'Evening of the first day of your week' },
];

function useNotificationPermission() {
  const [perm, setPerm] = useState<{ state: PermissionState; canAskAgain: boolean } | null>(null);
  const refresh = useCallback(() => {
    void getNotificationPermission().then(setPerm);
  }, []);
  useEffect(() => {
    refresh();
    // Coming back from the system settings.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);
  return { perm, refresh };
}

function openAndroidSettings(action: string) {
  Linking.sendIntent(action).catch(() => Linking.openSettings());
}

export function NotificationsPage() {
  const notify = useSettingsStore((s) => s.notify);
  const setNotify = useSettingsStore((s) => s.setNotify);
  const defaultAlarmSound = useSettingsStore((s) => s.defaultAlarmSound);
  const set = useSettingsStore((s) => s.set);
  const quiet = useSettingsStore((s) => s.quietHours);
  const setQuietHours = useSettingsStore((s) => s.setQuietHours);
  const { showToast } = useUi();
  const { perm, refresh } = useNotificationPermission();
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);

  const toggleFeature = async (id: NotificationFeature, on: boolean) => {
    setNotify(id, on);
    if (on && perm?.state !== 'granted' && perm?.state !== 'unsupported') {
      await requestNotificationPermission();
      refresh();
    }
    await resyncFeature(id);
  };

  const changeQuiet = (patch: Partial<typeof quiet>) => {
    setQuietHours(patch);
    void resyncAllReminders();
  };

  const test = async () => {
    const ok = await sendTestNotification();
    refresh();
    showToast({ message: ok ? 'Test notification sent.' : perm?.state === 'unsupported' ? "Notifications aren't available here." : "Couldn't send. Check that notifications are allowed." });
  };

  const denied = perm?.state === 'denied';

  return (
    <>
      <Group title="Permission">
        {perm?.state === 'unsupported' ? (
          <Notice>
            <Caption>Notifications aren't available here (the web preview or Expo Go on Android). Use a device build to test them.</Caption>
          </Notice>
        ) : denied ? (
          <Notice tone="warn">
            <Body>Notifications are turned off for Ona</Body>
            <Caption>Your reminders can't arrive until you allow them in your phone's settings.</Caption>
            <PrimaryButton label="Open phone settings" variant="outline" onPress={() => void Linking.openSettings()} style={styles.noticeButton} />
          </Notice>
        ) : (
          <View style={styles.permRow}>
            <Caption>{perm?.state === 'granted' ? 'Allowed. Only the reminders you turn on below are ever sent.' : "Not asked yet. Ona asks the first time you turn a reminder on."}</Caption>
          </View>
        )}
      </Group>

      <Group title="What can notify you" footer="Ona never sends engagement or 'we miss you' notifications. Nothing arrives unless you turned it on.">
        {FEATURES.map((f) => (
          <ToggleRow key={f.id} label={f.label} explain={f.explain} value={notify[f.id]} onChange={(on) => void toggleFeature(f.id, on)} />
        ))}
      </Group>

      <Group title={REMINDER_SOUND.groupTitle} footer={`Each task and the wake-up reminder can still pick their own. ${PHONE_CLOCK_NOTE}`}>
        <ChoiceRow
          label={REMINDER_SOUND.settingLabel}
          explain={REMINDER_SOUND.settingExplain}
          options={alarmSoundOptions.map((o) => ({ id: o.id, label: o.label }))}
          value={defaultAlarmSound}
          onChange={(id) => {
            set('defaultAlarmSound', id);
            playAlarmPreview(id);
            // Every reminder that uses the default (tasks, habits, skills, Sleep).
            void resyncAllReminders();
          }}
        />
      </Group>

      <Group title="Quiet hours">
        <ToggleRow label="Quiet hours" explain="Optional reminders wait until quiet hours end" value={quiet.enabled} onChange={(on) => changeQuiet({ enabled: on })} />
        {quiet.enabled && (
          <>
            <NavRow label="Starts" value={formatClockTime(quiet.start)} onPress={() => setPicking('start')} />
            <NavRow label="Ends" value={formatClockTime(quiet.end)} onPress={() => setPicking('end')} />
            <ToggleRow
              label="Include reminders I set"
              explain="Off: task reminders, the wake-up reminder and study timers still sound"
              value={quiet.includeAlarms}
              onChange={(on) => changeQuiet({ includeAlarms: on })}
            />
          </>
        )}
      </Group>

      <Group title="Reminders late or silent?">
        <Caption style={styles.help}>{Platform.OS === 'android' ? TROUBLESHOOTING.android : TROUBLESHOOTING.ios}</Caption>
        {Platform.OS === 'android' && (
          <>
            <NavRow label="Allow exact reminders" explain="Android calls this Alarms & reminders" external onPress={() => openAndroidSettings('android.settings.REQUEST_SCHEDULE_EXACT_ALARM')} />
            <NavRow label="Battery optimization" external onPress={() => openAndroidSettings('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS')} />
          </>
        )}
        <NavRow label="Notification settings" external onPress={() => void Linking.openSettings()} />
      </Group>

      <Group>
        <NavRow icon="notifications-outline" label="Send test notification" explain="Arrives right away, with your default reminder sound" onPress={() => void test()} />
      </Group>

      <TimePickerModal
        visible={picking !== null}
        value={picking === 'start' ? quiet.start : quiet.end}
        title={picking === 'start' ? 'Quiet hours start' : 'Quiet hours end'}
        onClose={() => setPicking(null)}
        onPick={(time) => {
          // "No time" isn't meaningful here; quiet hours always have both ends.
          if (time) changeQuiet(picking === 'start' ? { start: time } : { end: time });
        }}
      />
    </>
  );
}

const styles = themedStyles(() => ({
  permRow: { paddingVertical: spacing.sm },
  noticeButton: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  help: { paddingVertical: spacing.sm },
}));
