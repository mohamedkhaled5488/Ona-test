# Building Ona

## Expo Go vs a development build

| | Expo Go | Development build |
|---|---|---|
| Everyday UI work, all sections, sync | ✅ | ✅ |
| **Continue with Google** | ❌ (the button explains why) | ✅ |
| RevenueCat purchases (once added) | test mode only | ✅ |
| Face ID prompt text, custom notification sounds | partial | ✅ |

Expo Go is fine for most work. Anything with its own native code (Google sign-in now, store purchases later) needs a **development build**: your own installable copy of Ona that includes those native modules, and still loads JavaScript from `npx expo start`.

## Make a development build (Android)

Prerequisites: Android Studio with an SDK and an emulator, or a phone with USB debugging; JDK 17.

**Option A: locally**

```sh
npx expo prebuild --clean   # generates android/ from app.json + app.config.js
npx expo run:android        # builds, installs and starts it
```

The debug signing key is `android/app/debug.keystore`. Its SHA-1 is what Google sign-in's local Android client needs ([google-signin-setup.md](google-signin-setup.md), step 3).

**Option B: EAS (in the cloud)**

```sh
npm i -g eas-cli
eas login
eas build:configure
eas build --profile development --platform android
```

Install the resulting APK on the phone, then run `npx expo start` and open it from the dev build. Set `EXPO_PUBLIC_*` values with `eas env:create` (EAS doesn't read your local `.env` unless you upload it). The SHA-1 for this build's key is shown by `eas credentials`.

## Environment

Copy `.env.example` to `.env` and fill in:

- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`: Google sign-in (the **Web** client ID)

`.env` is ignored by git. Never commit it.

## Tester builds need a green CI

A tester APK (EAS profile `preview`) is only built from a commit on which both GitHub workflows passed: **CI** (type check, Jest, and the backend tests against a local Supabase) and **E2E (Android)** (the Maestro flows). EAS runs `scripts/require-green-ci.js` on its servers before every build (`eas-build-pre-install` in package.json); for `preview` it stops the build if either workflow failed, was cancelled, is still running, never ran on that commit, or GitHub can't be reached. `eas.json` has `requireCommit: true`, so what's built is exactly the commit that was checked.

Before starting one: push, wait for both runs, then `npm run check:ci` (the same check, on your machine).

| ID | What | Test |
|---|---|---|
| GATE-001..003 | Green builds; red, cancelled, running or missing runs don't; the latest re-run decides | buildGate.test.ts |
| GATE-004 | The hook, `requireCommit` and the workflow names stay in place | buildGate.test.ts |

## Real-account tests on staging

The real-account tests (`supabase/tests/realAccount.test.ts`, BE-REAL-001..004) run on the local Supabase in every CI run, and nightly against a separate staging project, **ona-staging** (same region as production, same migrations including 0009). The staging harness refuses to run unless every value points at staging and none at production (`supabase/tests/globalSetup.staging.js`, tested in STAGING-GUARD-001..002): the project ref must not be production's, the URL must be exactly the staging project's, any JWT-style key must name the staging ref, and the service key must be accepted by the staging URL. Before each run it deletes earlier test accounts (emails ending `@ona.test`, nothing else).

**Setting it up (once):**
1. Create the project **ona-staging** in the Supabase dashboard, in the same region as production.
2. Apply the migrations to it, as for production: run each file in `supabase/migrations/` in order (0001 … 0009) in its SQL editor, or `npx supabase link --project-ref <staging ref>` then `npx supabase db push`. BE-STAGING-001 fails if 0007, 0008 or 0009 is missing.
3. Add these in GitHub → the repository → Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Variable | `STAGING_PROJECT_REF` | the staging project's ref (Settings → General → Project ID, 20 letters) |
| Variable | `STAGING_SUPABASE_URL` | `https://<staging ref>.supabase.co` |
| Variable | `STAGING_SUPABASE_ANON_KEY` | the staging project's anon (public) key |
| Variable | `PRODUCTION_PROJECT_REF` | the production project's ref (so the guard can refuse it) |
| **Secret** | `STAGING_SUPABASE_SERVICE_ROLE_KEY` | the staging project's service_role key: **only here**, never in a file |

4. Actions → Real account (staging) → Run workflow, once; then it runs nightly.

**`.env.test`** (optional, on your computer, ignored by git; only needed to point a local build of the app at staging) is a **file**, not commands: create `.env.test` in the project folder (next to `package.json`, e.g. `notepad .env.test`), paste these lines with your real values in place of the `<...>` (no angle brackets), and save. It holds the public values only:

```
STAGING_PROJECT_REF=<staging ref>
STAGING_SUPABASE_URL=https://<staging ref>.supabase.co
STAGING_SUPABASE_ANON_KEY=<staging anon key>
PRODUCTION_PROJECT_REF=<production ref>
```

No service key goes in `.env.test`, and the staging tests aren't run from a computer with the app's `.env` loaded (the guard refuses if the production URL is in the environment).

**Tester builds need it:** the build check also requires the latest **Real account (staging)** run to have passed within 30 hours (GATE-005), so the first tester build after this needs staging set up and run once.

## Release builds

Covered in [billing-setup-checklist.md](billing-setup-checklist.md). Remember to add the **Play App Signing** SHA-1 as its own Android OAuth client before testing Google sign-in on a Play-installed build.
