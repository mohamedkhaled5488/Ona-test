# Ona test inventory and gap report

Stage 1 of the testing plan. Measured on the current working tree (October 2026).

## Summary

| | Now |
|---|---|
| Test files | 42 (all in `src/utils/__tests__`, all `.test.ts`) |
| Test cases | 656 written, **834 run** (some are parameterised over zones, states or inputs) |
| Unit / logic | 834 |
| Component / screen | **0** (no React Native Testing Library yet) |
| Integration (real stores + in-memory storage) | about 140 of the above already work this way (demo, data space, sync engine, task ↔ feeling, Part A–D) |
| Backend (Supabase local) | 0 (the webhook and entitlement logic are tested as pure functions) |
| End-to-end | 0 in the repo (browser checks were run during development but live outside the repo) |
| CI | none (the repo has no remote yet) |

Overall statement coverage is 31%. That figure is low because screens and components have no tests at all; the logic is well covered:

| Area | Files | Statements |
|---|---|---|
| `src/utils` (logic) | 57 | **74%** |
| `src/sync` | 3 | 69% |
| `src/demo` | 6 | 85% |
| `src/store` | 23 | 41% |
| `src/screens` | 51 | 0% |
| `src/components` | 33 | 0% |

## Progress since the inventory

| | Stage 1 | After Stage 3 |
|---|---|---|
| Test files | 42 | 56 |
| Tests run | 834 | 1,016 |
| Component / screen tests | 0 | 87 (React Native Testing Library) |
| Property-based tests | 0 | 30 (fast-check) |
| Statement coverage, overall | 31% | 44% |
| `src/store` | 41% | 50% |
| `src/screens` | 0% | 17% |
| `src/components` | 0% | 31% |

Bugs found and fixed so far are listed in `docs/audit-report.md` (Stage 8) and in the test-case files (`docs/test-cases/`).

## 1. Framework decisions

| Layer | Plan | Decision | Why / what's needed |
|---|---|---|---|
| Unit and logic | Jest + jest-expo, plus fast-check | **Keep Jest + jest-expo. Add fast-check in Stage 2.** | Already in place and fast. fast-check fits the date, streak and analysis maths. |
| Component / screen | React Native Testing Library | **Add in Stage 3.** Also widen `testMatch` to `.test.tsx`. | Nothing tests screens today; this is the biggest gap. |
| Integration (in-app) | Real data layer on in-memory storage, real stores, network mocked | **Keep: this is already how ~140 tests work.** | The in-memory AsyncStorage mock plus the real stores and the data-space controller already give a real data layer. No separate database to add. |
| Backend / sync | Supabase local stack (`supabase start`), real migrations and RLS | **Done (Stage 5).** | Docker Desktop is installed but its engine isn't running; the Supabase CLI works through `npx supabase` (2.121.0). Start Docker Desktop before Stage 5. |
| End-to-end | Maestro on an Android emulator | **Agree, with a caveat.** | This machine has no Android SDK/emulator (`adb` missing) and Java 1.8 (Maestro needs 17+). Options: (a) install Android Studio and Java 17 locally, or (b) run Maestro in EAS Workflows (needs the repo connected to EAS/GitHub). Until then, the browser checks used during development will be checked into the repo under `e2e/web` so they run on any machine. |
| Time control | One clock abstraction, fake timers, injectable time zone and DST | **Done in this stage** (see section 5). | |
| CI | GitHub Actions or EAS Workflows | **Agree; needs a remote.** | The repo has no remote. Once it's on GitHub, a workflow (lint, typecheck, unit/component/integration on every push; Supabase and E2E nightly) can block merges. I'll write the workflow file in Stage 7. |

## 2. Per-section inventory

U = unit/logic tests, C = component, I = integration (real stores and storage), E = end-to-end.

