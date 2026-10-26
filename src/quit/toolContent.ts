// What the craving tools say: breathing patterns and the guided steps, one
// at a time. Plain, modest words: no promises, no exact durations as facts,
// no medical advice. The "Why this can help" lines are in quit/toolkit.ts and
// are drafts for a clinician's review before release
// (docs/craving-toolkit-copy-review.md).

export type BreathPhase = 'in' | 'hold' | 'out';

export interface BreathingPattern {
  id: string;
  name: string;
  line: string;
  phases: { phase: BreathPhase; seconds: number }[];
}

export const BREATHING_PATTERNS: BreathingPattern[] = [
  { id: 'even', name: 'Even', line: 'In and out at the same gentle pace.', phases: [{ phase: 'in', seconds: 4 }, { phase: 'out', seconds: 4 }] },
  { id: 'slowExhale', name: 'Slow exhale', line: 'A longer breath out than in.', phases: [{ phase: 'in', seconds: 4 }, { phase: 'out', seconds: 6 }] },
  {
    id: 'box',
    name: 'Box',
    line: 'In, hold, out, hold, all the same length.',
    phases: [{ phase: 'in', seconds: 4 }, { phase: 'hold', seconds: 4 }, { phase: 'out', seconds: 4 }, { phase: 'hold', seconds: 4 }],
  },
];

export const BREATH_LABELS: Record<BreathPhase, string> = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out' };

// Guided tools: a heading per step and a line or two. "Next" moves on; the
// last step offers "Done".
export const GUIDED_STEPS: Record<string, { title: string; body: string }[]> = {
  grounding: [
    { title: '5 things you can see', body: 'Look around and name five things, one at a time. Small ones count.' },
    { title: '4 things you can feel', body: 'Your feet on the floor, your clothes, the air, something in your hand.' },
    { title: '3 things you can hear', body: 'Near or far. Traffic, a fridge, your own breathing.' },
    { title: '2 things you can smell', body: "Or two smells you like, if nothing's around." },
    { title: '1 thing you can taste', body: 'Or one thing you like the taste of. Then take a slow breath.' },
  ],
  bodyScan: [
    { title: 'Settle', body: "Sit or lie down however is comfortable. Let your eyes close or rest on one spot." },
    { title: 'Head and face', body: 'Notice your forehead, jaw and eyes. If something is tight, just notice it.' },
    { title: 'Neck and shoulders', body: 'Let your shoulders drop a little, if they want to.' },
    { title: 'Arms and hands', body: 'Notice their weight. Warm, cool, heavy, light: whatever is there.' },
    { title: 'Chest and belly', body: 'Feel them rise and fall with your breath, without changing it.' },
    { title: 'Legs and feet', body: 'Notice where they touch the floor or the bed.' },
    { title: 'The whole body', body: 'Take one slow breath and notice your body as a whole.' },
  ],
  muscleRelax: [
    { title: 'Hands', body: 'Make two fists, gently, and hold for a few breaths. Then let go and notice the difference.' },
    { title: 'Shoulders', body: 'Lift your shoulders toward your ears, hold, then let them drop.' },
    { title: 'Face', body: 'Scrunch your face a little, hold, then let it soften.' },
    { title: 'Legs', body: 'Press your feet into the floor, hold, then release.' },
    { title: 'All of you', body: 'Take a slow breath out and let your whole body be heavy.' },
  ],
  noticeFive: [
    { title: 'Look closely', body: "Find five things near you that you haven't really looked at before." },
    { title: 'One at a time', body: 'For each one: its colour, its shape, the light on it, any tiny detail.' },
    { title: 'Take your time', body: "There's no rush and no right answer. When you've found five, notice how you feel." },
  ],
  oneObject: [
    { title: 'Pick one thing', body: 'Something near you: a cup, a leaf, your own hand.' },
    { title: 'Look', body: 'Its colours, edges, shadows. Look as if you had never seen one before.' },
    { title: 'Feel', body: "If you can hold it: its weight, temperature, texture." },
    { title: 'Come back', body: 'When your mind wanders, just bring it back to the object. That is the whole exercise.' },
  ],
  walk: [
    { title: 'Step out', body: 'A few minutes outside, or just to another room. No phone needed.' },
    { title: 'Your own pace', body: 'Notice your feet, the air, what you pass. Nothing to count or track.' },
    { title: 'Back again', body: 'When you come back, check in with how you feel.' },
  ],
  stretches: [
    { title: 'Reach up', body: 'Stretch your arms up slowly, then let them come down.' },
    { title: 'Neck', body: 'Let your head tip gently toward one shoulder, then the other.' },
    { title: 'Shoulders', body: 'Roll your shoulders back a few times, slowly.' },
    { title: 'Side', body: 'Reach one arm over your head and lean a little. Then the other side.' },
    { title: 'Shake out', body: 'Shake out your hands and feet. Then take a slow breath.' },
  ],
  urgeSurfing: [
    { title: 'Notice it', body: 'Where do you feel the craving? Chest, mouth, hands, stomach?' },
    { title: 'Describe it', body: "Is it tight, warm, buzzing, heavy? You don't have to like it, just notice it." },
    { title: 'Watch it', body: 'Cravings usually rise, peak and fade, like a wave. See if it changes as you watch.' },
    { title: 'Breathe with it', body: 'Breathe slowly and let the wave do what it does. You can stay on the board.' },
  ],
  textFriend: [{ title: 'Text a friend', body: "About something unrelated: a song, a photo, a simple hello. You don't have to mention the craving." }],
  sayHi: [{ title: 'Say hi to someone', body: 'Step outside and greet a neighbour, a shopkeeper, anyone nearby. A small exchange is enough.' }],
};

