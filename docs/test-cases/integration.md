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
| 10 | JRN-ACC-001..006 | Signing in with data on this phone (merge flow) | Empty account: the phone's data becomes the account's, no question. Data in both: asked first, with both counts; nothing sent or received until answered (also after a restart). Merge: everything from both. Keep separate: the account's data here, this phone's kept aside, never sent, back after sign-out with Remove. Use the account's data only: a copy kept and listed until brought back or removed. **Before:** merged silently | integration | P0 | journeyAccounts.test.ts |
| 10 | JRN-ACC-010..013 | Another account on the same phone | A's data, B signs in: asked, never added by default, nothing of A reaches B. Keep separate: B's data here, A's kept aside; A's own data comes back when A signs in again on an empty phone. Add to this account: only when chosen. Empty phone: B's data comes down, no question. **Before:** sync stopped with "delete the data on this device first" | integration | P0 | journeyAccounts.test.ts |
| 10 | JRN-ACC-020..022 | Signing out | Unsent changes counted and offered a sync first; "Remove my data from this phone" only when nothing would be lost; removing empties the phone and the account keeps everything; signing in again brings it back; Keep (default): the same account just syncs | integration | P0 | journeyAccounts.test.ts |
| 10 | JRN-ACC-030..034 | The hold while the phone's data changes (space lock) | A sync fired while data is put aside, during sign-out with Remove, or while switching accounts sends and brings back nothing it shouldn't; if the data changes mid-sync, the rest isn't sent and nothing is written back; whatever is chosen, nothing anyone made is deleted | integration | P0 | journeyAccounts.test.ts |
| 10 | JRN-ACC-040 | Reminders follow the data | Data put aside stops ringing; brought back, reminders are scheduled again | integration | P1 | journeyAccounts.test.ts |
| 10 | JRN-ACC-050..052 | The choice sheet | Both counts; Merge / Keep separate first and recommended; Decide later keeps the choice waiting | component | P1 | AccountChoiceSheet.test.tsx |
| 7 Sleep ↔ notifications | REM-001..003 | Wake-up reminder sound | Scheduled daily with the chosen sound and its channel; without one, the Settings default; changing sound or time replaces it; off leaves nothing scheduled | integration | P0 | sleepReminder.test.ts |
| 7 | REM-010/011 | Android channels | One channel per sound on the alarm volume, high importance, on the lock screen, versioned ids; one-time move reschedules every reminder then removes the old channels, never twice | integration | P0 | sleepReminder.test.ts |
| 7 | REM-020..022 | Honest wording | No reminder called an alarm, no fade-in or ring-until-dismissed claim; the phone-clock sentence next to Sleep, task and Settings reminder sounds; exact-timing permission declared | unit | P1 | sleepReminder.test.ts |
| 5 Every section → Recap | RECAP-REG-001..003 | Recap registry | Every section (15) has one contributor in an area; empty: calm and empty; logging in each section shows in its card and the Home tile; deleting takes it away | integration | P0 | recapRegistry.test.ts |
| 5 | RECAP-REG-004, 020, 050 | Same numbers, edits, ranges | An edit changes the number; Skills match the Skills breakdown; a month includes its last day | integration | P1 | recapRegistry.test.ts |
| 5 | RECAP-REG-010/011 | Quit in Recap | Days on the journey, urges ridden out and new chapters come from quitJourneySeries; a slip is a new chapter, never failing | integration | P0 | recapRegistry.test.ts |
| 5 | RECAP-REG-030, 040 | Privacy and no ranking | Feelings and Quit on Home by default, hidden with "Hide sensitive areas on Home", out of the shared story unless included; no busiest / most / best | integration | P0 | recapRegistry.test.ts |
| 5 | RECAP-C-001..003 | Recap on screen | Quit under Grow and its card on the Grow page; hidden with the setting; a thought caught elsewhere appears at once | component | P0 | RecapScreen.test.tsx |
| 2 Every source → Feelings | FEEL-SRC-000..007 | A feeling from anywhere appears everywhere | Standalone, task, habit, skill, Quit, study and book: in the log, graph, Analysis (All and its own group) and Recap; after reopening Ona; on another phone after sync; every source kind is covered | integration | P0 | feelingSourcesContract.test.ts |
| 2 | FEEL-SRC-001..003 | One way to save a feeling | Every screen saves through logFeeling() (guard on screens and components); the first feeling already shows in Analysis with its count; no analytics event about feelings, zones, tags or the journal | integration | P0 | feelingSourcesContract.test.ts |