| Section | U | C | I | E | Main test files | Gaps |
|---|---|---|---|---|---|---|
| Plan Builder | some | – | some | – | dailyPlanningModel (step ↔ task links) | Store 15%; plan CRUD, reorder, alternatives, sub-steps, export (0%) untested |
| Daily Planning | strong | – | yes | – | dailyPlanningModel, dayView, taskPage, taskForm, taskFeelings, planningInsights, dailyPlanningSettings | Screens; reminder (re)scheduling on edit/delete only partly covered |
| Journaling | none | – | – | – | – | Store 13%, journalStats 0%, PIN lock on the write screen, "on this day", read mode |
| Identify the Feeling | good | – | some | – | feelingsStats, feelingsPartC, feelingSources, noRanking | Graph range/zoom maths, Patterns view, editing flows |
| Habits: Build | strong | – | some | – | habitFrequency, habitStats, habitPartA, habitPartB, habitExport | Store 33% (reminders on edit/delete), re-entry/review flows |
| Habits: Quit | good | – | some | – | habitStats, habitPartA, feelingsPartC | Store 22%; slip flow, track restart |
| Skills | good (logic) | – | – | – | skillProgress, skillStats, skillExport | **Store 2.6%**: CRUD, milestones, archive, reminders |
| Study | weak | – | – | – | studyDetail | studyStats 0%; timer, presets, history |
| Sleep | weak | – | – | – | audioEngine | Store 21%; sleep log, timer, wake alarm scheduling |
| Book | good (progress maths) | – | – | – | bookProgress | Store 37%; quotes, sessions, export (0%) |
| Budget | **none** | – | – | – | – | Store 12%, export 0%; amounts, currencies, limits, savings goals |
| Diet | **none** | – | – | – | – | Store 3%, dietStats 0%; costs, currency, grocery list |
| Catch a Thought | **none** | – | – | – | – | Store 6% |
| Songwriting / Mind Games | none | – | – | – | – | Held back from this launch's navigation; low priority |
| Recap | some | – | – | – | recapStats | recap.ts 20%; area pages, story, shared cards |
| Settings | good | – | some | – | settingsStore, notificationSettings, securityTimeFormat, weekStartTheme | settingsEffects 0% (does a setting reach every screen?) |
| Account / Plan & usage | strong | – | some | – | authStore, accountPrivacy, googleSignIn, entitlement, paywallBilling, planScreen, revenuecatWebhook | entitlementBootstrap 0%; no real backend (RLS, two devices) |
| Sync | good (engine) | – | some | – | syncEngine | syncController 27%; no real-server tests |
| Storage / persistence | good | – | yes | – | localPersistence, demoIsolation | Kill mid-save, relaunch mid-flow |
| Demo mode | strong | – | yes | – | demoEntry, demoEdgeCases, demoGenerator, demoIsolation | – |
| Discover | good | – | – | – | discoverPartD | Tour screen behaviour (Stage 3) |

## 3. Critical modules (statements / branches)

| Module | Stmts | Branches | Note |
|---|---|---|---|
| `utils/date.ts` | 83% | 75% | Add fast-check properties in Stage 2 |
| `utils/taskRepeat.ts` | 98% | 89% | |
| `utils/habitFrequency.ts` (streaks, pauses) | 88% | 83% | |
| `utils/habitPattern.ts` | 93% | 81% | |
| `utils/habitTimeOfDay.ts` | 98% | 87% | |
| `utils/habitStats.ts` | 93% | 79% | |
| `utils/feelingsStats.ts` | 61% | 56% | **Low: graph range and trend maths** |
| `utils/feelingsInsights.ts` | 97% | 86% | |
| `utils/planningInsights.ts` | 99% | 90% | |
| `utils/recapStats.ts` | 72% | 57% | |
| `utils/recap.ts` | **20%** | **19%** | **Low** |
| `utils/skillProgress.ts` | 90% | 78% | |
| `utils/entitlement.ts` | 100% | 96% | |
| `utils/entitlementSync.ts` | 100% | 94% | |
| `utils/entitlementBootstrap.ts` | **0%** | 0% | **Untested** |
| `sync/engine.ts` | 97% | 84% | |
| `sync/records.ts` | 95% | 88% | |
| `sync/syncController.ts` | **27%** | **24%** | **Low: gate, retries, cursor** |
| `utils/localPersistence.ts` | 92% | 71% | |
| `utils/localData.ts` | 80% | 77% | |
| `utils/dataSpace.ts` / `dataSpaceController.ts` | 80% / 94% | 63% / 78% | |
| `utils/notifications.ts` | 51% | 50% | Scheduling/cancelling on edit/delete |
| `utils/reminders.ts` | **27%** | **13%** | **Low** |
| `utils/pinLock.ts` | 59% | 52% | App lock and journal PIN after backgrounding |

