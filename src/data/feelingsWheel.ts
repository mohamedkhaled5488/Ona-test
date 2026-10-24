import type { Feeling, FeelingZone } from '../types/sections';

// Identify the Feeling v2 — supersedes the old Family -> Cluster -> Precise
// wheel entirely. Grounded in the circumplex model of affect (energy x
// pleasantness — Russell 1980) plus a first-class "nothing in particular"
// zone, since most of daily life is quieter than a strong emotion. This is
// Ona's own zone naming, layout, word list, definitions and guidance — no
// Mood Meter (© Yale Center for Emotional Intelligence) or Geneva Emotion
// Wheel material is copied, only the general scientific idea.
//
// The 72 words carried over from the old wheel keep their original
// definitions; only their classification changed (zone + order replace
// family + cluster). 17 new words fill real gaps the old 6-family wheel had
// no place for (bored, tired, stressed, "okay"...). Ids are kept stable from
// the old wheel where the word already existed, so existing check-ins /
// bookmarks / votes keep resolving correctly.
//
// v3 revised guidance across the set to draw from a broader real-life
// toolkit instead of defaulting to "write about it" or "talk to someone":
//   - Opposite Action (DBT, Linehan) — act opposite to the emotion's urge.
//     Used for the Tense zone's anger-family words instead of anything that
//     reads as "vent it out" — research on emotion-regulation strategy use
//     found blaming others is reached for far more than its real benefit
//     justifies, specifically for anger.
//   - Check the Facts (DBT) — what evidence actually supports the feeling.
//   - The PLEASE skill (DBT) — basic physical care (illness, eating,
//     substances, sleep, exercise) reduces emotional vulnerability.
//   - Values-based action (ACT) — one small step toward what matters, even
//     before the feeling changes.
//   - Positive refocusing/reappraisal — shown most effective specifically
//     for sadness-type (Low zone) feelings in controlled comparisons across
//     strategies.
//   - Problem-solving + acceptance — shown most effective specifically for
//     anxiety-type (Tense zone) feelings in the same research.
//   - Savoring — Lively and Calm zones.
//   - Concrete social connection ("send one message right now") in place of
//     vague "reach out to someone."
// At most one suggestion per word points back into the app; the rest are
// real-world actions.

export interface FeelingZoneMeta {
  id: FeelingZone;
  label: string;
  description: string; // the plain description shown on the zone tile
  exampleWords: string[]; // shown on the tile, lowercase, per the design doc
  accent: string;
}

export const feelingZones: FeelingZoneMeta[] = [
  { id: 'lively', label: 'Lively', description: 'Pleasant, with energy', exampleWords: ['excited', 'proud', 'motivated'], accent: '#E8B23D' },
  { id: 'calm', label: 'Calm', description: 'Pleasant, quiet', exampleWords: ['relaxed', 'content', 'grateful'], accent: '#6E90B0' },
  { id: 'tense', label: 'Tense', description: 'Unpleasant, with energy', exampleWords: ['stressed', 'angry', 'anxious'], accent: '#C1554A' },
  { id: 'low', label: 'Low', description: 'Unpleasant, low energy', exampleWords: ['sad', 'tired', 'lonely'], accent: '#9B87B0' },
  { id: 'okay', label: 'Okay', description: 'Nothing in particular', exampleWords: ['neutral', 'flat', 'unsure'], accent: '#8B8880' },
];

export function zoneMeta(zone: FeelingZone): FeelingZoneMeta {
  return feelingZones.find((z) => z.id === zone)!;
}

// A plain id -> color lookup, for anywhere that just needs the color (e.g.
// Journaling) without the rest of FeelingZoneMeta.
export const zoneColors: Record<FeelingZone, string> = Object.fromEntries(
  feelingZones.map((z) => [z.id, z.accent])
) as Record<FeelingZone, string>;

