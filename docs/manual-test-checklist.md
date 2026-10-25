# Ona: manual checklist on real phones

For what automated tests can't judge: how it feels, how fast it is, and how it sounds. Do one pass per release candidate, on at least **two Android versions** (for example Android 10 and Android 14 or later) and **two screen sizes** (a small phone and a large one).

For each row, record Pass / Fail, the device, the build number (Settings → About) and anything you noticed. A failure gets an ID (MAN-xxx) and goes into `docs/audit-report.md`.

**Devices in this pass**

| | Device | Android version | Screen | Build number | Tester | Date |
|---|---|---|---|---|---|---|
| A | | | | | | |
| B | | | | | | |

## 1. Install and first run

| ID | Check | How | Expected | A | B | Notes |
|---|---|---|---|---|---|---|
| MAN-001 | Installs | Install the APK from the link | Installs without "App not installed" (also on Huawei) | | | |
| MAN-002 | First screen | Open Ona | The welcome screen shows within about 2 seconds, with no flash of another screen | | | |
| MAN-003 | No account | Start using Ona | Home opens; nothing asks for an account, a card or permissions | | | |
| MAN-004 | Tour and demo | Take a 5-minute tour; Explore with sample data; leave the demo | Both work; leaving the demo returns to your own empty Ona, unchanged | | | |
| MAN-005 | Relaunch | Close Ona from recent apps and open it again | Opens where you'd expect; the welcome screen doesn't come back | | | |

## 2. Account and sync (needs a second phone, B)

| ID | Check | How | Expected | A | B | Notes |
|---|---|---|---|---|---|---|
| MAN-010 | Create account | Settings → Account & Subscription → Create account to sync | Clear consent boxes, none pre-ticked; confirmation email arrives | | | |
| MAN-011 | Google sign-in | Continue with Google | Works first time; cancelling shows no error | | | |
| MAN-012 | Second phone | Sign in on B with the same account | Data from A appears on B within a minute or after Sync now | | | |
| MAN-013 | Both ways | Add a task on B; open A | It appears on A; its reminder rings on both phones only if set on each | | | |
| MAN-014 | Same item on both | Turn on airplane mode on both; edit the same task differently; turn it off on both | Both end up the same; nothing duplicated or lost (see AUD-05) | | | |
| MAN-015 | Sign out | Sign out on B | Data stays on B; sync stops | | | |
| MAN-016 | Delete account | Settings → Privacy, Security & Data → Delete my account | Asks clearly, deletes; the account can't sign in again | | | |
| MAN-017 | Merge screen | On B, signed out, add 2 journal entries; sign in to the account from A | Asked with both counts; Merge puts everything on both phones; nothing synced before you answer | | | |
| MAN-018 | Keep separate | As MAN-017, choose Keep this phone's data separate; later sign out with Remove | B shows the account's data; after sign-out, B's own 2 entries are back; they never reached the account | | | |
| MAN-019 | Two people, one phone | Sign out of account 1 keeping data; sign in with account 2 | Asked about the other account's data; Keep separate (default) shows only account 2's data; Privacy → Other data on this phone lists account 1's copy | | | |
| MAN-019b | Sign out with unsent changes | Airplane mode, add an entry, turn airplane mode off and sign out at once | Told 1 change isn't in the account and offered Sync now; Remove is only offered once everything is synced | | | |

## 3. Notifications and alarms

