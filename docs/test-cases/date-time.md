# Test cases: dates, time and analysis maths (Stage 2)

All automated. Every test runs in America/New_York (daylight saving on 8 March and 1 November 2026) with the clock set by `useClock()`; zone checks run in six zones. The test names in the files start with these IDs.

| ID | Area | Title | Preconditions | Steps | Test data | Expected result | Type | Priority | Automated? (file) |
|---|---|---|---|---|---|---|---|---|---|
| HAB-DATE-001 | Habits | Day count across the spring DST change | Habit started 1 Mar 2026 | Read "Day N" on 7, 8, 10 Mar and 1 Jun | – | 7, 8, 10, 93. **Why:** rounding down a 1-hour-short span lost a day for half the year (bug, fixed) | unit | P0 | dstDayCounts.test.ts |
| HAB-DATE-002 | Quit | Track day count across the spring change, store and Analysis | Track started 1 Mar | Read on 10 Mar | – | 10 in both places (was 9). Bug, fixed | unit | P0 | dstDayCounts.test.ts |
| HAB-DATE-003 | Quit | Finished track spanning the change | Track 5–12 Mar, archived | Read length | – | 8 days (was 7). Bug, fixed | unit | P0 | dstDayCounts.test.ts |
| HAB-DATE-004 | All | Day of the year has no repeats | – | Walk 2026 | 365 dates | 0…364, all different (8 and 9 Mar used to share one). Bug, fixed | unit | P1 | dstDayCounts.test.ts |
| BOOK-DATE-001 | Book, Skills | Weekly rotation changes every 7 days all year | 60 quotes | Compare consecutive days | 2026 | Changes exactly every 7th day, DST or not. Bug, fixed | unit | P2 | dstDayCounts.test.ts |
| DATE-P-001 | Dates | Adding days: inverse, composition, gap | – | Property | Any date 1990–2100 + tricky dates, ±1000 days | Always consistent. **Why:** every streak and range is built on this | property | P0 | dateProperties.test.ts |
| DATE-P-002 | Dates | Weekday after adding days | – | Property | as above | weekday + n mod 7 | property | P0 | dateProperties.test.ts |
| DATE-P-003 | Dates | Month length 28–31; day after last is the 1st | – | Property | incl. 29 Feb 2028 | Holds. **Why:** month-end and leap-day bugs | property | P0 | dateProperties.test.ts |
| DATE-P-004 | Dates | Adding months lands on the 1st, right distance | – | Property | ±60 months | Holds | property | P1 | dateProperties.test.ts |
| DATE-P-005 | Calendar | Month grid: every day once, under the right weekday | Any week start | Property | 7 week starts | Holds. **Why:** the calendars on 17 screens use it | property | P0 | dateProperties.test.ts |
| DATE-P-006 | Dates | Day of the year counts up with no repeats | – | Property | – | Holds | property | P1 | dateProperties.test.ts |
| DATE-P-007 | Weeks | A date's week starts on the chosen weekday, ≤6 days before | Week start 0–6 | Property | – | Holds. **Why:** Sunday vs Monday weeks | property | P0 | dateProperties.test.ts |
| DATE-P-010 | Ranges | A range lists every day once | – | Property | 0–400 days | Holds | property | P0 | dateProperties.test.ts |
| DATE-P-011 | Graph | Every day has its own x slot; the last day is the last slot | – | Property | 0–400 days | Holds. **Why:** the "graph stops at day 21" bug | property | P0 | dateProperties.test.ts |
| DATE-P-012 | Graph | By month: last month is the last slot | – | Property | 0–900 days | Holds | property | P1 | dateProperties.test.ts |
| DATE-P-013 | Graph | Month view covers days 25–31 | – | Property | Any month | Days 25, 27, 29 and the last day each have their slot | property | P0 | dateProperties.test.ts |
| DATE-P-014 | Recap | A week period is 7 days containing the anchor | Week start 0–6 | Property | – | Holds | property | P0 | dateProperties.test.ts |
| DATE-P-015 | Insights | Buckets cover a range with no gaps or overlaps | Day/week | Property | – | Holds. **Why:** totals must equal the sum of the bars | property | P0 | dateProperties.test.ts |
| DATE-P-016 | Insights | Month/quarter ranges run from a 1st to a month end | – | Property | – | Holds | property | P1 | dateProperties.test.ts |
| DATE-Z-001 | Dates | Local-time helpers agree in 6 zones, every day 2026–2028 | – | Run in UTC, New York, London, Kolkata, Auckland, Santiago | 1,096 days | No differences. **Why:** travel, and Santiago's DST change at midnight | unit (child process) | P0 | dateZones.test.ts |
| DATE-E-001 | Feelings | 23:59 vs 00:00 logging | Clock 23:59 | Log, advance 1 min, log | – | 18th, then 19th | integration | P0 | clockEdges.test.ts |
| DATE-E-002 | Habits | Ticked at 00:30 for "yesterday" | Clock 00:30 | Check in for the previous date | – | Kept on yesterday; counts for the streak | integration | P0 | clockEdges.test.ts |
| DATE-E-003 | Daily Planning | Done at 23:59 isn't carried over after midnight | Clock 23:59 | Add, tick, advance | – | Not "still open" | integration | P0 | clockEdges.test.ts |
| DATE-E-004 | Daily Planning | Unfinished task becomes "still open" after midnight | Clock 22:00 → 00:05 | Add task, move clock | – | Listed as still open | integration | P1 | clockEdges.test.ts |
| DATE-E-010 | Habits | Day number goes up by one at midnight, DST night included | Habit from 1 Mar | 23:59 on 7 Mar → 00:01 on 8 and 9 Mar | – | +1, +2 | integration | P0 | clockEdges.test.ts |
| DATE-E-011 | Quit | Autumn change (25-hour day) | Track from 25 Oct | Read on 1 Nov at 23:30 | – | 8 | unit | P1 | clockEdges.test.ts |
| DATE-E-012 | Habits | Milestone bar day equals the habit's day number | Habit from 20 Feb | Around the DST change | – | Equal every day | unit | P1 | clockEdges.test.ts |
| DATE-E-013 | Habits | Backfilled past days count for their own dates | Clock 18 Oct | Check in 15–17 Oct | – | Dates kept; streak 3 | integration | P1 | clockEdges.test.ts |
| DATE-E-020/021 | Habits | "3 a week" with Monday vs Sunday weeks | Done Sat–Tue | Read streak | – | Monday weeks 0, Sunday weeks 1. **Why:** the week start must change the result | unit | P0 | clockEdges.test.ts |
| DATE-E-030 | Habits | Streak through New Year and 29 Feb | – | Daily check-ins | 29 Dec–3 Jan; 27 Feb–1 Mar 2028 | 6 and 4 | unit | P0 | clockEdges.test.ts |
| DATE-E-031 | Quit | Track started 29 Feb | – | Read on 1 Mar | – | 2 | unit | P2 | clockEdges.test.ts |
| HAB-P-001 | Habits | Completion rate 0–100; all planned done = 100 | Any frequency | Property | up to 90 days | Holds | property | P0 | dateProperties.test.ts |
| HAB-P-002 | Habits | Current streak ≤ longest, never negative | Any frequency | Property | – | Holds | property | P0 | dateProperties.test.ts |
| HAB-P-003 | Habits | One more done day never shortens the longest streak | – | Property | – | Holds | property | P1 | dateProperties.test.ts |
| HAB-P-004 | Habits | Day pattern: one cell per day, matches check-ins | – | Property | – | Holds | property | P0 | dateProperties.test.ts |
| HAB-P-005 | Habits | Weekly rates 0–100, done ≤ planned | Scheduled habits | Property | – | Holds | property | P1 | dateProperties.test.ts |
| HAB-P-006 | Habits | Milestone bar only moves forward, 0–1, reached markers first | – | Property | targets 7–400 | Holds | property | P1 | dateProperties.test.ts |
| TASK-P-001/002 | Daily Planning | Daily and weekly repeats | – | Property | – | Every day from start / same weekday each week | property | P0 | dateProperties.test.ts |
| FEEL-P-001 | Feelings | Analysis counts add up, in zone order, no ranking or causal words | – | Property | 1–40 random entries | Holds | property | P0 | dateProperties.test.ts |
| FEEL-P-002 | Feelings | Wording level only grows with entries | – | Property | 1–500 | 1–2 facts, 3–6 "so far", 7+ | property | P1 | dateProperties.test.ts |
| FEEL-G-001 | Feelings | Days 25, 27, 29 and month end plotted at their own day | Feb (normal and leap), Apr, Oct | Build points | – | All present, at day − 1. **Why:** the cut-off bug | unit | P0 | feelingsGraph.test.ts |
| FEEL-G-002 | Feelings | Year view includes December at slot 12 | – | – | 1 Jan, 31 Dec | Holds | unit | P1 | feelingsGraph.test.ts |
| FEEL-G-003 | Feelings | Custom range across New Year, by month | – | – | Nov–Feb | Every month in order | unit | P1 | feelingsGraph.test.ts |
| FEEL-G-004 | Feelings | Day point = average; empty days are gaps, not zero | – | – | – | Holds | unit | P1 | feelingsGraph.test.ts |
| FEEL-G-005 | Feelings | Axis labels: one per slot, last day labelled | – | Property | – | Holds | property | P2 | feelingsGraph.test.ts |
| FEEL-G-010/011 | Feelings | Nearest zone; smoothing stays within range | – | Property | – | Holds | property | P2 | feelingsGraph.test.ts |
| FEEL-G-020 | Feelings | "Heavier than usual" note from the 8th day in 14 | – | – | 7/8 days, old days, same day | Shows only at 8 distinct recent days | unit | P0 | feelingsGraph.test.ts |
| ENT-P-001 | Plan & usage | Moving the phone clock can't extend the trial | Snapshot from server | Property | drift ±30 days | "Now" never before the server's time | property | P0 | dateProperties.test.ts |
| TEST-001 | Tests | No test reads the real clock without setting it | – | Scan all test files | – | None | meta | P1 | noRealClock.test.ts |
