// Part D: the Discover hub and slide tour. Every slide maps to a feature that
// exists, no slide makes a claim Ona doesn't, navigation lands where it
// should, "Try it" never mixes demo data into your own, and nothing here
// needs an account, a network or the server.
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import { ALL_SLIDES, EXPLORE_GROUPS, STRINGS, TOUR, TRANSLATIONS, slideIndexOfKey, slideIndexOfSection, startIndex, t } from '../../discover/content';
import { tryItDestination } from '../../discover/tryItRule';
import { ALLOWED_EVENTS, setAnalyticsTransport, track } from '../analytics';
import { DEFAULT_SETTINGS, useSettingsStore } from '../../store/useSettingsStore';
import { folders } from '../../data/folders';

const fs = require('fs') as { readFileSync: (p: string, e: string) => string; existsSync: (p: string) => boolean };
const path = require('path') as { join: (...p: string[]) => string };
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

// Each slide's feature, and where the app shows it really exists.
const EVIDENCE: Record<string, [string, RegExp][]> = {
  app: [['src/screens/WelcomeScreen.tsx', /A calm place to plan, reflect and grow/]],
  offlineSync: [['src/screens/WelcomeScreen.tsx', /unless you choose to sync/]],
  planMotive: [['src/screens/PlanDetailScreen.tsx', /motive/i]],
  planSteps: [['src/screens/PlanDetailScreen.tsx', /alternative/i], ['src/screens/PlanDetailScreen.tsx', /'list' \| 'map'/], ['src/screens/PlanDetailScreen.tsx', /reorder/i], ['src/screens/PlanDetailScreen.tsx', /priorityColors/]],
  planMove: [['src/components/MoveToDailyPlanningSheet.tsx', /Daily Planning/]],
  dayView: [['src/store/useSettingsStore.ts', /'list' \| 'timeline'/], ['src/screens/dailyPlanning/DayViewParts.tsx', /till open from earlier/]],
  taskPage: [['src/screens/TaskEditorScreen.tsx', /energy/i], ['src/screens/TaskEditorScreen.tsx', /subtask/i], ['src/screens/TaskEditorScreen.tsx', /repeat/i], ['src/screens/TaskEditorScreen.tsx', /sound/i], ['src/screens/TaskEditorScreen.tsx', /tomorrow/i]],
  planningInsights: [['src/screens/PlanningInsightsScreen.tsx', /feel/i], ['src/utils/planningInsights.ts', /MIN_POINTS/]],
  mealPlan: [['src/screens/DietPlanningScreen.tsx', /'week' \| 'grocery' \| 'summary'/]],
  mealCost: [['src/screens/DietPlanningScreen.tsx', /currency/i], ['src/utils/dietStats.ts', /costBySource/]],
  mealSummary: [['src/screens/DietPlanningScreen.tsx', /'day' \| 'week' \| 'month'/], ['src/screens/DietPlanningScreen.tsx', /mostRepeatedMeals/]],
  budgetModes: [['src/types/sections.ts', /mode: BudgetMode/], ['src/types/sections.ts', /deadline\?: string/]],
  budgetEntries: [['src/types/sections.ts', /categoryId\?: string;\n  note\?: string;\n  photoUri\?: string/]],
  budgetWarn: [['src/store/useSettingsStore.ts', /budgetWarnAt/]],
  journalZone: [['src/types/sections.ts', /zone: FeelingZone; \/\/ the one-tap color/]],
  journalFont: [['src/screens/JournalWriteScreen.tsx', /caveat|handwriting/i], ['src/screens/JournalWriteScreen.tsx', /read mode|readMode/i]],
  journalOnThisDay: [['src/screens/JournalingScreen.tsx', /on this day/i]],
  feelingWheel: [['src/data/feelingsWheel.ts', /description/], ['src/types/sections.ts', /intensities\?:/]],
  feelingGuidance: [['src/screens/MoodCheckScreen.tsx', /guidance/i]],
  feelingAnalysis: [['src/screens/MoodCheckScreen.tsx', /overviewInsight/], ['src/components/FeelingsGraph.tsx', /pinch/], ['src/screens/MoodCheckScreen.tsx', /compareZonePeriods/], ['src/screens/settings/HelpAboutPages.tsx', /Safety and support resources/]],
  sleepWindDown: [['src/screens/SleepScreen.tsx', /Wind-down checklist/], ['src/utils/reminders.ts', /bedtime/i]],
  sleepSounds: [['src/screens/SleepScreen.tsx', /Your mix/], ['src/screens/SleepScreen.tsx', /Sleep timer/], ['src/types/sections.ts', /'brown-noise'/], ['src/store/useSettingsStore.ts', /defaultFadeOutMinutes/]],
  sleepLog: [['src/screens/SleepScreen.tsx', /How did you sleep/], ['src/screens/SleepScreen.tsx', /Gentle wake alarm/]],
  habitMinimum: [['src/types/sections.ts', /minimumVersion\?: string/], ['src/screens/HabitBuilderScreen.tsx', /Did the minimum version/]],
  habitMilestones: [['src/utils/habitPattern.ts', /export function milestoneBar/], ['src/utils/habitFrequency.ts', /paused/]],
  habitPattern: [['src/screens/BuildHabitAnalysis.tsx', /DayStrip/], ['src/utils/habitTimeOfDay.ts', /MIN_GAP/], ['src/screens/habits/HabitLogDetail.tsx', /Comment/], ['src/utils/itemFeelings.ts', /logItemFeeling/]],
  quitUrge: [['src/screens/QuitHabitScreen.tsx', /UrgeTimer/], ['src/screens/QuitHabitScreen.tsx', /Do something instead/], ['src/screens/QuitHabitScreen.tsx', /Reach out/]],
  quitResisted: [['src/screens/QuitHabitScreen.tsx', /You've resisted/]],
  quitJourney: [['src/screens/QuitHabitAnalysis.tsx', /part of the story, not a reset/]],
  skillSessions: [['src/utils/skillProgress.ts', /LEVEL_LABELS/], ['src/utils/skillProgress.ts', /activeSubSkills/], ['src/types/sections.ts', /minutes: number; \/\/ 0 if the optional timer wasn't used/]],
  skillPlateau: [['src/utils/skillProgress.ts', /export function detectPlateau/], ['src/utils/skillProgress.ts', /plateaus are a normal part of learning/]],
  skillJourney: [['src/screens/SkillJourney.tsx', /Then vs\. now/], ['src/screens/SkillJourney.tsx', /Back to first vs\. latest/]],
  bookProgress: [['src/screens/BookScreen.tsx', /Estimated time left|bookShowEstimate/]],
  bookQuotes: [['src/screens/BookScreen.tsx', /QuoteTab = 'type' \| 'photo'/]],
  bookSessions: [['src/screens/BookScreen.tsx', /formatStopwatch/], ['src/store/useSettingsStore.ts', /bookFeelingAfterSession/]],
  studyTimer: [['src/data/studyPresets.ts', /studyPresets/], ['src/screens/StudySessionScreen.tsx', /customFocus/]],
  studySounds: [['src/types/sections.ts', /ambientSound: AmbientSound/]],
  studyHistory: [['src/types/sections.ts', /notes\?: string; \/\/ the post-session note/], ['src/screens/StudySessionScreen.tsx', /formatDisplayDate\(day\.date\)/]],
  recapWeek: [['src/screens/RecapScreen.tsx', /A calm look back/]],
  recapAreas: [['src/screens/RecapScreen.tsx', /AREA_TITLES/]],
  recapShare: [['src/store/useSettingsStore.ts', /shareSensitiveInRecap: false/], ['src/screens/RecapScreen.tsx', /Share/]],
  dataControl: [['src/screens/settings/PrivacyPages.tsx', /Export my data/], ['src/screens/settings/PrivacyPages.tsx', /[Dd]elete/], ['src/screens/settings/AccountPages.tsx', /trial/i]],
  finish: [['src/screens/WelcomeScreen.tsx', /Explore with sample data/]],
};

describe('D4. Every slide describes something that exists', () => {
  test('each slide maps to a feature, and the app has it', () => {
    for (const s of ALL_SLIDES) {
      const proofs = EVIDENCE[s.feature];
      if (!proofs) throw new Error(`Slide "${s.key}" describes "${s.feature}", which has no evidence listed`);
      for (const [file, re] of proofs) {
        if (!re.test(read(file))) throw new Error(`Slide "${s.key}" (${s.feature}): ${file} doesn't match ${re}`);
      }
    }
  });

  test('no evidence entry is left without a slide', () => {
    const used = new Set(ALL_SLIDES.map((s) => s.feature));
    expect(Object.keys(EVIDENCE).filter((f) => !used.has(f))).toEqual([]);
  });

  test('no banned claims anywhere in the tour or the Discover words', () => {
    const BANNED = /end-to-end|diagnos|\bcure|\btreat|\bcauses?\b|clinical|encrypt|photo sync|therap/i;
    const text = [...ALL_SLIDES.flatMap((s) => [s.title, s.body]), ...TOUR.map((s) => s.title), ...Object.values(STRINGS)];
    for (const line of text) expect(line).not.toMatch(BANNED);
  });

  test('things that are not built are not mentioned', () => {
    const all = ALL_SLIDES.map((s) => `${s.title} ${s.body}`).join(' ');
    expect(all).not.toMatch(/income|doctor|insomnia|flowchart|Songwriting|Mind Games/i);
  });
});

describe('D3. Structure', () => {
  test('3–5 slides per section; Welcome 2, Your data 1, Finish 1', () => {
    for (const s of TOUR) {
      if (s.id === 'welcome') expect(s.slides).toHaveLength(2);
      else if (s.id === 'data' || s.id === 'finish') expect(s.slides).toHaveLength(1);
      else {
        expect(s.slides.length).toBeGreaterThanOrEqual(3);
        expect(s.slides.length).toBeLessThanOrEqual(5);
      }
    }
  });

  test('every section in the app has a tour section, and its last slide has "Try it"', () => {
    const appSections = folders.flatMap((f) => f.sections).flatMap((id) => (id === 'habits' ? ['habitBuilder', 'quitHabit'] : [id]));
    for (const id of [...appSections, 'recap']) {
      const sec = TOUR.find((s) => s.id === id);
      expect(sec).toBeDefined();
      expect(sec!.slides[sec!.slides.length - 1].tryIt).toBeDefined();
    }
  });

  test('"Try it" only opens screens the app has', () => {
    const nav = read('src/navigation/RootNavigator.tsx');
    const meta = read('src/data/sectionsMeta.ts');
    for (const s of ALL_SLIDES.filter((x) => x.tryIt)) {
      const r = s.tryIt!.route;
      expect(nav.includes(`name="${r}"`) || meta.includes(`id: '${r}'`)).toBe(true);
    }
  });

  test('Explore by section is grouped like the app', () => {
    expect(EXPLORE_GROUPS.map((g) => g.group)).toEqual(['plan', 'reflect', 'grow', 'learn', 'recap']);
    expect(EXPLORE_GROUPS[0].sections.map((s) => s.id)).toEqual(['planBuilder', 'dailyPlanning', 'dietPlanning', 'budget']);
  });

  test('slide keys are unique', () => {
    expect(new Set(ALL_SLIDES.map((s) => s.key)).size).toBe(ALL_SLIDES.length);
  });

  test('about 5 minutes: between 35 and 55 slides', () => {
    expect(ALL_SLIDES.length).toBeGreaterThanOrEqual(35);
    expect(ALL_SLIDES.length).toBeLessThanOrEqual(55);
  });
});

describe('D3/D6. Navigation: start, resume, jump', () => {
  const last = ALL_SLIDES[ALL_SLIDES.length - 1].key;

  test('opens at a section, resumes where it was left, or starts at the beginning', () => {
    expect(startIndex({ sectionId: 'skills' }, '', false)).toBe(slideIndexOfSection('skills'));
    expect(ALL_SLIDES[startIndex({ sectionId: 'skills' }, '', false)].key).toBe('sk-1');
    expect(startIndex({ resume: true }, 'dp-2', false)).toBe(slideIndexOfKey('dp-2'));
    expect(startIndex({ resume: true }, 'dp-2', true)).toBe(0); // finished: start again
    expect(startIndex(undefined, 'dp-2', false)).toBe(0);
    expect(startIndex({ resume: true }, 'a-slide-that-was-removed', false)).toBe(0);
    expect(slideIndexOfSection('nope')).toBe(0);
    expect(ALL_SLIDES[slideIndexOfKey(last)].group).toBe('finish');
  });

  test('a fresh install starts with nothing saved', () => {
    expect(DEFAULT_SETTINGS.discoverLastSlide).toBe('');
    expect(DEFAULT_SETTINGS.discoverTourDone).toBe(false);
  });
});

describe('D3/D6. "Try it" never mixes demo data into your own', () => {
  test('your data or an account: the real section; nothing yet: the demo; already in the demo: stay', () => {
    expect(tryItDestination({ inDemo: false, signedIn: false, hasData: true })).toBe('real');
    expect(tryItDestination({ inDemo: false, signedIn: true, hasData: false })).toBe('real');
    expect(tryItDestination({ inDemo: false, signedIn: false, hasData: false })).toBe('demo');
    expect(tryItDestination({ inDemo: true, signedIn: true, hasData: true })).toBe('here');
  });

  test('the demo path switches the whole data space (never writes sample data into the real store)', () => {
    const src = read('src/discover/tryIt.ts');
    expect(src).toMatch(/enter\(\{ offerTour: false \}\)/);
    expect(src).not.toMatch(/setState|addEntry|localData|AsyncStorage|demoSeed/);
    expect(read('src/demo/useDemoActions.ts')).toMatch(/switchDataSpace\('demo'\)/);
  });
});

describe('D1/D6. Entry points work signed out, offline and with an expired trial', () => {
  test('Discover and the tour depend on no account, network, entitlement or server', () => {
    for (const f of ['src/screens/DiscoverScreen.tsx', 'src/screens/DiscoverTourScreen.tsx', 'src/discover/content.ts', 'src/discover/TourMock.tsx', 'src/discover/SeeHowItWorks.tsx']) {
      expect(read(f)).not.toMatch(/supabase|useEntitlement|isOnline|fetch\(|useAuthStore|syncGate|paywall/i);
    }
  });

  test('entry points: Home icon, Settings → Help, Welcome, section empty states', () => {
    expect(read('src/screens/RecapScreen.tsx')).toMatch(/accessibilityLabel="Discover Ona"/);
    const help = read('src/screens/settings/HelpAboutPages.tsx');
    expect(help).toMatch(/label="Discover Ona"/);
    expect(help).toMatch(/label="Replay tour"/);
    expect(read('src/screens/WelcomeScreen.tsx')).toMatch(/discoverTour/);
    for (const f of ['HabitBuilderScreen', 'QuitHabitScreen', 'SkillsScreen', 'BudgetScreen', 'BookScreen', 'PlanListScreen']) {
      expect(read(`src/screens/${f}.tsx`)).toMatch(/<SeeHowItWorks sectionId="/);
    }
  });

  test('the old 5-card demo tour is gone, replaced by an offer of this tour', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'src/demo/DemoTour.tsx'))).toBe(false);
    expect(read('src/demo/useDemoActions.ts')).toMatch(/navigateWhenReady\('discoverTour'/);
  });
});

describe('D5. Analytics: generic events only, with consent', () => {
  afterEach(() => setAnalyticsTransport(null));

  test('the four events are allowed, and carry nothing about slides or you', () => {
    for (const e of ['discover_opened', 'tour_started', 'tour_completed', 'demo_started']) expect(ALLOWED_EVENTS).toContain(e);
    const sent: Record<string, unknown>[] = [];
    setAnalyticsTransport((ev) => sent.push(ev as unknown as Record<string, unknown>));
    useSettingsStore.getState().setConsent({ storeData: true, analytics: true });
    track('tour_started', { slide: 'dp-2', section: 'dailyPlanning', title: 'A full task page' });
    expect(sent).toHaveLength(1);
    expect(Object.keys(sent[0]).sort()).toEqual(['at', 'name']);
  });

  test('nothing is sent without consent', () => {
    const sent: unknown[] = [];
    setAnalyticsTransport((ev) => sent.push(ev));
    useSettingsStore.getState().setConsent({ storeData: true, analytics: false });
    track('discover_opened');
    expect(sent).toHaveLength(0);
  });

  test('"demo_started" is sent before switching (nothing is sent from inside the demo)', () => {
    const src = read('src/demo/useDemoActions.ts');
    expect(src.indexOf("track('demo_started')")).toBeGreaterThan(0);
    expect(src.indexOf("track('demo_started')")).toBeLessThan(src.indexOf("switchDataSpace('demo')"));
  });

  test('the tour sends only generic events', () => {
    const src = read('src/screens/DiscoverTourScreen.tsx') + read('src/screens/DiscoverScreen.tsx');
    const calls = src.match(/track\([^)]*\)/g) ?? [];
    expect(calls.sort()).toEqual(["track('discover_opened')", "track('tour_completed')", "track('tour_started')"]);
  });
});

describe('D3/D6. Words and translations', () => {
  test('a missing translation falls back to English, never blank', () => {
    TRANSLATIONS.xx = { next: 'Weiter' };
    expect(t('next', {}, 'xx')).toBe('Weiter');
    expect(t('skip', {}, 'xx')).toBe('Skip'); // missing in "xx"
    expect(t('skip', {}, 'unknown-language')).toBe('Skip');
    delete TRANSLATIONS.xx;
  });

  test('placeholders are filled in', () => {
    expect(t('slideOf', { n: 3, total: 46 })).toBe('Slide 3 of 46');
  });

  test('the components take their words from the content file', () => {
    const tour = read('src/screens/DiscoverTourScreen.tsx');
    expect(tour).not.toMatch(/label="(Skip|Next|Back|Try it)"/);
    expect(tour).toMatch(/t\('skip'\)/);
  });
});

describe('D3. Accessibility', () => {
  test('Skip is always labelled; the mock pictures are hidden from screen readers; off-screen slides too', () => {
    const tour = read('src/screens/DiscoverTourScreen.tsx');
    expect(tour).toMatch(/accessibilityLabel=\{last \? t\('close'\) : t\('skip'\)\}/);
    expect(tour).toMatch(/accessibilityElementsHidden=\{!current\}/);
    expect(tour).toMatch(/isReduceMotionEnabled/);
    expect(tour).toMatch(/animated: !reduceMotion/);
    expect(read('src/discover/TourMock.tsx')).toMatch(/importantForAccessibility="no-hide-descendants"/);
  });
});