| ID | Check | How | Expected | A | B | Notes |
|---|---|---|---|---|---|---|
| MAN-020 | Permission | Set the first reminder | Android asks once; denying keeps Ona working and explains how to turn it on | | | |
| MAN-021 | Task reminder | Task at a time 2 minutes away, reminder at the time | Arrives on time and plays the chosen sound once, also with the screen off | | | |
| MAN-022 | Each reminder sound | In Settings → Notifications & Reminders, tap Default, Chime, Ping, Ascend | Each previews as named; the reminder plays the one chosen, at the alarm volume (Android) | | | |
| MAN-023 | Edit and delete | Change the task's time; then delete the task | The old reminder never arrives; none arrives after deleting | | | |
| MAN-024 | Habit reminder | Set one for 2 minutes away | Arrives once; tapping it opens that habit | | | |
| MAN-025 | After restart | Restart the phone | Future reminders still arrive | | | |
| MAN-026 | Wake-up reminder: locked phone | Sleep → Wake-up reminder 2 minutes away, sound Chime; lock the phone | Arrives on time with Chime, once. Nothing claims it rings until dismissed | | | |
| MAN-027 | Wake-up reminder: Ona closed | As above, then swipe Ona away from recent apps | Still arrives with its sound | | | |
| MAN-028 | Silent mode | Ringer on silent (Android) / silent switch on (iPhone) | Android: still heard (alarm volume). iPhone: silent, as the troubleshooting text says | | | |
| MAN-029 | Do Not Disturb / Focus | Turn on Do Not Disturb or a Focus | Behaves as the phone's settings decide; the troubleshooting text says so | | | |
| MAN-030a | Exact reminders (Android 12+) | Settings → Notifications & Reminders → Allow exact reminders | Ona is listed under "Alarms & reminders"; with it on, reminders arrive on the minute | | | |
| MAN-030b | Upgrade from an older version (Android) | Install over an older APK with reminders set | Every reminder still arrives, with its sound (the one-time channel move) | | | |

## 4. Sound (Sleep and Study)

| ID | Check | How | Expected | A | B | Notes |
|---|---|---|---|---|---|---|
| MAN-030 | White, pink, brown noise | Play each in Sleep for 2 minutes | Loops with no gap or click at the loop point | | | |
| MAN-031 | Mix | Play two sounds; change each volume | Both audible; volumes change smoothly | | | |
| MAN-032 | Stop | Stop | Silence at once; nothing keeps playing | | | |
| MAN-033 | Sleep timer | 5-minute timer with fade | Fades out over the last part and stops; the phone can sleep | | | |
| MAN-034 | Study and Sleep together | Sleep rain playing; start and end a study session with rain | Sleep's rain keeps playing (FIX-09) | | | |
| MAN-035 | Interruptions | Get a phone call while a sound plays; play music in another app | Ona pauses or ducks for the call and comes back sensibly; no two sounds fighting | | | |
| MAN-036 | Headphones | Unplug or disconnect headphones mid-sound | Sound stops instead of blasting from the speaker | | | |

## 5. Timers in the background

| ID | Check | How | Expected | A | B | Notes |
|---|---|---|---|---|---|---|
| MAN-040 | Study timer | Start a 25-minute focus session; lock the phone for 10 minutes | On return the time is right; the end alert comes on time | | | |
| MAN-041 | Quit "ride it out" | Start the timer; switch apps; come back | The countdown is right | | | |
| MAN-042 | Task timer | Start a task; close Ona; reopen later | Still timing, with the right elapsed time | | | |

## 6. Feel and layout

| ID | Check | How | Expected | A | B | Notes |
|---|---|---|---|---|---|---|
| MAN-050 | Graph | Identify the Feeling → graph with a few weeks of data (or the demo); pinch and pan | Smooth; stays in range; no jumps; labels readable | | | |
| MAN-051 | Calendars | Open Habits and Daily Planning calendars in the demo | Every day cell is drawn correctly the first time (no need to change month) | | | |
| MAN-052 | Keyboard | Type in every form (task, journal, budget, meal, habit, quit) | The field being typed in is never hidden by the keyboard; Save is reachable | | | |
| MAN-053 | Back | Press Back while editing with unsaved changes | Asks before throwing anything away | | | |
| MAN-054 | Dark theme | Switch the phone to dark mode | Every screen readable; no white flashes; amber only where meant | | | |
| MAN-055 | Large text | Set the phone's font size and display size to the largest | Nothing cut off or overlapping; numbers in tiles stay centred | | | |
| MAN-056 | TalkBack | Turn on TalkBack; use Daily Planning and Journaling | Every button says what it does; ticking a task is announced | | | |
| MAN-057 | Arabic | Type Arabic in a journal entry, a task and a budget name; use Arabic digits in amounts | Shown right-to-left correctly; amounts accepted (FIX-03) | | | |
| MAN-058 | Small screen | Repeat a few screens on the smaller phone | Nothing needs sideways scrolling; buttons are big enough to tap | | | |