## 4. Flaky, skipped and empty tests

| Finding | What it was | Done |
|---|---|---|
| Flaky: "a whole demo session…" and "real storage is byte-for-byte the same" | Failed about 1 run in 4 under coverage. Cause: the Jest 5-second limit. These tests build the full 8-week sample set and also slept for a fixed 500 ms, which overran on a busy machine. Not a data bug (failures were timeouts, not storage differences). | **Fixed:** sleeps replaced by an explicit save flush; the demo test files get a 20-second limit. Storage comparisons now name the exact key that changed if they ever fail. |
| Skipped / `.only` / `.todo` | None found | – |
| Tests that assert nothing | One: the Discover feature-evidence test failed by throwing rather than `expect` (it did check things) | **Fixed:** collects problems and asserts the list is empty |
| Tests that read the real clock | 11 files call `todayISO()`, `new Date()` or `Date.now()` without a fixed time (demoIsolation, googleSignIn, demoEdgeCases, habitPartB, feelingSources, taskFeelings, notificationSettings, feelingsPartC, demoEntry, authStore, accountPrivacy) | **To move onto `useClock()` in Stage 2.** Most only use "today" as a label, but they would pass or fail differently around midnight. |

## 5. New: clock and test utilities

- `src/utils/clock.ts`: the app's one clock. `todayISO()` and the entitlement refresh read it. The trial still trusts the server's time from the last answer (`estimateServerNow`), so moving the phone's clock can't extend it.
- `src/test-utils/` (import from `'../../test-utils'`):
  - `useClock('2026-10-18T23:59')`, `clock.set()`, `clock.advance()`, `restoreClock()`: sets both the app clock and `Date` (fake timers that still let timeouts and awaits run).
  - `TEST_ZONE` (America/New_York, the zone every worker runs in), `DST_2026`, `TRICKY_DATES` (leap day, month ends, year boundary).
  - `prepareZones([...]).run(tz, body)`: runs real util code in any time zone in a child process (Jest can't change zones inside a worker on Windows).
  - `resetAll()`: empties every section, resets settings and preferences, clears storage, returns to your own data space.
  - Factories: `makeTask`, `makeHabit`, `makeCheckIn`, `makeFeeling`, `makeSkill`, `makeSession`, `makeQuitHabit`, `makeTrack`, `makeQuitEntry`.
- `src/utils/__tests__/testUtils.test.ts` checks the helpers themselves (7 tests).

## 6. Biggest gaps, in the order the plan addresses them

1. **Stage 2:** date/time properties with fast-check (DST, month ends, leap day, year boundary, zone change, week start), Feelings graph range maths (`feelingsStats` 61%), and moving the 11 real-clock test files onto `useClock()`.
2. **Stage 3:** component tests for the weakest sections. Budget, Diet, Catch a Thought, Journaling and Skills have little or no store coverage; every screen has none.
3. **Stage 4:** integration matrix, starting with Plan Builder ↔ Daily Planning and feeling sources.
4. **Stage 5 (done):** 52 backend tests on a local Supabase stack built from the migrations: RLS on all 22 tables, trial, entitlement gating, two-phone sync, deletion, the RevenueCat webhook. Run with `npm run test:backend` (see docs/test-cases/backend.md). Two server bugs fixed (FIX-10, FIX-11).
5. **Stage 6 (flows written, not yet run):** 7 Maestro flows for the five journeys in `.maestro/`, an `e2e-test` EAS profile and workflow, and a guard test that checks every selector against the source. Running them needs Android Studio + Java 17 here, or EAS (docs/test-cases/e2e.md).
