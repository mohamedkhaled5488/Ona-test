# Billing setup checklist

The manual steps for Ona's paid plan (sync), in order. The app and server code is already in place; these are the parts that live in Google Play Console, RevenueCat and Supabase.

Prices are never set in code. Change them in Play Console (and the RevenueCat offering); the app reads them live.

## 1. App basics

- [x] The Android package name is `app.ona` (`app.json` → `expo.android.package`). Nothing in Play Console can be created without it.
- [ ] Upload a first build to an internal testing track (products can't be created before an app bundle exists).
- [ ] Once the package name is known, set `PLAY_SUBSCRIPTIONS_URL` in `src/config/plans.ts` to deep-link to Ona's subscription (`?sku=ona_sync&package=<package>`).

## 2. Google Play Console products

- [ ] Subscription product **`ona_sync`** with two base plans:
  - [ ] `monthly`: auto-renewing, 1 month
  - [ ] `annual`: auto-renewing, 1 year
  - [ ] Optional: `annual_founders`: auto-renewing, 1 year. Leave it inactive until the founders limit is decided (section 6).
- [ ] Optional in-app product **`lifetime`** (one-time, non-consumable). Leave it inactive while `lifetimeEnabled` is off.
- [ ] **Do not add a free trial offer** to any base plan. Ona's 30-day trial is run by the app and server with no card required (`supabase/migrations/0003_entitlements.sql`). A store trial would ask for a payment method.
- [ ] Enable **grace period** (the app shows a soft "update payment method" note and keeps sync on).
- [ ] Enable **account hold** (the app pauses sync and explains how to fix the payment).
- [ ] Set starting prices (USD reference: monthly about 3.99, annual about 24.99, founders about 17.99, lifetime about 79), then **review every country's price by hand**. Don't rely on automatic conversion.
- [ ] Confirm EU and UK prices **include VAT**.
- [ ] Add **license testers** (Settings → License testing) with the emails of everyone who will test purchases:
  - [ ] …
  - [ ] …
- [ ] Optional: create promo codes for testing or support (then turn on `redeemCodeEnabled` in `src/config/features.ts`).

## 3. RevenueCat

- [ ] Create the project and the Android app with the package name. Connect Play Console with a service account (RevenueCat's guide).
- [ ] Import the products: `ona_sync:monthly`, `ona_sync:annual`, and if used `ona_sync:annual_founders` and `lifetime`.
- [ ] Entitlement **`sync_access`**, attached to every one of those products.
- [ ] Offering **`default`** (set as current) with packages:
  - [ ] Monthly → `ona_sync:monthly` (package type Monthly)
  - [ ] Annual → `ona_sync:annual` (package type Annual)
  - [ ] Lifetime → `lifetime` (package type Lifetime), only if offered
  - [ ] Custom package id **`annual_founders`** → `ona_sync:annual_founders`, only if offered
- [ ] Copy the **public Android SDK key** (for the app) and a **secret API key** (for the webhook's transfer handling).

## 4. Supabase

- [ ] Apply migrations `0002_account_deletion.sql`, `0003_entitlements.sql`, `0004_revenuecat_events.sql`.
- [ ] Set the function secrets:
  ```sh
  supabase secrets set REVENUECAT_WEBHOOK_AUTH="Bearer <long random string>"
  supabase secrets set REVENUECAT_SECRET_KEY="<RevenueCat secret API key>"
  ```
- [ ] Deploy the webhook (RevenueCat doesn't send a Supabase JWT):
  ```sh
  supabase functions deploy revenuecat-webhook --no-verify-jwt
  ```
- [ ] In RevenueCat → Integrations → Webhooks: URL `https://<project>.supabase.co/functions/v1/revenuecat-webhook`, Authorization header **exactly** the `REVENUECAT_WEBHOOK_AUTH` value.
- [ ] Send RevenueCat's test event and confirm a `TEST` row appears in `revenuecat_events`.

## 5. App: connect the store SDK

The Plan & usage screen currently runs on a mocked offering in debug builds, and says plans aren't available in release builds.

- [ ] `npx expo install react-native-purchases`. It needs a development build; Expo Go only runs it in a test mode. How to make one: [building.md](building.md).
- [ ] Implement `BillingClient` with it in `src/billing/billingClient.ts`: `getOffering` → `Purchases.getOfferings().current` through `mapOffering`, plus `purchase`, `restore`, and `redeemCode` if used. Map a user-cancelled purchase to `canceled` and a pending one to `pending`.
- [ ] Call `Purchases.configure` with the public SDK key at startup, and **`Purchases.logIn(<Supabase user id>)` on sign-in** (`logOut` on sign-out). The webhook matches events to accounts by this id; purchases made under an anonymous id can't be matched.
- [ ] Keep sync access coming from the server only (`get_entitlement()`). Don't grant access from `CustomerInfo`.

## 6. Decisions before turning on optional plans

- [ ] **Founders:** decide the limit (a number of people, or an end date). It belongs in remote config, not code. Then turn on `foundersEnabled`.
- [ ] **Lifetime:** decide whether to offer it, then turn on `lifetimeEnabled`.
- [ ] Read Play's **price-change rules**: existing subscribers must be notified, and some increases need their consent.

## 7. Policy and disclosure

- [ ] Complete Play's **subscription disclosure requirements**. The app already shows price, period, auto-renewal, how to cancel, and access-until-end-of-period under the Subscribe button. Check the store listing too.
- [ ] Update the **privacy policy** to name the billing providers (Google Play, RevenueCat) and the analytics events: `paywall_viewed`, `plan_selected`, `purchase_started`, `purchase_completed`, `purchase_canceled`, `trial_started`, `trial_ended`, `restore_clicked` (plan id and country only, and only with consent).
- [ ] Update the **Data safety form** to match.

## 8. Test with license testers before release

- [ ] New account → trial starts (30 days left); reinstall → same trial, not a new one.
- [ ] Buy monthly and annual; sync turns on after the webhook (check the `subscriptions` row).
- [ ] Cancel in Play → "Canceled, still active" with the end date; it expires afterwards.
- [ ] Payment problem → grace note, then on hold → paused sync; fix the payment → sync resumes.
- [ ] Pending purchase (a slow test card) → "waiting on Google Play", no access until it completes.
- [ ] Restore on a second device signed in to the same account.
- [ ] Refund through Play / RevenueCat → "Refunded", sync paused, nothing deleted.
- [ ] Delete account with an active subscription → the warning appears first.