## 7. Offline and data safety

| ID | Check | How | Expected | A | B | Notes |
|---|---|---|---|---|---|---|
| MAN-060 | Airplane mode | Use every section for a few minutes offline | Everything works; nothing shows a scary error; Book search says it needs a connection | | | |
| MAN-061 | Killed mid-save | Type a journal entry; swipe Ona away immediately after Save | The entry is there after reopening | | | |
| MAN-062 | Low storage | Use Ona with the phone nearly full | Saving still works, or says clearly why not | | | |
| MAN-063 | Journal lock | Turn on the journal PIN; leave Ona for a minute; come back | Journaling asks for the PIN or fingerprint again | | | |
| MAN-064 | Export | Settings → export my data; open the file | Contains your data, readable | | | |

## 8. Speed and battery

| ID | Check | How | Expected | A | B | Notes |
|---|---|---|---|---|---|---|
| MAN-070 | Cold start | Open Ona after a restart | Usable within about 3 seconds on the slower phone | | | |
| MAN-071 | Big history | In the demo, scroll long lists (feelings log, tasks, habits) | Smooth scrolling, no stalls | | | |
| MAN-072 | Battery | Use Ona normally for a day, plus one hour of Sleep sounds with the screen off | Battery use looks normal in Android's battery settings; Ona isn't listed as draining in the background | | | |
| MAN-073 | Warmth | One hour of Sleep sounds | The phone doesn't get noticeably warm | | | |

## 9. The three reported problems, and the plans

Do these on the new build after installing it **over** the previous APK (to check the move of old reminders), then once on a fresh install. For the plan rows, Ona without an account is in Essentials mode; a new account is in the Plus trial.

