# Test cases: section screens and stores (Stage 3)

Component tests use React Native Testing Library 14 with the real stores and in-memory storage, a set clock, and each screen inside the app's own providers (`src/test-utils/render.tsx`). Every other route is a stub, so "it opened X" can be asserted.

| ID | Area | Title | Preconditions | Steps | Test data | Expected result | Type | Priority | Automated? (file) |
|---|---|---|---|---|---|---|---|---|---|
| BUD-C-001 | Budget | Empty state | No budgets | Open Budget | – | Calm empty line, "See how this works", New budget | component | P1 | BudgetScreen.test.tsx |
| BUD-C-002 | Budget | Create a limit, log an expense | – | Create, log 45.5 | 200 | "Spent $45.50 of $200.00", "$154.50 remaining" | component | P0 | BudgetScreen.test.tsx |
| BUD-C-003 | Budget | Validation | – | Blank name; negative amount | "   ", "-5" | Create disabled | component | P1 | BudgetScreen.test.tsx |
| BUD-C-004 | Budget | Decimal comma | – | Create with "12,50" | – | 12.50 saved. **Bug, fixed:** was rejected (Create stayed off) | component | P0 | BudgetScreen.test.tsx |
| BUD-C-005 | Budget | Arabic-Indic digits, Arabic name | – | "١٢٠٫٥", "مصاريف البيت" | – | 120.5 saved, name shown. **Bug, fixed** | component | P0 | BudgetScreen.test.tsx |
| BUD-C-006 | Budget | Default currency after closing the form | Default EGP | Open, close, create | – | EGP. **Bug, fixed:** reset to USD | component | P1 | BudgetScreen.test.tsx |
| BUD-C-007 | Budget | Delete asks first; cascade | Budget with an entry | Cancel, then Delete | – | Kept, then budget and entries removed. **Bug, fixed:** trash had no label | component | P0 | BudgetScreen.test.tsx |
| BUD-C-008 | Budget | Over a limit | 130 of 100 | Open | – | "A gentle heads-up", "No judgment", "$30.00 over" | component | P1 | BudgetScreen.test.tsx |
| BUD-C-009 | Budget | Long name and emoji | – | – | 240 chars + ✈️ | Shown | component | P2 | BudgetScreen.test.tsx |
| BUD-C-010 | Budget | Survives a relaunch | – | Save, clear memory, reload | – | Same budget and entry | integration | P0 | BudgetScreen.test.tsx |
| BUD-C-011 | Budget | Largest text, dark theme | – | Create | – | Works | component | P1 | BudgetScreen.test.tsx |
| NUM-001..004 | All number fields | Numbers as people type them | – | – | "12,50", "1.234,50", "١٢٠٫٥", "۱۲۰", junk | Correct values; junk is NaN; whole-number fields reject decimals | unit + property | P0 | numberInput.test.ts |
| DIET-C-001 | Diet | Empty day | – | Open | – | All four meal slots | component | P1 | DietPlanningScreen.test.tsx |
| DIET-C-002 | Diet | Plan a meal with a cost | – | Add lunch | 4.5 | Shown with $4.50; saved | component | P0 | DietPlanningScreen.test.tsx |
| DIET-C-003 | Diet | Decimal comma cost | – | "12,50" | – | 12.5. **Bug, fixed:** was saved as NaN (then lost) | component | P0 | DietPlanningScreen.test.tsx |
| DIET-C-004 | Diet | Non-number cost | – | "cheap" | – | Left empty, never NaN | component | P1 | DietPlanningScreen.test.tsx |
| DIET-C-005 | Diet | Arabic name, Arabic digits | – | "فول مدمس", "٢٥" | – | Saved as 25 | component | P1 | DietPlanningScreen.test.tsx |
| DIET-C-006 | Diet | Edit, then delete after confirming | A meal | – | – | Renamed; deleted | component | P0 | DietPlanningScreen.test.tsx |
| DIET-C-007 | Diet | Summary total = sum of the week | 3 meals | Summary | – | $14.50 | component | P0 | DietPlanningScreen.test.tsx |
| DIET-C-008 | Diet | Grocery: add, tick, remove | – | – | – | Works with labelled checkbox and remove. **Bug, fixed:** icon buttons had no labels | component | P1 | DietPlanningScreen.test.tsx |
| DIET-C-009 | Diet | Blank grocery item | – | "   " | – | Not added | component | P2 | DietPlanningScreen.test.tsx |
| DIET-C-010 | Diet | Survives a relaunch | – | – | – | Meals and list kept | integration | P0 | DietPlanningScreen.test.tsx |
| CAT-C-001..003 | Catch a Thought | Capture, filter, blank | – | – | – | Shown; filters work (now labelled radios); blank saves nothing | component | P1 | CatchAThoughtScreen.test.tsx |
| CAT-C-004 | Catch a Thought | Unsaved-changes prompt | Text typed | Close | – | Discard drops it, Save keeps it | component | P0 | CatchAThoughtScreen.test.tsx |
| CAT-C-005 | Catch a Thought | Promote to a plan | A thought | Promote | – | Plan created and opened | component | P1 | CatchAThoughtScreen.test.tsx |
| CAT-C-006 | Catch a Thought | Add to journal (new entry) | No entry today | Add | – | New entry is neutral ("okay"). **Bug, fixed:** was marked "Tense" | component | P0 | CatchAThoughtScreen.test.tsx |
| CAT-C-007 | Catch a Thought | Add to an existing entry | Entry today | Promote | – | Colour and text kept, appended | integration | P1 | CatchAThoughtScreen.test.tsx |
| CAT-C-008 | Catch a Thought | Delete asks first | – | Cancel, Delete | – | Works (Delete now a labelled button) | component | P0 | CatchAThoughtScreen.test.tsx |
| CAT-C-009/010 | Catch a Thought | Arabic/emoji/long text; relaunch | – | – | 600+ chars | Kept exactly; survives | component | P1 | CatchAThoughtScreen.test.tsx |
| JRN-C-001..007 | Journaling | Empty day, list order, tags, streak and words, Arabic search, On this day, opening an entry, lock row, relaunch | – | – | – | As described | component | P0–P2 | JournalingScreen.test.tsx |
| JRN-LOCK-001 | Journaling | Lock hides the writing | Lock on | Render | – | Content not rendered until unlocked. **Why:** privacy | component | P0 | JournalingScreen.test.tsx |
| JRN-LOCK-002 | Journaling | Re-lock after leaving the app | Unlocked | Away 29.999 s, then 30 s | – | Stays open, then locks | component | P0 | JournalingScreen.test.tsx |
| JRN-LOCK-003 | Journaling | Lock off | – | Render | – | Shown | component | P1 | JournalingScreen.test.tsx |
| SKL-S-001..012 | Skills | Store: name-only skill, sessions with/without timer, past-midnight session, metric values, redefining a metric, milestones, resources, levels, reminders scheduled/replaced/cancelled, archive, delete cascade, Arabic, relaunch | – | – | – | As described | integration | P0–P2 | skillsStore.test.ts |
| SCR-001 | All sections | Every screen opens empty | – | Render 15 screens | – | Each renders content | component | P0 | allScreens.test.tsx |
| SCR-002 | All sections | Dark theme + largest text | – | Render 15 screens | – | No crash | component | P1 | allScreens.test.tsx |
| SCR-003 | All sections | Long Arabic + emoji content | Data in 5 sections | Render 15 screens | – | No crash | component | P1 | allScreens.test.tsx |
| A11Y-001 | All screens | Every icon-only button has a label | – | Scan all `.tsx` | – | None missing. **Bug, fixed:** 75 had none | meta | P1 | a11yIconButtons.test.ts |
