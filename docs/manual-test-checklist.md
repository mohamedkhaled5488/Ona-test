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

## 3. Notifications and alarms

| ID | Check | How | Expected | A | B | Notes |
|---|---|---|---|---|---|---|
| MAN-020 | Permission | Set the first reminder | Android asks once; denying keeps Ona working and explains how to turn it on | | | |
| MAN-021 | Task reminder | Task at a time 2 minutes away, reminder at the time | Rings on time with the chosen sound, also with the screen off | | | |
| MAN-022 | Each alarm sound | Try chime, ping, ascend | Each plays as named; volume follows the phone's alarm volume | | | |
| MAN-023 | Edit and delete | Change the task's time; then delete the task | The old reminder never rings; none rings after deleting | | | |
| MAN-024 | Habit reminder | Set one for 2 minutes away | Rings once; tapping it opens that habit | | | |
| MAN-025 | After restart | Restart the phone | Future reminders still ring | | | |

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

## Sign-off

| Release candidate | Result | Open failures | Signed off by | Date |
|---|---|---|---|---|
| | | | | |
