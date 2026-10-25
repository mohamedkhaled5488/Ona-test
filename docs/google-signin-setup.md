# Google sign-in setup

"Continue with Google" sits next to email and password on the sign-in and sign-up screens. The app side is built. These are the manual steps in Google Cloud and Supabase. Do them in order.

The flow: Google's sign-in sheet on the phone → a Google **ID token** → `supabase.auth.signInWithIdToken({ provider: 'google', token })` → an Ona session. Only the basic `profile` and `email` scopes are requested.

> **Needs a development build.** Google sign-in uses native code, so it doesn't work in Expo Go or the web preview. There the button explains this instead of failing. See [building.md](building.md).

## 0. Before you start

- [ ] **Choose the Android package name** (e.g. `app.ona`) and set it in `app.json` → `expo.android.package`. The Android OAuth client is tied to it, and it can't be changed after the app is on Google Play.

## 1. Google Cloud project

- [ ] Go to <https://console.cloud.google.com/> and create a project (e.g. "Ona"), or pick an existing one.

## 2. OAuth consent screen

Google Cloud → **APIs & Services → OAuth consent screen** (shown as "Google Auth Platform → Branding / Audience" in newer consoles):

- [ ] User type: **External**.
- [ ] App name: **Ona**. Add a user support email, the app logo, and your developer contact email.
- [ ] App domain links: privacy policy and terms URLs (required before publishing; can be added once they exist).
- [ ] **Scopes:** only `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. These are non-sensitive, so no Google verification review is needed.
- [ ] While the app is in **Testing**, add your Google account (and any testers) under **Test users**. Only they can sign in.
- [ ] Before release: **Publish app** (move to "In production").

## 3. OAuth client IDs

Google Cloud → **APIs & Services → Credentials → Create credentials → OAuth client ID**. You need both of these:

### Web client (this is the one the app uses)

- [ ] Application type: **Web application**, name e.g. "Ona web (Supabase)".
- [ ] No JavaScript origins or redirect URIs are needed for this flow.
- [ ] Copy the **Client ID** and **Client secret**.
- [ ] Put the Client ID in `.env` (never commit it; `.env` is already ignored by git):
  ```
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=1234567890-abc...apps.googleusercontent.com
  ```
  For EAS builds, set the same variable in EAS (`eas env:create`) instead of relying on the local file.

### Android client (one per signing key)

Google only issues an ID token to an app whose **package name + signing certificate SHA-1** match an Android client. Create an Android client for **each** key that signs builds you'll sign in with:

- [ ] **Local development key**: builds made with `npx expo run:android`.
  ```sh
  cd android && ./gradlew signingReport
  # or
  keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android
  ```
  Use the `SHA1` of the debug variant. With EAS-built development builds, use the SHA-1 that `eas credentials` shows for that profile instead.
- [ ] **Play App Signing key**: builds installed from Google Play (any testing track or production). Play Console → your app → **Test and release → Setup → App signing** (sometimes "App integrity") → *App signing key certificate* → SHA-1.
- [ ] Optional, the **upload key**: only if you install release builds signed with your upload key directly (not through Play). Same page, *Upload key certificate*.

For each one: Application type **Android**, package name from step 0, the SHA-1. Android client IDs are **not** put in the app; they only need to exist.

> **Common mistake:** "Package name" is the app's ID (`app.ona`), not a display name like "Ona-android". A wrong package name or SHA-1 makes Google refuse with **code 10** (shown in brackets under the sign-in message).

## 4. Supabase

Supabase dashboard → **Authentication → Sign In / Providers → Google**:

- [ ] **Enable** Google.
- [ ] **Client IDs:** the Web client ID **first**, then each Android client ID, comma-separated with no spaces:
  `WEB_ID.apps.googleusercontent.com,ANDROID_DEV_ID.apps.googleusercontent.com,ANDROID_PLAY_ID.apps.googleusercontent.com`
- [ ] **Client secret:** the Web client's secret.
- [ ] **Skip nonce checks: ON.** The free Google sign-in library on Android can't pass a nonce. (The paid "Universal" library can; switch this off if Ona moves to it.)
- [ ] Leave **automatic identity linking** at its default (on). That's what makes one email one account (see below).
- [ ] Save.

Supabase dashboard → **Authentication → Sign In / Providers** (the general section at the top), on **both** production and **ona-staging**:

- [ ] **Allow manual linking: ON.** Settings → Account → Sign-in methods uses it to link a Google account with a *different* address (or, later, an Apple "hide my email" address) to the account you're signed in to. Without it, "Link Google" says "Linking isn't switched on for this server yet." The local stack has it on (`supabase/config.toml`).
- [ ] **Secure password change:** leave it as it is today (off). If you switch it on, "Set a password" will need the confirmation code step, which Ona doesn't have yet.

## 5. Build and test

- [ ] Make a development build (see [building.md](building.md)) and install it on an Android phone with Google Play services.
- [ ] Settings → Account & Subscription → Create account to sync → **Continue with Google**.

### Live checks for one account and one trial

The app's automatic tests use a model of Supabase's linking rules. Check the real thing once, with a Google account you own:

1. Sign up with email + password using your Google address, confirm the email, and sign in. Plan & usage shows **Trial, 30 days left**.
2. Sign out, then **Continue with Google** with the same address. Plan & usage shows the **same** trial end date, and Supabase → Authentication → Users shows **one** user with two identities (email, google).
3. With a second address you own: sign up with email + password but **don't** confirm. Then Continue with Google with that address. You get one user, the trial starts once, and the old password no longer signs in (Supabase drops an unconfirmed password login when Google proves the address, so nobody can take over an email they don't own).
4. Google first, then try "Create account" with the same address. The app says the email already has an Ona account.
5. Sign out: the next Continue with Google asks which Google account to use (the Google session was cleared too).

### What users see when something goes wrong

| Situation | Message |
|---|---|
| They close Google's sheet | nothing |
| No internet | "You're offline. Connect to the internet and try again." |
| No Google Play services | "Google sign-in needs Google Play services, which aren't available on this phone. You can use email and password instead." |
| Token expired before it reached Supabase | one automatic retry, then "Your Google sign-in took too long and expired. Please try again." |
| Expo Go / web preview | "Google sign-in works in the installed Ona app, not in this preview…" |
| Web client ID not set | "Google sign-in isn't set up in this version yet…" |

## iPhone: Google is Android-only for now

On iPhone, Ona offers email and **Sign in with Apple** (decided 2026-10-20); Google sign-in stays on Android. The Google config plugin is therefore not applied (it only adds an iOS URL scheme), and the Google button is hidden on iOS.

To offer Google on iPhone later:

- create an **iOS** OAuth client in Google Cloud;
- add `['@react-native-google-signin/google-signin', { iosUrlScheme }]` back to `app.config.js` with its reversed client ID (`com.googleusercontent.apps.…`);
- check App Review Guideline 4.8 (login services) again at that time.
