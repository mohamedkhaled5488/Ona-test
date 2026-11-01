# Status board

Updated 2026-11-01. What each spec asked for, where it stands, and what is open. **Blocks** marks anything that stops a tester build or the App Store submission.

## Specs

| Spec | Status | Open |
|---|---|---|
| Craving toolkit (steps 1–6) | Done | The four new activities (mandala colouring, watch the clouds, sand/bubble toy, writing prompt) are on hold until the owner says go |
| Every feeling in the Feelings log | Done | — |
| Three problems from a real phone (Back, journal feelings and tags, Recap vs Quit numbers) | Done; CI and E2E green on c776610 | Phone check of the journal feeling after the next APK (MAN-119) |
| Metric registry (one definition per number) | Done | — |
| Part C: held sections invisible | Done | — |
| Reflection, Letters to Myself, Support for this feeling | Built, wired, tested; **held** until the owner's final review | See below |

## Reflection, Letters, Support: the open items

| Item | Owner | Blocks? |
|---|---|---|
| Clinician or psychologist review of all content (`docs/support-content-review.md`): most of all the danger card and its phrases, hard-feeling mode, every [heavy] piece, Low and Tense, the heaviest words, Deep questions | Owner to arrange | **Blocks** turning these sections live (not a tester build without them) |
| Names: "Reflection" is too ordinary a word (it is also the Reflect folder's name); proposal "Ask Myself". "Support for this feeling" or "Help with this feeling". "Letters to Myself" | Owner | Blocks going live |
| `ona-design-philosophy.md`: not in the repo; the work followed the rules in the spec | Owner to share | No |
| Turning them live: one line each in `src/data/sectionsMeta.ts` (`status: 'live'`); then the Settings words about sensitive areas name Reflection and Letters too | Claude, after the owner's yes | — |
| Maestro flows for the three sections (Back key, a letter offered, Support for Low) | Claude, once live | No |
| Plus "What tends to help you" (Support) in Feelings Analysis | Not built; decide whether to build it | No |
| Reflection content: more closing questions per theme and depth; the other ten themes' questions (12 per depth each) | Claude, after the tone review | Blocks the five Essentials themes having questions (only two of the five are written) |
| Real-account test BE-REAL-012 (Reflection, Letters, Support through a real account) | Added; its first run caught a wrong assumption in the test (a restored letter has an empty reminder list, not none), fixed | No |

## Earlier open items (unchanged)

| Item | Owner | Blocks? |
|---|---|---|
| Tester APK | Waits for migration 0009 confirmation and the staging project | **Blocks** a tester build |
| Staging project set up (nightly real-account tests) | Owner | **Blocks** a tester build (build gate) |
| Supabase: manual identity linking switched on | Owner | Blocks Google + email on one account |
| Apple Developer enrollment (iOS stages 2–6) | Owner | **Blocks** the App Store submission |
| Sleep sounds: listening notes on a real phone | Owner | No |
| Craving toolkit copy: clinician review (`docs/craving-toolkit-copy-review.md`) | Owner to arrange | Blocks a public release |

## CI

CI's backend job was red from 36eaccf (Part C) to f62162f: BE-REAL-005 pins the number of edited items from the seed, and removing the held sections' sample data changed them (15 edited to 14, 24 deleted to 22). Not a bug in Ona; the count is updated. The app's own tests were green throughout.
