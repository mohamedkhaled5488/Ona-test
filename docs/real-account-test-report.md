# Real-system test report

Failures found by testing against real systems instead of mocks: the Android emulator (Maestro plus `dumpsys`, in the E2E job) and a real Supabase backend (the local stack in CI; the staging project nightly once it's set up, see `docs/building.md`). Each was reproduced, fixed at its root, and covered by a test at the lowest level that catches it, with the journey test kept. Harness mistakes (the tests were wrong, not Ona) and product questions are listed separately at the end.

## Bugs in Ona

| ID | Area | Severity | Steps | Root cause | Fix | Test added | Why earlier tests missed it |
|---|---|---|---|---|---|---|---|
| RA-01 | Sleep | High | White noise, 1-minute timer; leave the Sleep screen (or lock the phone); wait | The countdown lived in the Sleep screen and counted JS ticks (`src/screens/SleepScreen.tsx`, old `SoundMixerCard` interval): leaving unmounted it; locked, JS timers pause | One session started with the app (`src/audio/sleepSession.ts`): an end time on the steady clock, checked on every player status report, app-state change and second | SLEEP-001..015; E2E sleep check (lock, background, swipe, call, second sound, leave): all pass; on the old build "leave" **fails** (still playing 16 min into a 15-min timer) | Jest mocks the native player and never suspends JS timers; no case left the screen with the timer running |
| RA-02 | Sleep | High | Play all night with the phone locked | Ona never set a lock-screen player, and Android stops background audio after about 3 minutes without one (expo-audio 57 docs, `shouldPlayInBackground`) (`src/utils/audioEngine.ts`) | The first Sleep player becomes the lock-screen player (exclusive audio) and is cleared on stop with its notification | SLEEP-013; E2E lock and background cases | The mock had no lock-screen API; no test played for more than a few seconds on a device |
| RA-03 | Sleep | Medium | Play, then swipe Ona away from recent apps | expo-audio's playback service (owner of the media session and notification) outlived Ona's task; the module's teardown stops the players only (`node_modules/expo-audio/.../AudioModule.kt` `OnDestroy`, `AudioControlsService` without `stopWithTask`) | Config plugin `plugins/withAudioServiceStopsWithTask.js`: the service stops with the task (checked in the generated manifest: expo-audio's declaration plus `stopWithTask`) | SLEEP-SWIPE-001..003; E2E swipe case: notification gone | Only visible on a real Android system; the first emulator run showed "notification STILL SHOWN" |
| RA-04 | Sync | High | Apply 0009; a newer phone writes a row; the installed APK (3f74086) edits it | An upsert keeps columns the request doesn't send: the old APK (no `base_rev`) inherited the stored `base_rev` and its write was refused without it knowing (`supabase/migrations/0009_sync_revisions.sql`) | The trigger reads `base_rev` and never keeps it | BE-SYNC-012 (the APK's exact queries, both ways) | Every test used the new client; none mixed app versions |
| RA-05 | Sync | High (caught before release) | Two phones edit the same journal entry with 0009 | The first fix cleared `base_rev` in the insert step, and an upsert's ON CONFLICT update reads the row as that step left it: every stale write was accepted | Cleared on insert only for a row that doesn't exist yet | BE-SYNC-009..011 caught it in CI on e77b99b | — (caught) |
| RA-06 | CI | Medium (process) | Push after 2026-10-20 | A per-batch upload check added with FIX-16 read app state the server-only tests don't have; the backend job was red for days and nobody looked | The check is a parameter in those tests; tester builds now require green CI, E2E and staging (`scripts/require-green-ci.js`) | GATE-001..005 | CI wasn't watched; nothing blocked a build on red |

## Real-backend results (local Supabase in CI; staging nightly)

| ID | What | Result |
|---|---|---|
| BE-REAL-001 | Eight weeks of every section up through the app, back to a fresh phone | Pass: 588 items in 38 collections, identical, ~0.6 s |
| BE-REAL-002 | Recap on the restored phone | Pass: every section, Quit included |
| BE-REAL-003 | Plan states from the server's dates (day 1, mid, ended, Plus) | Pass |
| BE-REAL-004 | Trial ended: downloads work, the server refuses uploads | Pass |
| BE-REAL-005..009 | Two phones (edits and deletes everywhere), offline then online, consent off, a restore failing halfway, about a year of data (time and memory) | Added; results from the next CI run |
| Bundle scan (E2E) | No server key in the APK's JavaScript bundle | Added |

## Harness mistakes (the tests were wrong, not Ona)

- The emulator ran with `-noaudio`; turned on.
- The playback check looked up Ona's uid with `userId=`; Android 14 prints `appId=`, so nothing matched and every case read "inconclusive". Now matched by process id; inconclusive fails the run.
- "Leave Sleep" tapped a tab that the Sleep screen covers; now Back, confirmed by the Reflect page.
- The start flow ran both branches (the "Custom" chip becomes "1m" once set), so every new-build case had a 15-minute timer; now branched on "All night".
- An idle media session that expo-audio leaves registered after a player is removed was counted as "still active"; only a PLAYING session fails now.
- The real-account tests loaded data before the phone's first sync, so the one-tap Continue question waited; and they compared JSON with key order (Postgres keeps its own).

## For your decision

- expo-audio leaves an idle media session registered (state NONE, no notification, nothing playing) after a player is removed. Nothing a person sees; a headset button might still be routed to Ona until it closes. Accept, or patch expo-audio?
- The notification keeps Play/Pause (decided 2026-10-25; no Stop without patching expo-audio).
