# Test cases: the server (Stage 5)

These run against a **local** Supabase stack in Docker, built from `supabase/migrations`. They never touch the hosted project: `supabase/tests/globalSetup.js` refuses any API URL that isn't `127.0.0.1` or `localhost`, and the only keys used are the local stack's built-in ones (read from `supabase status`).

They need the server's real clock, because the server's own time is what they test (trial length, expiry). They are the only tests that do.

## How to run

```
npx supabase start                     # Docker must be running
npx supabase functions serve revenuecat-webhook --no-verify-jwt --env-file supabase/tests/webhook.env   # second terminal
npm run test:backend                   # resets the local DB from the migrations, then runs supabase/tests
npx supabase stop
```

`npm test` doesn't include these, so it still needs no Docker.

Every test creates its own new accounts, so no test depends on another one.

| ID | Area | Title | Preconditions | Steps | Expected | Type | Priority | Automated? (file) |
|---|---|---|---|---|---|---|---|---|
| BE-RLS-001 | Privacy | One profile per sign-up | New accounts A and B | Read profiles as B | Exactly one profile row each; B sees only its own | backend | P0 | rls.test.ts |
| BE-RLS-002 | Privacy | No reading across accounts | A has a row in every table | B selects from every table | B gets `[]` from all 22 tables; A gets its own row | backend | P0 | rls.test.ts |
| BE-RLS-003 | Privacy | No writing in someone else's name | As above | B inserts rows with `user_id = A` | Refused (42501) in every table | backend | P0 | rls.test.ts |
| BE-RLS-004 | Privacy | No changing or deleting another's rows | As above | B updates and deletes filtered on A's id | 0 rows touched; A's rows unchanged | backend | P0 | rls.test.ts |
| BE-RLS-005 | Privacy | No handing a row to someone else | B has rows | B sets `user_id = A` on its own rows | Refused | backend | P1 | rls.test.ts |
| BE-RLS-006 | Privacy | Raw REST with a valid token | As above | GET/PATCH/DELETE `…?user_id=eq.A` with B's token | `[]` each time; A's data unchanged | backend | P0 | rls.test.ts |
| BE-RLS-007 | Privacy | Not signed in | A has data | Anon key only: select, insert, call every function | Nothing read; insert and all four functions refused | backend | P0 | rls.test.ts |
| BE-RLS-008 | Billing | No self-granted access | New account | Insert a trial or a lifetime subscription; extend the trial; touch webhook records | All refused or no effect | backend | P0 | rls.test.ts |
| BE-RLS-009 | Privacy | No asking about another account's access | A subscribed | B calls `has_sync_access(A)` | `false` (A asking about itself: `true`). **Bug, fixed** | backend | P2 | rls.test.ts |
| BE-TRIAL-001 | Trial | Trial starts on the server's clock | New account | `start_trial()` | Newly started; ends exactly 30 days after it began; begins at the server's "now" | backend | P0 | entitlement.test.ts |
| BE-TRIAL-002 | Trial | One trial per account | Trial started | Call again (reinstall, second phone) | Not restarted; same end date; one row | backend | P0 | entitlement.test.ts |
| BE-TRIAL-003 | Trial | Never trialled | New account | `get_entitlement()` | Empty trial and subscription; the app reads "no sync" | backend | P1 | entitlement.test.ts |
| BE-TRIAL-004 | Trial | App reads the server answer | Trial started | `computeEntitlement` on the answer | "trial", 30 days left, sync allowed | backend | P1 | entitlement.test.ts |
| BE-GATE-001 | Gating | No access, no sync writes | New account | Write a sync record | Refused | backend | P0 | entitlement.test.ts |
| BE-GATE-002 | Gating | Trial allows sync | Trial | Write | Accepted | backend | P0 | entitlement.test.ts |
| BE-GATE-003 | Gating | Trial over: data never held hostage | Trial, one record, then trial ended | Write new; edit; read; delete | Writes and edits refused; read and delete work | backend | P0 | entitlement.test.ts |
| BE-GATE-004 | Gating | Every subscription state | One account per state (11) | Write; ask the app's rule | Server and app agree: active-paid, canceled-with-time-left, grace and lifetime allow; ended periods, on hold, paused, expired and refunded don't | backend | P0 | entitlement.test.ts |
| BE-GATE-005 | Gating | Trial over but subscribed | Both | Write | Accepted | backend | P1 | entitlement.test.ts |
| BE-SYNCROW-001 | Sync | Newer change wins | Trial | Write at t−60s, t−30s, then a late t−45s | The t−30s version stays | backend | P0 | entitlement.test.ts |
| BE-SYNCROW-002 | Sync | Phone clock far ahead | Trial | Write dated 2099 | Capped at server time + 5 min; a later normal change still wins | backend | P1 | entitlement.test.ts |
| BE-SYNCROW-003 | Sync | Pull cursor set by the server | Trial | Write with a fake `server_updated_at` | The server's own time is stored | backend | P1 | entitlement.test.ts |
| BE-SYNC-001 | Sync | Add on phone A, see it on phone B | One account, two phones | A syncs; B syncs | B has the same tasks and journal entry | backend | P0 | sync.test.ts |
| BE-SYNC-002 | Sync | Edit and delete travel | Both synced | B edits one and deletes one; both sync | A shows the edit and the deletion; server marks the deleted one | backend | P0 | sync.test.ts |
| BE-SYNC-003 | Sync | Same item edited on both offline | Both synced | Both edit; sync twice each | Both phones and the server hold the same version | backend | P0 | sync.test.ts |
| BE-SYNC-004 | Sync | Reminder ids stay on the phone | Task with a scheduled reminder | Sync; pull on B | No reminder id on the server; B gets an empty list to schedule its own | backend | P1 | sync.test.ts |
| BE-SYNC-005 | Sync | More than one page | 620 thoughts | A pushes (4 batches); B pulls (2 pages) | All 620 arrive | backend | P1 | sync.test.ts |
| BE-SYNC-006 | Privacy | Two accounts | A and B | A syncs a journal entry; B syncs | B receives nothing | backend | P0 | sync.test.ts |
| BE-SYNC-007 | Sync | Phone of another account | Phone synced with A | Sync as B | Refused before anything is sent | backend | P0 | sync.test.ts |
| BE-SYNC-008 | Gating | Access ends mid-use | Synced, then trial ended | Add a task; sync; new phone syncs | "Sync access has ended on the server."; the task stays on the phone; a new phone can still pull | backend | P0 | sync.test.ts |
| BE-DEL-001 | Deletion | Delete the server copy | A and B with a row in every table | A: `delete_my_server_data()` | All A's rows in 20 tables gone; account and trial kept; B untouched | backend | P0 | deletion.test.ts |
| BE-DEL-002 | Deletion | Delete my account | As above, plus A's subscription | A: `delete_my_account()` | Account, profile, trial, subscription and every row gone; B untouched | backend | P0 | deletion.test.ts |
| BE-DEL-003 | Deletion | Old token after deletion | Account deleted | Write with its token | Refused; nothing stored | backend | P0 | deletion.test.ts |
| BE-DEL-004 | Deletion | Twice in a row | – | Call each function twice | No error | backend | P2 | deletion.test.ts |
| BE-WH-001 | Webhook | Wrong or missing Authorization | – | POST a purchase | 401; nothing stored | backend | P0 | webhook.test.ts |
| BE-WH-002 | Webhook | Method and body | – | GET; non-JSON; event without fields | 405; 400; 400 | backend | P1 | webhook.test.ts |
| BE-WH-003 | Webhook | Purchase then expiry | New account | INITIAL_PURCHASE; EXPIRATION | Active and sync allowed; then expired and refused | backend | P0 | webhook.test.ts |
| BE-WH-004 | Webhook | Same event twice | Purchased, then canceled | Redeliver the purchase | "duplicate"; still canceled | backend | P0 | webhook.test.ts |
| BE-WH-005 | Webhook | Out of order | – | Newer EXPIRATION, then older PURCHASE | Stays expired | backend | P0 | webhook.test.ts |
| BE-WH-006 | Webhook | Billing trouble | Purchased | BILLING_ISSUE with grace; then without | Grace keeps sync; on hold ends it | backend | P1 | webhook.test.ts |
| BE-WH-007 | Webhook | Lifetime | – | Lifetime purchase; EXPIRATION; support refund | Survives expiry; refund ends it | backend | P1 | webhook.test.ts |
| BE-WH-008 | Webhook | Not ours | – | Other entitlement; anonymous buyer; TEST | Skipped; nothing stored | backend | P2 | webhook.test.ts |
| BE-WH-009 | Webhook | Renewal for a deleted account | Purchased, account deleted | RENEWAL | Acknowledged (200) and recorded, so RevenueCat stops retrying. **Bug, fixed:** it failed with a 500 and would be retried forever | backend | P1 | webhook.test.ts |
| BE-CON-001 | Sync consent | Answer kept with the account | New account | Read; set yes; read | Starts unanswered (null); yes is saved and read back | backend | P0 | consent.test.ts |
| BE-CON-002 | Privacy | Nobody else's answer | A said yes | B reads and changes A's answer (client and raw REST) | B sees nothing and changes nothing | backend | P0 | consent.test.ts |
| BE-CON-003 | Privacy | Not signed in | A said yes | Anon reads and changes | Nothing read or changed | backend | P1 | consent.test.ts |
