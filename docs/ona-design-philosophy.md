# Ona — Design Philosophy: The North Star

This document sits above every other Ona spec file. Every section, every screen, every interaction should be checked against this before being considered finished. This is about *how* things are built, not *what* gets built — the feature list lives in the other spec files; this is the quality bar.

---

## The core principle, stated plainly

**Every section must genuinely help the user achieve what they came to that section for — and it must do this in a way that feels comfortable, not just functional, so the user *wants* to spend time there rather than merely tolerating it.**

Simplicity and richness are not opposites here. The app should be simple to *start* using and rich to *grow* into — never overwhelming on first touch, never shallow once someone's invested.

---

## What this means concretely, section by section

### 1. Every section needs its own "small win" moment
Data entry alone doesn't satisfy anyone. Each section must have a visible moment where the user *feels* they accomplished something, not just recorded something:
- **Plan Builder**: the progress bar filling in the plan's own chosen color
- **Habits**: the streak calendar, the milestone celebrations, the "why" resurfacing at exactly the right moment
- **Practice**: the first-session-vs-latest comparison — literally seeing your own growth
- **Identify the Feeling**: naming something precisely, with real guidance, instead of a vague mood tap
- **Recap**: the "best moment" tag, the activity heatmap filling in over time
- **Journaling**: "on this day" resurfacing — proof that past effort is remembered, not lost

If a section is ever built without one of these moments, that's a gap to fix, not a nice-to-have to skip.

### 2. Comfort is a design decision, not a byproduct
This is why the brand identity (stone/teal/amber palette, generous whitespace, Space Grotesk restrained to headings only) isn't decoration — it's functional. Concretely:
- **Generous spacing over density** — the LiveIt review lesson applies everywhere, not just Recap: cramped screens feel stressful regardless of how useful the content is
- **Forgiving interactions** — delete confirmations, unsaved-changes prompts, streaks that pause instead of reset, archived-not-deleted history. Comfort means never feeling one wrong tap away from losing something that mattered
- **Warm, human micro-copy** — never guilt-based language, never "you failed," always language a genuinely kind friend would use
- **The amber color stays rare** — reserved only for real milestones and highlights. Its scarcity is what makes it feel meaningful when it appears; overusing it would cheapen every moment it's meant to celebrate

### 3. "Want to spend time" must come from genuine value, never manipulation
This is an important, explicit line to hold: the goal is never to maximize time-in-app through dark patterns (infinite scroll, manufactured urgency, variable-reward addiction loops, guilt-based notifications). That would directly contradict Ona's entire compassionate design foundation — especially in a Habits/Quit-a-Habit section meant to help people, not exploit their attention.

Genuine enjoyment comes from:
- **Real usefulness** — the app actually helping someone think more clearly, feel steadier, or make progress
- **A sense of ownership** — it's *their* plan, *their* streak, *their* journal in *their* chosen color, not a generic template
- **Rare, earned delight** — small surprises used sparingly (a gentle animation on a milestone, a warm turn of phrase in a resurfaced memory) — not constant gamification that cheapens itself through overuse
- **Trust that nothing will be taken away** — someone spends more time somewhere they feel safe returning to, not somewhere they fear losing progress

### 4. The simple/rich balance, in practice
This is the same principle validated directly by real LiveIt reviews (Noi Dea's praise for being able to "only put in quick entries" *or* "fully customize... like creating a website"):
- **Every section needs a fast, frictionless default path** — someone should be able to do the simplest version of the thing (jot a quick plan, log one feeling, mark a habit done) in a few taps, no setup required
- **Depth is always available, never forced** — the flexible block editor, the substep breakdowns, the priority levels and resource fields exist for the person who wants them, sitting quietly out of the way for the person who doesn't
- **Multi-step guided flows over flat, crowded screens** — richness comes from a thoughtful sequence (pick → configure → do → see result), not from cramming every option onto one screen at once

### 5. Design polish is not separate from "features" — it IS the feature
When evaluating whether a section is done, the question isn't just "does this work correctly," it's "does this feel good to use." Concretely, this means:
- Smooth, non-jarring transitions between screens
- Consistent spacing and typography discipline across every section (no section should feel visually like a different app)
- Loading and empty states that feel intentional and warm, not broken or blank
- Every interactive element responding with clear, immediate feedback (a tap should always visibly register)

---

## The test for every screen before it ships
Ask, honestly: *if I were the user, would I feel comfortable here, would I understand what to do without effort, and would I want to come back tomorrow — not because the app is pulling me back, but because it genuinely helped?*

If the answer to any part of that is no, the screen isn't finished, regardless of whether every feature on the spec list technically works.

---

## Instruction to Claude Code
Treat this document as the quality bar for every section, checked alongside (not instead of) the specific feature requirements in the other spec files. When a section's functional requirements are complete, explicitly review it against the five principles above before considering it done. If a design choice ever seems to trade user comfort or trust for engagement metrics, default to comfort and trust — this is a non-negotiable principle of Ona's identity, not a style preference.
