# Test cases: end to end (Stage 6)

Real taps through the five core journeys on an Android emulator, with [Maestro](https://maestro.dev). The flows are in `.maestro/`.

**Status: written, not yet run on an emulator.** Every text and id the flows tap or wait for is checked against the app's source on each `npm test` (`maestroFlows.test.ts`), so a renamed label fails right away. Whether each step behaves as expected on a device is only known after the first emulator run.

Two tags:
- `core`: needs no server. Runs anywhere, including EAS.
- `needs-backend`: signs in and syncs. Runs only against a **local** Supabase stack, never a hosted project.

| ID | Area | Title | Preconditions | Steps | Test data | Expected | Type | Priority | Automated? (file) |
|---|---|---|---|---|---|---|---|---|---|
| E2E-001 | First run | Welcome, start without an account | Fresh install | Read the welcome; Start using Ona; relaunch; Settings → Account & Subscription → Create account to sync; type a bad email | "not-an-email" | Welcome shown once; all 5 tabs; no welcome after relaunch; Create account stays disabled | e2e | P0 | 01-first-run.yaml |
| E2E-002 | First run | Sign up | Fresh install; local stack | Sign in or create an account; email and password; tick "Store my feelings…"; Create account | `MAESTRO_E2E_EMAIL`, "e2e-password-1" | Lands in the app (or asks to confirm the email, if confirmation is on) | e2e | P0 | 01b-sign-up.yaml |
| E2E-003 | Plan → Daily → Feeling | A step becomes today's task, done with a feeling | Fresh install | New Plan → Start from scratch; add a step; Move to Daily Planning → Today; Daily Planning: tick it; How do you feel? → Calm → Save; relaunch | "Run a 10K", "Buy running shoes" | Task appears in today; ticked; "Felt calm"; still ticked after relaunch | e2e | P0 | 02-plan-to-feeling.yaml |
| E2E-004 | Habits | Build a habit and read its analysis | Fresh install | Build a new habit; cue and habit; Create habit; open it; Done → Save; Analysis; relaunch | "pour my morning coffee", "write one journal line" | "Marked done today"; Analysis shows Done and missed and Milestones; no ranking or causal words; habit still there | e2e | P0 | 03-habit-analysis.yaml |
| E2E-005 | Quit | A slip, kindly | Fresh install | Quit → Start quitting something; I went back to it; Continue; Save this chapter; Start a new track now | "late-night scrolling" | "This isn't a failure"; no blaming words; chapter saved; the journey shows Track 1 and Track 2 (Ongoing, Day 1) | e2e | P0 | 04-quit-slip.yaml |
| E2E-006 | Offline | Use Ona with no network | Fresh install; airplane mode | Add a task in Daily Planning; close and reopen | "Written offline" | Task added and still there after relaunch | e2e | P0 | 05-offline-then-sync.yaml |
| E2E-007 | Sync | Then sync | After E2E-002, same email; local stack | Settings → Account & Subscription → Sync now | – | No error; "Last synced" no longer "Not yet" | e2e | P0 | 05b-sync.yaml |
| E2E-GUARD-001..005 | Test suite | Flows match the app | – | `npm test` | – | Right package; tags; subflows exist; every selector is in the source; the e2e build points at no real server and EAS skips `needs-backend` | unit | P1 | maestroFlows.test.ts |

## On GitHub Actions (the chosen runner)

`.github/workflows/e2e-android.yml` builds a release APK for the emulator, with its Supabase address set to `http://127.0.0.1:9` (nothing listens there), starts an Android 14 emulator and runs the `core` flows. It runs on the default branch, nightly, and on demand (Actions → E2E (Android) → Run workflow). The report and screenshots are attached to each run as `maestro-results`.

`.github/workflows/ci.yml` runs the type-check and every Jest test on each push and pull request, and the backend tests (a local Supabase stack inside the runner) on the default branch, nightly and on demand.

## Also possible: EAS

`.eas/workflows/e2e-test-android.yml` does the same on EAS, but Expo only runs Maestro jobs on a paid plan.

## Also possible: on this PC

1. Install Android Studio (it brings the Android SDK and an emulator) and Java 17. Create an emulator (Pixel, API 34 or later) and start it.
2. Install Maestro: https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli
3. For the `core` flows, build and install the app: `npx expo run:android`. Then:
   ```
   maestro test --exclude-tags needs-backend .maestro
   ```
4. For the `needs-backend` flows, point the app at the local stack. The emulator reaches this PC at `10.0.2.2`, so put these in a `.env.local`, which is not committed:
   ```
   EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from `npx supabase status`>
   ```
   Then `npx supabase start`, rebuild with `npx expo run:android` (a debug build, which allows plain `http` to the local stack), and run:
   ```
   maestro test -e MAESTRO_E2E_EMAIL=e2e-$RANDOM@ona.test .maestro/01b-sign-up.yaml .maestro/05-offline-then-sync.yaml .maestro/05b-sync.yaml
   ```
   Delete `.env.local` afterwards so normal builds go back to your real settings.
