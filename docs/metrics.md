# Numbers shown in more than one place

Every number Ona shows in Recap and in a section is defined once, in `src/metrics/registry.ts`: a name, what it counts, and one count over a date range. Recap counts its period; a section counts its own scope. Both call the same function.

**Why:** on a phone (2026-10-29) Recap said "Clean days: 5" and Quit said "8 clean days". Both were true (this week vs the whole journey) but nothing said so, and they were counted by two different rules.

## The rules

- **One definition.** A new number shown in two places goes in `METRICS`. No screen counts it by itself.
- **Every label says its scope.** Recap: "Clean days this week", "that month", "today", "in this range". Sections: "8 clean days in total". A row with its own scope (a budget's own period, where a plan stands now) is marked `ownScope`.
- **"In total"** is the same count from the beginning to today. Planned things (meals) count ahead too.
- **The phone's own day.** Dates from timestamps use `localDateOf`, never a UTC slice.
- **Same scope, same number.** Recap over the whole history equals the section's "in total" exactly. A Recap period is never more than the total.

## Tests

`src/utils/__tests__/metricRegistry.test.ts` (METRIC-*) runs over the real seed, also in two far-apart time zones in CI. `supabase/tests/realAccount.test.ts` BE-REAL-011 checks the same numbers after a restore on a fresh phone. On a phone: MAN-120 (must-pass).

## Numbers that look alike but aren't the same metric

- **Book:** the section shows the page you're on; Recap shows pages read in sessions. Different numbers, different labels ("Page 120 of 300" vs "Pages read this week").
- **Budget:** a budget's own period, not Recap's (marked `ownScope`).
- **Tasks:** Recap and Planning insights use the same occurrence and done rules (`taskAppliesToDate`, `resolveTaskDone`); insights label each week by its dates.
- **Sleep:** the section shows a 7-night average quality; Recap shows nights logged and rested nights in its period. No shared number.