| ID | Check | How | Expected | A | B | Notes |
|---|---|---|---|---|---|---|
| MAN-080 | Wake-up reminder sound (FIX-18) | Sleep → Wake-up reminder 2 minutes away; pick each sound and tap its preview; lock the phone | The preview and the reminder play the sound chosen, at the alarm volume. The screen says "Wake-up reminder" and "For important wake-ups, use your phone's clock."; no "alarm", no fade-in | | | |
| MAN-081 | Reminders kept after the update (FIX-18) | Before installing the new build, set a task reminder and a wake-up reminder for later today; install over it | Both still arrive, now with their chosen sound | | | |
| MAN-082 | Exact timing (FIX-18) | Android 12+: phone Settings → Apps → Special access → Alarms & reminders | Ona is listed; with it off, reminders still arrive (maybe a little late) | | | |
| MAN-083 | Changing the default sound (FIX-18) | Set two task reminders on the default sound; change the default sound in Settings | Both reminders arrive with the new sound | | | |
| MAN-084 | Quit in Recap (FIX-19) | Start a Quit journey; ride out one urge; open Home → Recap → this week | Quit shows days on the journey and urges ridden out; a slip reads "a new chapter" | | | |
| MAN-085 | Every section in Recap (FIX-19) | Add one thing in Budget, Songwriting, Mind Games and Catch a Thought; open Recap | Each appears with its own tile; no "best", "most" or "busiest" anywhere | | | |
| MAN-086 | Hide sensitive areas (FIX-19) | Settings → Hide sensitive areas on Home; then share a Recap story | Feelings and Quit are off Home and out of the story; still in their own sections | | | |
| MAN-087 | Feelings from every section (FIX-20) | Log a feeling from a task, a habit, a skill session, Quit, a journal entry and Identify the Feeling | All six show in the feelings log, the graph, Analysis and Recap, with where they came from | | | |
| MAN-088 | Feelings survive a reinstall (FIX-17, FIX-20) | Signed in: do MAN-087, close Ona, wait 10 s, uninstall, reinstall, sign in | All six feelings come back without tapping Sync now | | | |
| MAN-089 | Essentials mode: over a cap (FIX-21) | No account: create 3 habits; tap Build a new habit | A calm explanation with "Not now" and "See Plus"; the 3 habits open and edit normally | | | |
| MAN-090 | Essentials mode: locked features (FIX-21) | No account: open Recap observations, Planning insights, a Feelings pattern card, a PDF export | Each shows a titled card or dialog with one line and "See Plus"; no blurred numbers, no countdown | | | |
| MAN-091 | Diet horizon (FIX-21) | No account: plan a meal next week, then the week after, then last week | Next week and last week work; the week after explains "plans up to next week" | | | |
| MAN-092 | Names (FIX-22) | Settings → Plan & usage, Account; signed in during the trial, then signed out | "Plus trial, N days left. All features on." / "Essentials mode. Your data is safe on this phone."; never "free version", "expired", "downgrade" or "limited" | | | |
| MAN-093 | Never limited (FIX-21) | No account: add 3 Quit habits; open support resources; export my data | All work, with no mention of Plus | | | |
| MAN-094 | Backup status row | Settings → Account & Subscription: signed in and synced; then airplane mode and add an entry; then pause sync | "Backed up, last synced …"; then "Offline: 1 change … isn't in your account yet"; then "Sync paused"; never "Backed up" while a change waits. Choice sheet readable with the largest text | | | |
| MAN-095 | Killed mid-step | Sign in with data on the phone and in the account; choose Keep separate and immediately swipe Ona away; reopen | Either the choice is asked again with the phone's data intact, or it's done and the copy is listed in Privacy → Other data on this phone; nothing missing | | | |
| MAN-096 | Craving on a phone | Quit → I'm craving it; rate 7; Breathe; lock the phone 4 min; unlock and open Ona | "Riding it out" shows about 4 minutes; Try something else keeps the timer; It passed counts one urge ridden out; nothing flashes, no sound unless chosen | | | |
| MAN-097 | A hard day | Quit → I had a hard day → Continue → tag one reason → Mark this hard day | "Slips happen" with no blame; "Day N of your journey carries on"; the journey still shows the same Track; Support lines open the support page; the headline after: "Day N of your journey", "Current run: 0 days" | | | |
| MAN-098 | Small screen, largest text | On the smaller phone, set font size and display size to the largest; open: the sign-in choice sheet (sign in with data on the phone and in the account), Sign out (both dialogs), Settings → Account (status row), Privacy → Other data on this phone, Quit → I'm craving it (rating chips, Riding it out, Try something else / I'm okay now), and I had a hard day | Every option, count and button readable without overlap; nothing cut off; the 0–10 chips wrap and stay tappable; the timer line stays on one screen with the tools; Decide later reachable | | | |
| MAN-099 | Killed by the system mid-step | Developer options → "Don't keep activities" on, or `adb shell am kill app.ona` after pressing Home. Do it (a) right after choosing Keep separate, (b) after Bring it back in Other data on this phone, (c) after Sign out → Remove my data, (d) in the middle of a craving; reopen each time | (a)–(c): either asked again with nothing missing, or done, with the copy listed where it should be; never a half-empty phone; (d): "Riding it out: …, Continue" with the right time; nothing counted twice | | | |
| MAN-100 | Sleep timer, locked | Sleep → White noise → 15 min (or Custom 2 min) → Play; lock the phone; wait past the end | Silent at the end; a quieter last 30 s (may step down while locked); no media notification left; nothing starts again when you unlock | | | |
| MAN-101 | Sleep timer, swiped away | As MAN-100, then swipe Ona away from recent apps | Silent at the end (or as soon as Ona is gone); no notification left | | | |
| MAN-102 | Sleep timer, a call | As MAN-100; call the phone mid-timer, hang up | The sound pauses for the call; after the end it never comes back | | | |
| MAN-103 | Sleep timer, changes | Mid-timer: add a second sound; +15 min; No timer; leave Sleep and open Study and start its sound | "Stops in" moves by 15 min; No timer plays on; Study's sound replaces Sleep's with a short notice; both layers stop together at the end | | | |
| MAN-104 | Sleep timer, all night | All night, lock the phone for 30 minutes | Still playing after 30 minutes (Android used to cut background audio after about 3); the media notification is there while it plays | | | |

## Sign-off

| Release candidate | Result | Open failures | Signed off by | Date |
|---|---|---|---|---|
| | | | | |