export const feelings: Feeling[] = [
  // --- Lively (20), mild -> strong ---
  { id: 'joyful-aware', name: 'Aware', zone: 'lively', order: 0, definition: 'Feeling clear-headed and perceptive', guidance: ['Notice what\'s contributing to this clarity, so you can recreate the conditions (self-knowledge).', 'A good state for tackling something that needs a clear head.', 'If you want to capture it, a quick Journaling entry works well too — though sitting with it is enough on its own.'] },
  { id: 'lively-focused', name: 'Focused', zone: 'lively', order: 1, definition: 'Attention settled on one thing', guidance: ['Protect the state: silence notifications and start a timed session in Practice.', 'Note what helped you get here (time of day, place, music).', 'Take a short break when it fades rather than forcing it.'] },
  { id: 'joyful-cheerful', name: 'Cheerful', zone: 'lively', order: 2, definition: 'Feeling bright, upbeat, and good-humored', guidance: ['A good state to share with others — positive mood is genuinely contagious in social interaction (emotional contagion research)'] },
  { id: 'joyful-amused', name: 'Amused', zone: 'lively', order: 3, definition: 'Feeling entertained or delighted', guidance: ['Let yourself enjoy it fully without minimizing it'] },
  { id: 'joyful-playful', name: 'Playful', zone: 'lively', order: 4, definition: 'Feeling light, fun-loving, and spontaneous', guidance: ['Playfulness is linked to creativity and stress reduction — worth protecting, not just indulging occasionally'] },
  { id: 'powerful-hopeful', name: 'Hopeful', zone: 'lively', order: 5, definition: 'Feeling optimistic about what\'s ahead', guidance: ['Write down specifically what you\'re hopeful about (specificity strengthens motivation)', 'Consider turning it into a concrete Plan Builder step'] },
  { id: 'powerful-confident', name: 'Confident', zone: 'lively', order: 6, definition: 'Feeling capable and self-assured', guidance: ['Use this momentum on something that\'s felt difficult lately (self-efficacy — Bandura\'s research shows confidence transfers across tasks)'] },
  { id: 'powerful-intelligent', name: 'Intelligent', zone: 'lively', order: 7, definition: 'Feeling mentally sharp and capable', guidance: ['A good state for tackling something that requires real focus'] },
  { id: 'powerful-important', name: 'Important', zone: 'lively', order: 8, definition: 'Feeling significant in a situation or to someone', guidance: ['Notice what created this feeling, to understand what genuinely matters to you'] },
  { id: 'lively-motivated', name: 'Motivated', zone: 'lively', order: 9, definition: 'Driven and ready to act', guidance: ['Use the momentum on your most important task now (implementation intentions).', 'Set the next tiny step before you stop, so momentum survives.', 'Note what sparked it so you can recreate it.'] },
  { id: 'joyful-creative', name: 'Creative', zone: 'lively', order: 10, definition: 'Feeling inspired to make or build something', guidance: ['Capture the idea immediately, even roughly — creative momentum fades quickly if not recorded'] },
  { id: 'joyful-delighted', name: 'Delighted', zone: 'lively', order: 11, definition: 'Feeling a burst of pure pleasure or charm', guidance: ['Notice it fully — positive moments are often under-savored compared to negative ones (negativity bias in attention)'] },
  { id: 'powerful-proud', name: 'Proud', zone: 'lively', order: 12, definition: 'Feeling satisfaction in something you\'ve done or are', guidance: ['Name specifically what earned it — this reinforces the behavior that led here (positive reinforcement)'] },
  { id: 'joyful-daring', name: 'Daring', zone: 'lively', order: 13, definition: 'Feeling bold and willing to take a risk', guidance: ['Channel it into one concrete action while the feeling is present', 'Notice what\'s genuinely calculated risk vs. impulsive'] },
  { id: 'joyful-fascinated', name: 'Fascinated', zone: 'lively', order: 14, definition: 'Feeling deeply intrigued or captivated', guidance: ['Follow the curiosity — it\'s a strong, reliable signal for genuine engagement and learning'] },
  { id: 'joyful-stimulated', name: 'Stimulated', zone: 'lively', order: 15, definition: 'Feeling mentally engaged and activated', guidance: ['Note what caused it, so you can intentionally seek it out again'] },
  { id: 'joyful-energetic', name: 'Energetic', zone: 'lively', order: 16, definition: 'Feeling physically and mentally lively', guidance: ['Good time for tasks needing focus or effort — energy is a valuable resource to use well'] },
  { id: 'joyful-vibrant', name: 'Vibrant', zone: 'lively', order: 17, definition: 'Feeling full of life and energy', guidance: ['Use this energy on something meaningful rather than letting it dissipate unused'] },
  { id: 'joyful-excited', name: 'Excited', zone: 'lively', order: 18, definition: 'Feeling energized and eager about something', guidance: ['Savor it deliberately — pause and notice it fully rather than rushing past (savoring research, Bryant & Veroff)', 'Share it with someone — sharing good news with a responsive person amplifies the feeling (capitalization research)'] },
  { id: 'joyful-extravagant', name: 'Extravagant', zone: 'lively', order: 19, definition: 'Feeling expansive, generous, larger-than-life', guidance: ['Enjoy it, while checking it aligns with your actual values and plans'] },

  // --- Calm (20), mild -> strong ---
  { id: 'calm-rested', name: 'Rested', zone: 'calm', order: 0, definition: 'Physically and mentally restored', guidance: ['Spend the energy on something that matters to you today.', 'Note what your rest looked like (sleep timing, breaks) so you can repeat it.', 'Keep tonight\'s bedtime steady to hold on to it (sleep regularity).'] },
  { id: 'calm-calm', name: 'Calm', zone: 'calm', order: 1, definition: 'Settled and at ease, not worked up', guidance: ['Notice what created this state so you can return to it (self-knowledge).', 'Savor it for 30 seconds (savoring research).', 'A good moment to plan, reflect, or simply enjoy the quiet — it doesn\'t need to be filled with anything.'] },
  { id: 'peaceful-content', name: 'Content', zone: 'calm', order: 2, definition: 'Feeling satisfied and at ease', guidance: ['Pause and notice it fully — a genuinely useful mindfulness practice, not something to rush past'] },
  { id: 'peaceful-relaxed', name: 'Relaxed', zone: 'calm', order: 3, definition: 'Feeling physically and mentally at ease', guidance: ['Notice what created these conditions, so you can recreate them intentionally'] },
  { id: 'peaceful-thoughtful', name: 'Thoughtful', zone: 'calm', order: 4, definition: 'Feeling reflective and considerate', guidance: ['Good moment to revisit a Plan Builder plan with a clear head'] },
  { id: 'peaceful-pensive', name: 'Pensive', zone: 'calm', order: 5, definition: 'Feeling quietly reflective', guidance: ['Follow the thought wherever it leads for a few quiet minutes — you don\'t need to write anything down for it to be worth having.', 'If something in it feels worth keeping, a quick Journaling entry can help it stick.'] },
  { id: 'powerful-satisfied', name: 'Satisfied', zone: 'calm', order: 6, definition: 'Feeling content with an outcome', guidance: ['Let yourself fully register it before moving to the next task — under-acknowledging wins reduces their motivating effect'] },
  { id: 'powerful-worthwhile', name: 'Worthwhile', zone: 'calm', order: 7, definition: 'Feeling that your efforts or existence have real value', guidance: ['Let this settle rather than immediately looking for the next thing to prove it'] },
  { id: 'powerful-respected', name: 'Respected', zone: 'calm', order: 8, definition: 'Feeling valued and taken seriously by others', guidance: ['Notice what earned this, so you can recognize and repeat it'] },
  { id: 'powerful-appreciated', name: 'Appreciated', zone: 'calm', order: 9, definition: 'Feeling that others value what you do', guidance: ['Consider expressing thanks back if it came from someone specific — reciprocity strengthens the relationship'] },
  { id: 'powerful-valuable', name: 'Valuable', zone: 'calm', order: 10, definition: 'Feeling that you matter or contribute something real', guidance: ['Reflect on the specific contribution, to reinforce a stable sense of it'] },
  { id: 'peaceful-trusting', name: 'Trusting', zone: 'calm', order: 11, definition: 'Feeling safe relying on someone or something', guidance: ['Notice what specifically earned this trust'] },
  { id: 'peaceful-responsive', name: 'Responsive', zone: 'calm', order: 12, definition: 'Feeling attuned and able to engage well with others', guidance: ['A good state for meaningful conversations or connection'] },
  { id: 'powerful-faithful', name: 'Faithful', zone: 'calm', order: 13, definition: 'Feeling loyal, committed, and trustworthy', guidance: ['Notice what this commitment is really about — it\'s often revealing of your core values'] },
  { id: 'peaceful-sentimental', name: 'Sentimental', zone: 'calm', order: 14, definition: 'Feeling tender nostalgia or emotional warmth about a memory', guidance: ['Sit with the memory a little longer before moving on — deliberately slowing down to notice a good moment helps it last (savoring).', 'Tell someone the memory out loud, or write it down — either helps keep it.'] },
  { id: 'peaceful-thankful', name: 'Thankful', zone: 'calm', order: 15, definition: 'Feeling grateful', guidance: ['Writing down specifically what you\'re thankful for measurably boosts wellbeing over time (Emmons & McCullough\'s gratitude research, one of the most replicated findings in positive psychology)'] },
  { id: 'peaceful-nurturing', name: 'Nurturing', zone: 'calm', order: 16, definition: 'Feeling a desire to care for and support someone', guidance: ['A healthy state, as long as your own needs are being met too — check in on that balance'] },
  { id: 'peaceful-intimate', name: 'Intimate', zone: 'calm', order: 17, definition: 'Feeling emotionally close and connected', guidance: ['Let yourself stay present in it rather than moving on quickly'] },
  { id: 'peaceful-loving', name: 'Loving', zone: 'calm', order: 18, definition: 'Feeling warmth and care toward someone', guidance: ['Expressing it, even briefly, tends to strengthen both the feeling and the relationship'] },
  { id: 'peaceful-serene', name: 'Serene', zone: 'calm', order: 19, definition: 'Feeling deeply calm and untroubled', guidance: ['Protect this state — notice what allowed it, so you can return to it later'] },

  // --- Tense (21), mild -> strong ---
  { id: 'tense-restless', name: 'Restless', zone: 'tense', order: 0, definition: 'Can\'t settle; energy with nowhere to go', guidance: ['Channel it into movement, such as a brisk 10-minute walk (physical activity eases restlessness and tension).', 'Name what you\'re waiting for or avoiding.', 'Choose one small, absorbing task to give the energy a direction.'] },
  { id: 'tense-worried', name: 'Worried', zone: 'tense', order: 1, definition: 'Mind stuck on something that might go wrong', guidance: ['Jot the worry down and set 10 minutes later today to think about it (worry postponement, a CBT technique).', 'Ask what evidence actually supports the worry, and what the realistic worst case is (Check the Facts, DBT).', 'Use 5-4-3-2-1 grounding to return to the present.'] },
  { id: 'mad-irritated', name: 'Irritated', zone: 'tense', order: 2, definition: 'A milder, simmering form of anger', guidance: ['Identify the small trigger directly rather than letting it build (early labeling).', 'Check the basics — hunger, tiredness, or being overdue for a break often show up as irritability first (the PLEASE skill, DBT).', 'A short break often resolves it before it grows.'] },
  { id: 'mad-skeptical', name: 'Skeptical', zone: 'tense', order: 3, definition: 'Feeling doubtful or distrustful', guidance: ['Separate genuine caution from an automatic defensive reaction (metacognition).', 'Ask what specific evidence would actually change your view (Check the Facts, DBT).'] },
  { id: 'scared-bewildered', name: 'Bewildered', zone: 'tense', order: 4, definition: 'Feeling completely puzzled or disoriented', guidance: ['Slow down and address one piece of the confusion at a time (chunking) rather than the whole picture at once'] },
  { id: 'scared-confused', name: 'Confused', zone: 'tense', order: 5, definition: 'Feeling unclear about what\'s happening or what to do', guidance: ['Write down what you do know, separate from what you don\'t (externalizing reduces cognitive load)', 'Give yourself permission to not decide immediately'] },
  { id: 'mad-critical', name: 'Critical', zone: 'tense', order: 6, definition: 'A judgmental, fault-finding state of mind toward yourself or others', guidance: ['Ask whether the standard you\'re applying is realistic, and what evidence actually supports it (Check the Facts, DBT).', 'Note one thing that\'s actually going fine, to balance the lens.'] },
  { id: 'mad-selfish', name: 'Selfish', zone: 'tense', order: 7, definition: 'Feeling focused only on your own needs, or judging that in someone else', guidance: ['Separate the judgment from the fact — ask what\'s actually needed right now (cognitive reappraisal)', 'Consider the situation from the other person\'s perspective'] },
  { id: 'scared-embarrassed', name: 'Embarrassed', zone: 'tense', order: 8, definition: 'Feeling exposed or foolish in front of others', guidance: ['Remember the spotlight effect — others notice your mistakes far less than it feels (well-documented social psychology finding)', 'Self-compassionate self-talk, as you\'d offer a friend'] },
  { id: 'scared-foolish', name: 'Foolish', zone: 'tense', order: 9, definition: 'Feeling you\'ve made an obvious or embarrassing mistake', guidance: ['Separate the action from your identity — "I did something foolish" vs. "I am foolish" (cognitive defusion)'] },
  { id: 'scared-insecure', name: 'Insecure', zone: 'tense', order: 10, definition: 'Feeling unsure of your own worth or ability', guidance: ['List one thing you\'ve handled well recently, however small (self-efficacy building)', 'Remember this is a temporary state, not a fixed fact'] },
  { id: 'mad-jealous', name: 'Jealous', zone: 'tense', order: 11, definition: 'Feeling threatened by someone having something you want', guidance: ['Ask what evidence actually supports the fear behind it, and what you\'d tell a friend feeling this (Check the Facts, DBT).', 'Notice what the feeling is pointing to that you actually want (self-insight).', 'Separate their path from your own progress.'] },
  { id: 'mad-frustrated', name: 'Frustrated', zone: 'tense', order: 12, definition: 'Feeling blocked from something you want or need', guidance: ['Identify the exact obstacle, as specifically as possible (problem-focused coping).', 'Try approaching the thing that\'s blocking you instead of avoiding it (Opposite Action, DBT).', 'Break the blocked goal into a smaller next step you can act on.'] },
  { id: 'tense-stressed', name: 'Stressed', zone: 'tense', order: 13, definition: 'Demands feel bigger than the resources you have to meet them', guidance: ['List what\'s on your plate and choose the one next action (problem-focused coping, Lazarus and Folkman\'s stress and coping model).', 'Check the basics — sleep, food, movement (the PLEASE skill, DBT); stress hits harder on an empty tank.', 'Try one minute of slow breathing with a longer exhale than inhale.'] },
  { id: 'tense-overwhelmed', name: 'Overwhelmed', zone: 'tense', order: 14, definition: 'Too much at once to handle', guidance: ['Empty your head onto one list so it stops using up working memory (brain dump).', 'Choose only the smallest first step and do that.', 'Defer or drop two things for today.', 'Take one minute of slow breathing before you decide.'] },
  { id: 'scared-anxious', name: 'Anxious', zone: 'tense', order: 15, definition: 'Feeling worried or uneasy about something uncertain', guidance: ['Name 5 things you can see, 4 you can hear, 3 you can touch (5-4-3-2-1 grounding).', 'Directly address the part you can control, and consciously set aside the part you can\'t (problem-solving plus acceptance — the combination research shows helps anxiety-type feelings more than other single strategies).', 'Slow diaphragmatic breathing to activate the calming nervous system.'] },
  { id: 'mad-angry', name: 'Angry', zone: 'tense', order: 16, definition: 'A strong feeling that something is wrong or unfair', guidance: ['Let the physical arousal pass before acting — it naturally settles within about 20 minutes (physiological cooling-off period).', 'Try responding calmly instead of raising your voice, even before it matches how you feel (Opposite Action, DBT) — venting at someone tends to prolong anger more than it resolves it.', 'Move your body briefly to discharge the energy.'] },
  { id: 'mad-hostile', name: 'Hostile', zone: 'tense', order: 17, definition: 'Feeling antagonistic or ready to confront', guidance: ['Notice the urge without acting on it immediately (impulse delay).', 'Approach the conversation gently instead of confronting it head-on (Opposite Action, DBT).', 'Ask what need isn\'t being met underneath the hostility.'] },
  { id: 'mad-hateful', name: 'Hateful', zone: 'tense', order: 18, definition: 'An intense feeling of dislike or hostility toward someone/something', guidance: ['Name the feeling without acting on it (affect labeling reduces intensity).', 'Deliberately act a little warmer than you feel in your next interaction (Opposite Action, DBT) — it shifts the feeling more reliably than venting does.', 'If you need to process it first, write it out fully before any response.'] },
  { id: 'mad-furious', name: 'Furious', zone: 'tense', order: 19, definition: 'An intense, overwhelming form of anger', guidance: ['Step away before responding to anyone or anything (de-escalation).', 'Slow, deliberate breathing to calm physiological arousal.', 'Once calmer, try approaching the situation gently instead of confronting it (Opposite Action, DBT).'] },
  { id: 'mad-rage', name: 'Rage', zone: 'tense', order: 20, definition: 'An extreme, hard-to-control form of anger', guidance: ['Physically remove yourself from the situation if possible (behavioral de-escalation).', 'Use slow exhale-longer-than-inhale breathing to engage the calming nervous system response.', 'Wait significantly before any action or decision — acting opposite to the urge to confront (Opposite Action, DBT) works better than venting once you\'re ready.'] },

  // --- Low (23), mild -> strong ---
  { id: 'low-tired', name: 'Tired', zone: 'low', order: 0, definition: 'Low on physical or mental energy, wanting rest', guidance: ['Ask whether your body or your mind is tired: body needs rest or sleep; mind may need a short break or a change of activity.', 'Check the basics: sleep, food, movement (the PLEASE skill, DBT) — tiredness often has a simple physical cause.', 'A brief walk or some daylight can give a short energy lift.'] },
  { id: 'sad-bored', name: 'Bored', zone: 'low', order: 1, definition: 'Feeling understimulated or restless without engagement', guidance: ['Boredom often signals a need for a genuinely engaging (not just distracting) activity (research on boredom as a motivational signal)', 'A change of environment or activity type often resolves it faster than passive scrolling'] },
  { id: 'low-disappointed', name: 'Disappointed', zone: 'low', order: 2, definition: 'Let down because hopes or expectations weren\'t met', guidance: ['Acknowledge the gap between what you hoped for and what happened — it\'s a real loss, however small.', 'Shift your attention deliberately to something workable right now instead of replaying what didn\'t happen (positive refocusing — shown to help sadness-type feelings specifically).', 'Adjust the plan rather than abandon the goal; add an alternative in Plan Builder.'] },
  { id: 'low-unmotivated', name: 'Unmotivated', zone: 'low', order: 3, definition: 'Little drive to start or keep going', guidance: ['Ask what actually matters to you here, and take one small step in that direction even without the motivation yet (values-based action, ACT).', 'Shrink the task until it\'s almost too small to skip.', 'Reconnect with your "why", the motive you wrote in Plan Builder. If nothing feels worth doing for weeks, consider talking to someone.'], heavy: true },
  { id: 'sad-bashful', name: 'Bashful', zone: 'low', order: 4, definition: 'Feeling shy or self-conscious', guidance: ['This is a normal, common social response, not a flaw', 'Small, low-pressure social steps tend to ease it gradually (graded exposure)'] },
  { id: 'peaceful-apathetic', name: 'Apathetic', zone: 'low', order: 5, definition: 'Feeling a lack of interest or motivation', guidance: ['Pick one small thing that matters to you and do it anyway, without waiting to feel like it (values-based action, ACT).', 'Small, low-effort engagement often restarts motivation better than waiting to "feel like it" (behavioral activation).'] },
  { id: 'scared-discouraged', name: 'Discouraged', zone: 'low', order: 6, definition: 'Feeling your motivation or hope has been dampened', guidance: ['Revisit the original reason (motive) behind what you\'re pursuing (values-based action, ACT).', 'Shift focus to how far you\'ve already come instead of how far is left (positive refocusing).'] },
  { id: 'scared-weak', name: 'Weak', zone: 'low', order: 7, definition: 'Feeling a lack of strength or capability', guidance: ['Remember capability fluctuates — this moment isn\'t the full picture (state vs. trait distinction)', 'Rest is sometimes the appropriate response, not a failure'] },
  { id: 'low-drained', name: 'Drained', zone: 'low', order: 8, definition: 'Emptied out after sustained effort, stress, or caring for others', guidance: ['Check the basics first: rest, food, water, and a real break from demands, even 10 minutes (the PLEASE skill, DBT; psychological detachment research, Sonnentag).', 'Choose one must-do and defer the rest.', 'Refill with something low-effort you enjoy. If you feel drained for weeks, send one message to someone you trust, or talk to a professional.'], heavy: true },
  { id: 'scared-submissive', name: 'Submissive', zone: 'low', order: 9, definition: 'Feeling like you have to yield or comply against your preference', guidance: ['Notice the feeling as information about a power imbalance, not a personal failing', 'Consider one small assertive step, if safe to do so'] },
  { id: 'sad-lonely', name: 'Lonely', zone: 'low', order: 10, definition: 'Feeling disconnected from others, even if people are around', guidance: ['Quality of connection matters more than quantity (loneliness research).', 'Send one message right now — even just "thinking of you" counts (concrete social connection).', 'If you\'d rather process it first: say it out loud to yourself, or write it down — whichever feels easiest.'] },
  { id: 'mad-hurt', name: 'Hurt', zone: 'low', order: 11, definition: 'Feeling emotionally wounded by something said or done', guidance: ['Allow the feeling before deciding how to respond (emotional processing).', 'When ready, tell one person what happened, in your own words (concrete social connection).', 'If you\'d rather process it first, write down what you\'d want to say, even unsent (expressive writing).'] },
  { id: 'sad-guilty', name: 'Guilty', zone: 'low', order: 12, definition: 'Feeling responsible for something that went wrong', guidance: ['Write out what happened without self-judgment first (expressive writing)', 'Consider one realistic repair, if one exists', 'Separate the specific action from your overall character'] },
  { id: 'scared-rejected', name: 'Rejected', zone: 'low', order: 13, definition: 'Feeling excluded or unwanted', guidance: ['Remember social pain is processed like physical pain in the brain — it\'s real, not "overreacting" (neuroscience of social rejection).', 'Send one message right now to someone who has shown up for you before — even just to say hi.'] },
  { id: 'sad-inferior', name: 'Inferior', zone: 'low', order: 14, definition: 'Feeling less-than compared to others', guidance: ['Social comparison distorts reality — you\'re comparing your inside to someone else\'s outside (social comparison research).', 'Shift attention to your own progress over time instead of the comparison (positive refocusing).'] },
  { id: 'sad-inadequate', name: 'Inadequate', zone: 'low', order: 15, definition: 'Feeling you\'re not good enough', guidance: ['List a recent moment, however small, where you were enough (evidence-based reframing)', 'Remember this feeling is a state, not an accurate measurement'] },
  { id: 'scared-insignificant', name: 'Insignificant', zone: 'low', order: 16, definition: 'Feeling unimportant or overlooked', guidance: ['Reflect on one concrete way you\'ve mattered to someone recently (positive refocusing).', 'If this feeling persists, send one message to someone you trust, or talk it through with them.'], heavy: true },
  { id: 'sad-stupid', name: 'Stupid', zone: 'low', order: 17, definition: 'Feeling you\'ve failed at something you should know', guidance: ['Separate a single mistake from your overall intelligence or worth (cognitive defusion)'] },
  { id: 'sad-ashamed', name: 'Ashamed', zone: 'low', order: 18, definition: 'Feeling a deep sense of having done something wrong', guidance: ['Distinguish shame ("I am bad") from guilt ("I did something bad") — guilt is more workable (shame vs. guilt research)', 'Self-compassion reduces shame more effectively than self-criticism (Neff\'s self-compassion research)'] },
  { id: 'low-numb', name: 'Numb', zone: 'low', order: 19, definition: 'Feeling little or nothing; cut off from your own emotions', guidance: ['Numbness is a common response to overload or stress and isn\'t a personal failing.', 'Try gentle grounding: name five things you can see, hold something warm, or listen to a familiar song (sensory grounding).', 'Notice one small sensation or feeling, however faint, and write it down.', 'If numbness lasts or frightens you, talk to a trusted person or a professional.'], heavy: true },
  { id: 'scared-helpless', name: 'Helpless', zone: 'low', order: 20, definition: 'Feeling unable to influence or change your situation', guidance: ['Identify one small thing genuinely within your control, however minor (locus of control).', 'Directly address the one piece you can influence, and consciously set aside the rest for now (problem-solving plus acceptance).', 'If this feeling is frequent or lasting, send one message to someone you trust, or talk to a professional.'], heavy: true },
  { id: 'sad-miserable', name: 'Miserable', zone: 'low', order: 21, definition: 'An intense, overwhelming low feeling', guidance: ['Be gentle with yourself — this state passes, even when it doesn\'t feel like it will.', 'Check the basics: rest, food, water (the PLEASE skill, DBT) — they matter more than they seem in this state.', 'If this persists, send one message to someone you trust, or talk to a professional.'], heavy: true },
  { id: 'sad-depressed', name: 'Depressed', zone: 'low', order: 22, definition: 'A heavy, low, drained feeling — everyday use of the word, not a clinical diagnosis', guidance: ['Gentle activity, even something small, tends to help more than waiting to feel motivated first (behavioral activation).', 'Send one message to one person, even just to say hi.', 'If this feeling is frequent, intense, or lasting, it\'s genuinely worth talking to a professional.'], heavy: true },

  // --- Okay (5), mild -> strong ---
  { id: 'okay-okay', name: 'Okay', zone: 'okay', order: 0, definition: 'Fine; nothing much stands out, neither good nor bad', guidance: ['Neutral is a normal, common state, and not every moment needs a label or a fix.', 'Notice one small pleasant detail around you for 30 seconds (savoring).', 'Log it anyway; seeing ordinary days over time helps you spot what actually shifts your mood (self-monitoring).'] },
  { id: 'peaceful-sleepy', name: 'Sleepy', zone: 'okay', order: 1, definition: 'Feeling physically ready for rest', guidance: ['Honor it if you can — rest supports nearly every other emotional and cognitive function (well-established sleep research)'] },
  { id: 'okay-distracted', name: 'Distracted', zone: 'okay', order: 2, definition: 'Attention keeps slipping away from what you\'re doing', guidance: ['Write down what\'s pulling at your mind, with one concrete next step for each; specific plans reduce the mental intrusion of unfinished goals (Masicampo & Baumeister).', 'Choose a single next task and give it 10 minutes (single-tasking).', 'A two-minute walk or stretch can reset attention.'] },
  { id: 'okay-unsure', name: 'Unsure', zone: 'okay', order: 3, definition: 'Can\'t tell what you\'re feeling', guidance: ['Pause and notice your body: chest, stomach, shoulders, jaw; sensations often hint at the feeling (interoceptive awareness).', 'Write freely for two minutes without judging (expressive writing).', 'It\'s fine to come back later; "not sure" is a valid answer.'] },
  { id: 'okay-flat', name: 'Flat', zone: 'okay', order: 4, definition: 'Muted; not really up or down, going through the motions', guidance: ['Check the basics: sleep, food, movement, daylight — flatness often follows depletion (the PLEASE skill, DBT).', 'Pick one small thing you usually enjoy and do it anyway, without expecting to feel anything special (values-based action, ACT).', 'If flat days stretch for weeks, mention it to someone you trust or a health professional.'], heavy: true },
];

