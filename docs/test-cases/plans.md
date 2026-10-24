# Test cases: Essentials mode, Plus trial and Plus

The rules live in one file, `src/config/plans.ts`. Everything that describes or enforces a mode reads from it: Settings → Plan & usage, the plans sheet, the lock cards, the tour, banners, and the store text (`planDescriptionText()`).

Names: **Plus** (the full mode), **Plus trial** (the first 30 days, all features on), **Essentials mode** (after the trial, without Plus). Never "free version", "expired", "downgrade" or "limited".

Rules: nothing you made is ever hidden, locked or deleted; limits apply only to creating more or going deeper. Quit, crisis and support resources, and the data export are never limited. Demo mode shows everything.

| ID | Area | Title | Expected | Type | Priority | Automated? (file) |
|---|---|---|---|---|---|---|
| PLAN-CFG-001 | Config | Every Plus feature is enforced | Each `PlusFeatureId` is used by a lock card, explanation, Plus action or the sync gate | unit | P0 | plansConfig.test.ts |
| PLAN-CFG-002 | Config | Every cap is checked | Each cap has a `guard('<cap>')` where items are created; Diet uses the meal-date guard | unit | P0 | plansConfig.test.ts |
| PLAN-CFG-003 | Config | The comparison covers everything | Every Plus feature and every cap appears in the comparison, and nothing else | unit | P0 | plansConfig.test.ts |
| PLAN-CFG-004 | Config | Comparison numbers are the caps | Each capped row shows the number from `FREE_CAPS` | unit | P1 | plansConfig.test.ts |
| PLAN-CFG-005 | Config | No prices, no claims Ona can't back | No currency, percentage or period; no encryption, photo sync or health claims; the store text says the trial length | unit | P0 | plansConfig.test.ts |
| PLAN-CFG-006 | Config | Never capped | No Quit cap; Quit unlimited; support always; data export always; Quit's PDF stays free | unit | P0 | plansConfig.test.ts |
| PLAN-CFG-010 | States | The trial is Plus to its last minute | Plus during the trial and in its last minute; Essentials mode after it and with no account; the demo shows everything | unit | P0 | plansConfig.test.ts |
| PLAN-CFG-011 | Caps | At a cap | Essentials mode can't create one more; Plus can | unit | P0 | plansConfig.test.ts |
| PLAN-CFG-012 | Caps | Over a cap after the trial | Nothing is deleted or changed; archiving makes room | unit | P0 | plansConfig.test.ts |
| PLAN-CFG-013 | Diet | Plan up to next week | Up to the end of next week allowed, later not; past weeks stay editable; Plus has no horizon | unit | P0 | plansConfig.test.ts |
| PLAN-CFG-014 | States | Every store state maps to a mode | Plus for trial, subscribed, canceled-but-active, grace, lifetime; Essentials mode for the rest | unit | P0 | plansConfig.test.ts |
| NAME-001 | Naming | The three sentences | Exactly the wording in the config | unit | P0 | planNaming.test.ts |
| NAME-002 | Naming | No banned words | No "free version", "expired", "downgrade" or "limited" in any text a person can read | unit | P0 | planNaming.test.ts |
| NAME-003 | Naming | No other names | No "Free", "Premium", "free trial", "trial ended" etc. as a mode name (helplines excepted) | unit | P0 | planNaming.test.ts |
| NAME-004 | Naming | Plan & usage and Account | Every state titled Plus trial, Plus or Essentials mode | unit | P0 | planNaming.test.ts |
| NAME-005 | Naming | Banners | Trial-ending and trial-over notices use the same names | unit | P1 | planNaming.test.ts |
| NAME-006 | Naming | Comparison, store text, tour | All use the names from the config | unit | P1 | planNaming.test.ts |
| PLAN-MAN-001 | Device | Lock cards look calm | In Essentials mode, Recap/Feelings/Planning insights show a titled card with one line and "See Plus"; no blurred numbers, no countdown | manual | P1 | manual |
| PLAN-MAN-002 | Device | Over a cap | With 5 plans after the trial, all 5 open and edit; New Plan explains once and offers "Not now" | manual | P1 | manual |
