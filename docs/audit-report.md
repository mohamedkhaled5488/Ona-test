# Ona audit report

A skeptical QA pass over the code, the copy and the flows, plus everything the test stages found. Bugs that were clearly bugs (wrong numbers, data loss, security) are fixed, each with a failing test first. Everything else is listed for your decision and has **not** been changed.

## Top 10, in the order I'd do them

1. **AUD-08 (Blocker for launch): the legal pages and the support contact don't exist yet.** Google Play needs a privacy policy and a web page for account-deletion requests before Ona can be listed. The support email is empty too.
2. **AUD-09 (High): verify the crisis lines.** People in a hard moment would see 988, Samaritans and the others without anyone having checked the numbers and links. The "not verified" warning only shows in debug builds.
3. **AUD-10 (Medium): link to support from Quit.** The Quit section recommends professional support but gives no way to reach the support resources from there.
4. **AUD-05 (Medium): sync keeps the change that was synced last, not the one made last.** A phone that was offline for a week can overwrite yesterday's edit from your other phone.
5. **AUD-11 (Medium): feelings caught in "Catch a Feeling or Idea" never reach the Feelings log.** There are three places to note a feeling, and only some of them count.
6. **AUD-01 (Medium): Diet and Catch close as if saved when the name is empty,** silently dropping what was typed.
7. **AUD-06 (Low): deleting an account and signing up again starts a new 30-day trial.**
8. **AUD-12 (Low): amber is used as a warning colour** across Settings, dialogs, Budget and the timer, though the brand reserves it for highlights.
9. **AUD-07 (Low): one feelings tip claims a cause** ("tiredness often has a simple physical cause").
10. **AUD-04 (Low): Budget's over-limit bar turns red** while the copy says "No judgment".

Also worth doing soon: run the end-to-end flows, and add a linter (AUD-14). The flows are written and checked against the app's text, but they haven't run on an emulator yet. GitHub Actions is ready once the repository exists.

## Bugs found and fixed (each with a failing test first)

| ID | Severity | Section | What was wrong | Evidence | Fix | Test |
|---|---|---|---|---|---|---|
| FIX-01 | High | Habits, Quit | Day counts lost a day after the spring DST change: a track started 1 March showed "Day 9" on 10 March, and the habit's "Day N of 66" and milestones did the same, until autumn. | `daysElapsed`, `daysSinceTrackStart` rounded down a span one hour short of whole days | Count calendar days (UTC) | dstDayCounts.test.ts HAB-DATE-001..003 |
| FIX-02 | Low | Mind Games, Quit, Book, Skills | Day-of-year and weekly rotations repeated a day around DST | `dayOfYear`, rotating stat, weekly quote/session | Same fix | dstDayCounts.test.ts |
| FIX-03 | High | Budget, Diet, Skills, Habits, Study, Plan Builder, Book, Daily Planning | Numbers typed with a decimal comma ("12,50") or Arabic-Indic digits ("١٢٠٫٥") were rejected; Diet saved such a cost as NaN, so it was lost; Book and the task estimate silently dropped Arabic digits as you typed | `Number(text)` / `replace(/[^0-9]/g, '')` at every number field | One parser (`utils/numberInput.ts`) used everywhere | numberInput.test.ts, BUD-C-004/005, DIET-C-003/004/005 |
| FIX-04 | Medium | Budget | Closing the new-budget form reset its currency to USD instead of your default | `reset()` hard-coded 'USD' | Reset to the Settings default | BUD-C-006 |
| FIX-05 | Medium | Catch a Thought → Journaling | "Add to Journal" on a day with no entry created one coloured **Tense** | `promoteToJournal` used 'tense' | Neutral "okay" | CAT-C-006 |
| FIX-06 | Medium | All screens | 75 icon-only buttons had no screen-reader name (TalkBack said just "button"); dialog buttons (Cancel/Delete…) and the toast's Undo weren't marked as buttons; the sheet's tap-outside area was unnamed; Catch a Thought's filters weren't a selectable group | Scan of every `.tsx` | Labels, roles and states added | a11yIconButtons.test.ts and the screen tests |
| FIX-07 | Low (tests) | Test suite | Two demo tests failed ~1 in 4 runs under coverage (5-second limit; fixed sleeps) | Repeated runs | Explicit save flush; 20 s limit for demo tests | demoIsolation, demoEdgeCases |
| FIX-08 | High | Plan Builder ↔ Daily Planning | Deleting a step or a whole plan left the tasks already moved into your days pointing at nothing: titled "Plan step" and impossible to tick off | Linked tasks read title/done from the step | Before deleting, linked tasks become normal tasks keeping the step's title and done state; Undo restores plan and links (`utils/planLinks.ts`) | int.planDaily.test.ts INT-PLAN-006..010 |
| FIX-09 | Medium | Sleep ↔ Study | Both sections share one sound engine keyed only by sound name: ending a study session with "rain" stopped Sleep's rain (Sleep still showed it playing), and Sleep's timer fade-out silenced a study session | `audioEngine` | Each section owns its own players | int.audioOwners.test.ts |
| FIX-10 | Low | Server (privacy) | Any signed-in user could ask the server whether another account has sync access (`has_sync_access(other id)` answered `true` for a paying account) | BE-RLS-009 failed on the local stack | Answers only about the caller (migration 0006); the sync rules behave as before | rls.test.ts BE-RLS-009 |
| FIX-11 | Medium | Server (billing) | A RevenueCat event for an account deleted in the app (its store subscription still renewing) failed with a 500, so RevenueCat would retry it indefinitely | BE-WH-009 failed: foreign-key error 23503 | The webhook acknowledges it and records it as "unknown user" | webhook.test.ts BE-WH-009 |
| FIX-12 | Low | Quit a Habit | A chapter that started and ended the same day read "1 days" in the journey | Found by the first emulator run (E2E-005) | "1 day" / "N days" | quitJourneyCopy.test.tsx |