export const TOOL_VIEW_COPY = {
  next: 'Next',
  back: 'Back',
  done: 'Done',
  step: (n: number, of: number) => `Step ${n} of ${of}`,
  pattern: 'Pattern',
  startBreathing: 'Start',
  pauseBreathing: 'Pause',
  vibration: 'Gentle vibration',
  countTap: 'Tap with each breath out',
  countOf: (n: number) => `${n} of 10`,
  countAgain: 'Ten. Start again whenever you like.',
  mindful: 'Just notice: your breath, sounds, the feeling of sitting.',
  mindfulDone: "That's a minute. Stay as long as you like.",
  soundsLine: 'Sound is off until you choose one.',
  soundStop: 'Stop sound',
  soundsReplaced: (other: string) => `${other} sounds stopped: one sound at a time.`,
  soundError: "Couldn't play this sound.",
  delayTitle: 'Delay it',
  delayLine: "Decide later. Nothing to do until the timer is done, except wait however you like.",
  delayCaption: 'Deciding later',
  delayDone: 'Time to check in with yourself.',
  nameTitle: 'Name the craving',
  nameFeeling: 'What are you feeling right now? (optional)',
  nameFeelingPlaceholder: 'Restless, bored, tense, lonely…',
  nameTrigger: 'What set it off? (optional)',
  reasonsTitle: 'My reasons',
  reasonsEmpty: "You haven't written any reasons yet. Add one now, or later in My toolkit.",
  reasonsAdd: 'Add a reason',
  reasonsPlaceholder: 'A reason of your own…',
  reasonsNote: 'A note to your future self',
  reasonsNotePlaceholder: 'What would you like to hear in a moment like this?',
  reasonsPhoto: 'Add a photo (optional)',
  reasonsPhotoChange: 'Change photo',
  reasonsPhotoRemove: 'Remove photo',
  memoryNice: 'Nice. Another round whenever you like.',
  memoryAgain: 'Another round',
  slideNice: 'Nice. Another one whenever you like.',
  slideAgain: 'Another puzzle',
  slideTile: (n: number, canMove: boolean) => `Tile ${n}${canMove ? ', can slide' : ''}`,
  mathShow: (answer: number) => `It's ${answer}. Here's another.`,
  mathNice: 'Nice.',
  longStay: 'How are you feeling now?',
  longStayOkay: "I'm okay now",
  longStayKeep: 'Keep going',
  why: 'Why this can help',
};
