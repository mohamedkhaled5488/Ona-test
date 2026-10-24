// What Ona says about its reminders, in one place. Ona's reminders are
// notifications: they play their sound once, at the time you set, and the
// phone decides the rest (silent mode, Do Not Disturb, Focus, battery
// saving). They are never called alarms, and nothing claims to ring until
// dismissed or to fade in.
export const PHONE_CLOCK_NOTE = "For important wake-ups, use your phone's clock.";

export const WAKE_REMINDER = {
  title: 'Wake-up reminder',
  hint: 'A gentle notification at the time you choose, with the sound you pick.',
  set: 'Set reminder',
  change: 'Change',
  turnOff: 'Turn off reminder',
  repeats: 'Every day',
  off: 'Off',
  notSet: 'Not set',
  soundLabel: 'Sound',
};

export const REMINDER_SOUND = {
  settingLabel: 'Default reminder sound',
  settingExplain: 'Tap one to hear it. Used by task, plan, habit and Sleep reminders unless you pick another.',
  groupTitle: 'Reminder sound',
};

// Settings → Notifications → "Reminders arriving late or silent?"
export const TROUBLESHOOTING = {
  android:
    "Ona's reminders play once on your phone's alarm volume. If one arrives late, allow exact reminders and turn off battery optimization for Ona. If one is silent, check the alarm volume and Do Not Disturb.",
  ios: "Ona's reminders play their sound once. The silent switch, Focus and Do Not Disturb can silence them; check them if a reminder is quiet.",
};
