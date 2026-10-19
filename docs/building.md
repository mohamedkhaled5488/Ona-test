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

## Release builds

Covered in [billing-setup-checklist.md](billing-setup-checklist.md). Remember to add the **Play App Signing** SHA-1 as its own Android OAuth client before testing Google sign-in on a Play-installed build.