## Regression and safety checks added in Stage 8

| ID | What it guards | Test |
|---|---|---|
| FIX-REG-01 | The old "Maximum update depth exceeded" crash in Daily Planning. Root cause: a store selector built a new array on every call (`s.plans.filter(...)` in the plan-step picker), so React saw new state on every render and looped. The test checks that no selector in the app builds a new array or object, and opens the picker with plans and checks the loop doesn't happen. Both parts fail when the old selector is put back | updateDepth.test.tsx |
| AUD-SCAN-01/02 | No text anywhere in the app claims a cause or a diagnosis (negations such as "never a diagnosis" are fine). Three lines were reviewed by hand and allowed, with the reason for each | noCausalCopy.test.ts |
| AUD-SCAN-03 | The app reads only public `EXPO_PUBLIC_` variables, and no server key, secret key or private key appears in its code or config | bundleSecrets.test.ts |
| E2E-GUARD-001..005 | The Maestro flows match the app's text and ids, and the test builds can't reach the real Supabase project | maestroFlows.test.ts |

The audit checked these and found them fine:
- Account deletion is reachable in the app.
- Analytics is opt-in and allowlisted, and sends nothing yet.
- The developer page is hidden in release builds.
- Journal screens support screenshot blocking.
- Every setting is read somewhere outside Settings.
- The server keeps every account's data apart (Stage 5).

## Findings for your decision (behaviour not changed)

