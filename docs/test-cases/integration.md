# Test cases: sections working together (Stage 4)

Integration tests run the real stores together on in-memory storage with a set clock; only the network and phone services (notifications, audio) are stand-ins.

| Flow (spec §5) | ID | Title | Expected result | Type | Priority | File |
|---|---|---|---|---|---|---|
| 1 Plan ↔ Daily | INT-PLAN-001 | Move a step to a day | Linked task shows the step's title and the plan's motive; moving again the same day reuses it | integration | P0 | int.planDaily.test.ts |
| 1 | INT-PLAN-002 | Complete in either place | Task ↔ step done both ways; plan progress moves | integration | P0 | int.planDaily.test.ts |
| 1 | INT-PLAN-003 | Rename in either place | Both renamed | integration | P0 | int.planDaily.test.ts |
| 1 | INT-PLAN-004 | Step with sub-steps | All sub-steps done → parent and its task done | integration | P1 | int.planDaily.test.ts |
| 1 | INT-PLAN-005 | Delete the task | Step stays in the plan | integration | P1 | int.planDaily.test.ts |
| 1 | INT-PLAN-006 | Delete the step | Task stays as a normal task with its title and done state, and can still be ticked. **Bug, fixed:** it became "Plan step" and could never be ticked | integration | P0 | int.planDaily.test.ts |
| 1 | INT-PLAN-007 | Delete a parent step | Tasks of its sub-steps freed too; other plans untouched | integration | P1 | int.planDaily.test.ts |
| 1 | INT-PLAN-008 | Delete the whole plan, then Undo | Tasks kept (still shown as "still open" by title); Undo restores plan and links | integration | P0 | int.planDaily.test.ts |
| 1 | INT-PLAN-009/010 | No dangling links; screens use the safe deletes | None; guard on the screens | integration + meta | P0 | int.planDaily.test.ts |
| 2 Daily → Feelings | INT-FEEL-001 | Task feeling | Carries the task's tags; in "After tasks", the graph and the tag insight; labelled with the task | integration | P0 | int.flows.test.ts |
| 2 | INT-FEEL-002 | Delete from the log | Task link cleared | integration | P0 | int.flows.test.ts |
| 3 Habits/Skills/Quit → Feelings | INT-FEEL-003 | Sources counted | habits 2, practice 1, quit 1, standalone 1 = all 5 | integration | P0 | int.flows.test.ts |
| 4 Feelings → Journaling | INT-JRN-001 | Colour then "Be more specific" | Saved word belongs to the colour; label shows both | component | P1 | int.journalFeeling.test.tsx |
| 4 | INT-JRN-002 | Change colour later | Word that no longer fits is cleared | component | P1 | int.journalFeeling.test.tsx |
| 4 | INT-JRN-003 | Wheel integrity | Every word in exactly one colour, unique ids | unit | P2 | int.journalFeeling.test.tsx |
| 5 Study/Book/Skills → Recap | INT-REC-001 | Time invested | study 75 + skills 30 + reading 40 + habit 20 = 165, each equal to the section's sum; untimed sessions add no minutes | integration | P0 | int.flows.test.ts |
| 5 | INT-REC-002 | Shared story | Feelings and Quit left out unless included | integration | P0 | int.flows.test.ts |
| 5 | INT-REC-003 | Hidden section | Gone from every Recap number | integration | P1 | int.flows.test.ts |
| 6 Habits ↔ analysis ↔ Recap | HAB-B1-* | Same numbers everywhere | (Stage B) | integration | P0 | habitPartB.test.ts |
| 7 Sleep ↔ Study audio | INT-AUDIO-001..004 | Shared engine | Each section has its own players; ending study keeps Sleep's rain; Sleep's stop/fade leaves study alone; no stacking. **Bug, fixed:** ending a study session stopped Sleep's sound of the same name, and Sleep's timer silenced study | integration | P1 | int.audioOwners.test.ts |
| 7 | – | Wind-down pulls tomorrow's tasks | Not built; nothing to test | – | – | – |
| 8 Budget ↔ Diet | INT-CUR-001 | Currencies | Each budget keeps its own; Diet's change touches none | integration | P1 | int.flows.test.ts |
| 8 | INT-CUR-002 | Decimals | 0.1 + 0.2 + 2.75 + 1.05 = 4.10 exactly | integration | P1 | int.flows.test.ts |
| 8 | NUM-*, BUD-C-004/005, DIET-C-003 | Decimal separators, Arabic digits, negatives | (Stage 3) | – | P0 | numberInput / screen tests |
| 9 Settings ↔ everything | INT-SET-001 | Week start | Date code, habit weeks and the weekly story reminder follow it | integration | P0 | int.flows.test.ts |
| 9 | INT-SET-002 | Time format | 24h / 12h everywhere | integration | P1 | int.flows.test.ts |
| 9 | INT-SET-003 | Sleep default timer | Applied, never changes a running timer | integration | P2 | int.flows.test.ts |
| 9 | (existing) | Notification toggles cancel/reschedule | notificationSettings.test.ts | integration | P0 | notificationSettings.test.ts |
| 10 Account ↔ data | (existing) | Sign out keeps data; delete account keep/don't keep; offline; trial end; resubscribe | authStore, accountPrivacy, paywallBilling tests. Two devices and RLS: Stage 5 | integration | P0 | existing files |
| 11 Entitlement ↔ UI | (existing) | Every state; only sync gated; paywall never at launch; 7-day rule | entitlement, paywallBilling, planScreen tests | integration | P0 | existing files |
| 12 Delete cascade | INT-DEL-001 | Tag | Removed from tasks/templates; Insights fine; feeling keeps the name it was logged with | integration | P0 | int.flows.test.ts |
| 12 | INT-DEL-002 | Habit | Check-ins go; feelings labelled "From a deleted habit"; Recap stops counting | integration | P0 | int.flows.test.ts |
| 12 | INT-DEL-003 | Skill | Sessions and Recap minutes go; feelings labelled | integration | P0 | int.flows.test.ts |
| 12 | INT-DEL-004 | Book | Quotes and sessions go; reading minutes leave Recap | integration | P0 | int.flows.test.ts |
| 12 | INT-DEL-005 | Quit habit | Tracks and moments go; feelings labelled | integration | P0 | int.flows.test.ts |
| 12 | INT-DEL-006 | Task with a feeling | Feeling labelled "From a deleted task" | integration | P1 | int.flows.test.ts |
| 12 | INT-PLAN-006..009 | Plan / step | (above) | integration | P0 | int.planDaily.test.ts |
| 13 Export | INT-EXP-001 | Counts match | Every array in every section matches | integration | P0 | int.flows.test.ts |
| 14 Demo isolation | (existing) | Real data byte-for-byte unchanged; zero network | demoIsolation, demoEdgeCases | integration | P0 | existing files |
| 10 Account ↔ data | SYNC-ACC-001..009 | Signing in keeps your data in your account | No answer yet: on, recorded with date, wording version and screen; "off" stays off (also after a reinstall); server missing 0007/0008: nothing turns on and Settings says why; network failure: nothing changes, retried on return; accounts from before the sentence see it once (OK / Turn off, recorded as "notice"); Settings changes saved to the account; demo and space switches never change it | integration | P0 | accountConsent.test.ts |
| 10 | SYNC-ACC-010/011 | Restoring never needs a subscription | Without access sync still downloads (only sending is off); a reinstall gets its data back; its new entries are sent once access returns | integration | P0 | accountConsent.test.ts |
| 10 | JRN-SYNC-001..006 | Journeys with the real start-up, sign-in, consent, trial and sync code (server faked) | Sign in and write: sent by itself; uninstall, reinstall, sign in: data back by itself; server missing the update: nothing sent, reason shown; signed-out data goes up at sign-in; off in Settings: nothing more sent and stays off on another phone; turning off mid-upload stops further batches at once | integration | P0 | journeySignIn.test.ts |
| 10 | AUTH-C-001..004 | Sign-in screen | Buttons say "Sign in / Create account and sync my data"; the sentence under the email button and under Google's (wording unchanged), in both modes; no box; separate from Terms; the screen is recorded before signing in | component | P0 | AuthScreen.test.tsx |
| 10 | JRN-SYNC-007..010 | Sync without tapping anything | Add something and leave Ona at once: it's in the account; changes that keep coming go up within 10 s; a change during a sync is sent right after; a single change goes up ~3 s later. **Bug, fixed:** only Sync now uploaded in practice | integration | P0 | journeySignIn.test.ts |
