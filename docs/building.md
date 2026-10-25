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

## Release builds

Covered in [billing-setup-checklist.md](billing-setup-checklist.md). Remember to add the **Play App Signing** SHA-1 as its own Android OAuth client before testing Google sign-in on a Play-installed build.