| ID | Severity | Section | What doesn't make sense | Evidence | Suggested improvement | Effort |
|---|---|---|---|---|---|---|
| AUD-01 | Medium | Diet, Catch a Thought | Saving with an empty name/text closes the form as if it worked; anything else typed (cost, notes, tags) is silently dropped | Diet `MealFormModal` Save has no disabled state; store ignores blank names | Disable Save until there is a name (as Budget does), or say why nothing was saved | S |
| AUD-02 | Low | Catch a Thought | "Voice capture (coming soon)" does nothing (shows a toast) | `CatchAThoughtScreen` | Remove until it exists (as was done in Skills) | S |
| AUD-03 | Low | Journaling | A journal entry must have a colour, so one created from Catch a Thought gets "okay" even though you never chose | `JournalEntry.zone` is required | Allow "not chosen yet" | M |
| AUD-04 | Low | Budget | Over a limit, the bar turns red (#B3413A), though the copy is gentle ("No judgment") | `BudgetScreen` progressFill | Use a soft neutral colour (not amber; see AUD-12) | S |
| AUD-05 | Medium | Sync | When the same item was changed on two phones, the server keeps the change that was **synced** last, not the one **made** last: each change is stamped with the time the phone syncs. A phone that was offline for a week can overwrite yesterday's edit from another phone when it reconnects | `syncOnce` stamps every outgoing row with the sync time (`engine.ts`); BE-SYNC-003 shows both phones still end up the same | Stamp each item with the time it was edited on the phone (needs an "edited at" per item) | M |
| AUD-06 | Low | Trial | Deleting the account also deletes its trial record, so signing up again with the same email starts a new 30-day trial | `account_trials` cascades on account deletion (BE-DEL-002) | Keep a hashed email of used trials, if this matters to you | S |
| AUD-07 | Low | Identify the Feeling | One guidance line makes a general claim: "tiredness often has a simple physical cause". Everything else in Ona avoids saying what causes what | `src/data/feelingsWheel.ts` (Tired); noCausalCopy.test.ts lists it as reviewed | Reword, e.g. "Check the basics first: sleep, food, movement" | S |
| AUD-08 | Blocker (launch) | About & Legal | The privacy policy, terms, support email, the public account-deletion page and the Play Store link are all empty; the screens say "Coming before launch". Google Play requires a privacy policy and, for apps with accounts, a web page for deletion requests. The content-rating questionnaire (feelings and Quit content, crisis lines) also needs answering | `src/config/about.ts` `LEGAL` (all null) | Publish the pages and an inbox, fill in `LEGAL`, and prepare the Play Data safety form and content rating | M |
| AUD-09 | High | Help & Safety, Identify the Feeling | The crisis and support lines (988, Samaritans, Find A Helpline…) are marked "not verified"; that marker only shows in debug builds, so people would see unchecked numbers in the release | `src/config/about.ts` (`verifiedOn: null` on every entry); `HelpAboutPages.tsx` shows "Not verified yet" only when `__DEV__` | Check each number and link against the service's own site, set `verifiedOn`, and re-check before each release | S |
| AUD-10 | Medium | Quit a Habit | "A quiet note" suggests professional support, but offers no way to reach the support resources from there (they're in Settings → Help & Safety and in Identify the Feeling) | `QuitHabitScreen.tsx` safeguard card | Add a calm "Where to find support" link to the same resources | S |
| AUD-11 | Medium | Catch a Feeling or Idea, Identify the Feeling, Journaling | There are three places to note a feeling, and a "Feeling" caught in Catch is free text only: it never reaches the Feelings log, its graph, Analysis or Recap. Someone who uses Catch for feelings sees empty analysis | `ThoughtKind 'feeling'` in `useThoughtsStore`; nothing reads it in `feelingsStats` | Offer "Also add to your Feelings log" when a feeling is caught, or call that kind a "note" | M |
| AUD-12 | Low | Whole app | Amber is "RESERVED for highlights/motivation, never general UI", yet it's the warning colour in Settings notices, a dialog style, Budget notes and the timer ring (67 uses in 27 files) | `theme/colors.ts`; `SettingsParts.tsx` `noticeWarn`, `UiProvider.tsx`, `BudgetScreen.tsx`, `TimerRing.tsx` | Add a separate soft "notice" colour and keep amber for highlights | M |
| AUD-13 | Low | Journaling | Journaling's shortcut button is read out as "Catch a thought", while the section is "Catch a Feeling or Idea" everywhere else | `JournalingScreen.tsx` accessibility label | Use the section's name | S |
| AUD-14 | Low | Project | No linter is set up, so CI checks types and tests but not common React mistakes (such as the hook-dependency issue behind the old update loop) | No ESLint config; `package.json` has no lint script | Add Expo's standard lint config and run it in CI; fix what it reports | S–M |
| AUD-15 | Low | Logs and histories | Only one list in the app is virtualised (the tour); long histories render every row. A quick render of 2,000 thoughts showed no slowdown in tests, so this is unmeasured on real phones | `FlatList` in `DiscoverTourScreen.tsx` only | Measure with a year of data on the slower phone (manual checklist MAN-071) before changing anything | M |
