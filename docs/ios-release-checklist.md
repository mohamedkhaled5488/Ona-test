# Ona on iPhone: release checklist

Ona launches on the App Store first. This is the step-by-step path from this repository to TestFlight and then the App Store. Commands run in the project folder (`C:\Ona\ona app`).

The project is set up so far for iPhone only, with bundle ID `app.ona`. On iPhone the sign-in options are email and Sign in with Apple.

## 0. Before anything can be signed

- [ ] **Join the Apple Developer Program** (paid yearly) at https://developer.apple.com/programs/enroll/. Nothing below can be signed or uploaded until Apple approves the membership. If approval stalls, contact Apple at https://developer.apple.com/contact/ and keep the reference number.
- [ ] In App Store Connect, accept the **Paid Applications agreement** and add bank and tax details. Subscriptions can't be sold without them.

## 1. What's already configured (no action needed)

| Item | Where | Why |
|---|---|---|
| Bundle ID `app.ona`, iPhone only | `app.json` → `ios` | Agreed name, the same as Android. iPhone only means no iPad screenshots or iPad review |
| Version `1.0.0`; build number set by EAS | `app.json` `version`; `eas.json` `appVersionSource: remote`, `autoIncrement` | Each store build gets the next build number automatically |
| Permission texts | `app.json` plugins | Camera and photo library (budget receipts, book covers and quote pages, habit proof photos, skill progress, task attachments; IOS-CFG-012 fails if a new screen asks for a photo without being named) and Face ID (app or journal lock), each with a plain sentence. **No microphone**: Ona never records, so the default microphone text from two plugins is switched off |
| Background audio | `expo-audio` plugin | Sleep sounds keep playing with the phone locked. Apple checks that background audio is really used |
| Encryption answer | `ios.config.usesNonExemptEncryption: false` | Ona only uses encryption built into iOS (HTTPS, Keychain) and hashing. Apple: "the use of encryption that's built into the operating system—for example, when your app makes HTTPS connections…—is exempt". App Store Connect then skips the export questions on each upload |
| Privacy manifest | `app.json` → `ios.privacyManifests` | No tracking. It declares the required-reason APIs that React Native and the Expo packages use (file timestamps, UserDefaults, disk space, system boot time), copied from each package's own manifest, as Expo's guide advises. `iosConfig.test.ts` fails if a new package needs a reason that isn't declared |
| Build profiles | `eas.json` | `development` (dev client on a phone), `development-simulator` (iOS Simulator, no Apple account needed), `preview` (internal install; on iPhone that needs registered devices), `production` (TestFlight and the App Store) |
| No Google sign-in on iPhone | `app.config.js` | Its plugin isn't applied on iOS; see `docs/google-signin-setup.md` |

Checked by `src/utils/__tests__/iosConfig.test.ts` (IOS-CFG-001..008) on every `npm test`.

**Note on encryption:** Apple's page adds that apps using exempt encryption "might alternatively be required to submit a year-end self-classification report to the U.S. government". Check whether that applies to Ona (an HTTPS-only app) before the first release, and keep the answer here.

## 2. First TestFlight build (after the membership is approved)

1. Sign in to Expo, if needed: `npx eas-cli login` (account `mohamed667`).
2. Build:
   ```
   npx eas-cli build --platform ios --profile production
   ```
   On the first run, EAS asks you to **log in with your Apple ID** (the one in the Developer Program). It sends a two-factor code to your Apple devices, then asks you to pick the team. Let EAS **create the distribution certificate, the provisioning profile and the push notification key** for you. It also registers the bundle ID `app.ona`; if Apple says the ID is taken, stop and tell me. EAS keeps the credentials, so later builds don't need your Apple login.
3. Upload to App Store Connect:
   ```
   npx eas-cli submit --platform ios --latest
   ```
   On the first run, EAS can **create the app record** in App Store Connect. It asks for the app name (pick a title that's free, e.g. "Ona: Plans, Feelings & Habits"), the primary language and the company name. Afterwards, copy the app's **Apple ID** number into `eas.json` → `submit.production.ios.ascAppId` (App Store Connect → the app → App Information → Apple ID).
4. The build appears in TestFlight after processing, usually 10–15 minutes.
5. **Internal testers** (up to 100 people on your App Store Connect team) can install at once. **External testers** need a short Beta App Review first.

For automated uploads later (CI), set up an App Store Connect API key with `npx eas-cli credentials --platform ios` → production → "App Store Connect: Manage your API Key".

## 3. Still to come in the next stages

- **Stage 2:** Sign in with Apple; deleting an account that uses Sign in with Apple (revoking Apple's token); Terms and Privacy links on sign-up.
- **Stage 3:** payments with Apple (RevenueCat + StoreKit). The subscription products are created in App Store Connect; this file gets the sandbox testing steps.
- **Stage 4:** iPhone-specific behaviour: notification limits, audio interruptions, no screenshot blocking on iOS, Face ID, permissions, safe areas.
- **Stage 5:** App Review readiness: `docs/app-review-notes.md`, `docs/app-privacy-answers.md`, and no "Coming before launch" text in a release build.
- **Stage 6:** TestFlight test plan on real iPhones.