export function feelingsInZone(zone: FeelingZone): Feeling[] {
  return feelings.filter((f) => f.zone === zone).sort((a, b) => a.order - b.order);
}

export function findFeeling(id: string): Feeling | undefined {
  return feelings.find((f) => f.id === id);
}

// "You might also be feeling…" — the nearest words on either side within the
// same zone, replacing the old wheel's cluster-sibling logic.
export function siblingFeelings(feelingId: string, span = 2): Feeling[] {
  const feeling = findFeeling(feelingId);
  if (!feeling) return [];
  const zoneWords = feelingsInZone(feeling.zone);
  const index = zoneWords.findIndex((f) => f.id === feelingId);
  if (index === -1) return [];
  const start = Math.max(0, index - span);
  const end = Math.min(zoneWords.length, index + span + 1);
  return zoneWords.slice(start, end).filter((f) => f.id !== feelingId);
}

// Words whose recurrence over ~2 weeks triggers the extended safeguard note
// (see utils/feelingsStats.ts) — specific words, not whole zones, since e.g.
// Tense also contains much milder words like Restless.
export const safeguardFeelingIds: string[] = [
  'low-numb',
  'scared-helpless',
  'sad-miserable',
  'sad-depressed',
  'okay-flat',
  'low-drained',
  'low-unmotivated',
];

// Quick-tap "what's contributing to this?" chips — a check-in stays freeform
// via its note field too, but these are structured enough to actually count
// (see utils/feelingsStats.ts's reason-tag stats).
export const reasonTagOptions = [
  'Work',
  'Relationships',
  'Health/Body',
  'Money',
  'Sleep',
  'Family',
  'Social plans',
  'Alone time',
  'News/world events',
  'Weather',
  'Not sure',
] as const;

// Gentle, zone-tied suggestions — never a generic "try journaling" for
// everything. Each zone points to sections that actually fit what it means.
export const suggestionsByZone: Record<FeelingZone, { section: string; reason: string }[]> = {
  tense: [
    { section: 'journaling', reason: 'Writing it out before responding to anyone tends to help it pass.' },
    { section: 'catchAThought', reason: 'Park what triggered it so you can look at it once things settle.' },
  ],
  low: [
    { section: 'journaling', reason: 'Putting words to it, even briefly, tends to help more than it seems.' },
    { section: 'dailyPlanning', reason: 'One small, doable task can help more than waiting to feel ready.' },
  ],
  lively: [
    { section: 'planBuilder', reason: 'Good momentum to put toward something that’s felt hard lately.' },
    { section: 'journaling', reason: 'Capture it — good moments are easy to under-notice in the moment.' },
  ],
  calm: [
    { section: 'journaling', reason: 'Thoughts often surface more clearly in a state like this.' },
    { section: 'planBuilder', reason: 'A clear head is a good moment to revisit a plan.' },
  ],
  okay: [
    { section: 'journaling', reason: 'An ordinary day is still worth a line — patterns show up over time.' },
    { section: 'studySession', reason: 'A neutral, unhurried moment is a fine time for a focus block.' },
  ],
};

// Feelings intense enough that a short guided-breathing exercise belongs
// right on the result screen, not just as a line of written advice.
export const highArousalFeelingIds: string[] = ['mad-furious', 'mad-rage', 'mad-hostile', 'scared-anxious', 'tense-overwhelmed'];
