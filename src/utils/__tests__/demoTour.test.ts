// Demo mode, stage 4: the optional tour. A few cards, offered once, always
// skippable, never repeated after it's been skipped or finished, and it
// survives "Reset demo data".
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOUR_STEPS, shouldOfferTour, useTourStore } from '../../demo/tour';
import { __resetForTests, readDemoMeta, resetDemoData, startAppData, switchDataSpace, updateDemoMeta } from '../dataSpaceController';

const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
const path = require('path') as { join: (...p: string[]) => string };
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

beforeEach(async () => {
  await (AsyncStorage as unknown as { clear: () => Promise<void> }).clear();
  __resetForTests();
  useTourStore.getState().close();
});

test('four or five short cards, each opening a real screen', () => {
  expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(4);
  expect(TOUR_STEPS.length).toBeLessThanOrEqual(5);
  const nav = read('src/navigation/RootNavigator.tsx') + read('src/data/sectionsMeta.ts');
  for (const s of TOUR_STEPS) {
    expect(s.title.length).toBeLessThan(40);
    expect(s.text.length).toBeLessThan(200);
    expect(nav).toMatch(new RegExp(`name="${s.goTo.route}"|id: '${s.goTo.route}'`));
  }
  expect(TOUR_STEPS[0].title).toBe('Start here: Plan');
  expect(TOUR_STEPS.map((s) => s.title)).toEqual(expect.arrayContaining(['See your feelings over time', 'Your week in Recap']));
});

test('calm wording: no pressure', () => {
  for (const s of TOUR_STEPS) expect(`${s.title} ${s.text}`).not.toMatch(/\b(must|have to|need to|don't miss|hurry|now!)\b/i);
});

test('offered only while it hasn\'t been finished or skipped', () => {
  expect(shouldOfferTour(null)).toBe(false);
  expect(shouldOfferTour({ tourDone: false })).toBe(true);
  expect(shouldOfferTour({ tourDone: true })).toBe(false);
});

test('the cards move forward and back within bounds', () => {
  const t = useTourStore.getState();
  t.show();
  expect(useTourStore.getState()).toMatchObject({ open: true, step: -1 });
  t.goto(0);
  t.goto(99);
  expect(useTourStore.getState().step).toBe(TOUR_STEPS.length - 1);
  t.goto(-5);
  expect(useTourStore.getState().step).toBe(-1);
  t.close();
  expect(useTourStore.getState().open).toBe(false);
});

test('skipping or finishing is remembered, and "Reset demo data" keeps it (and the one-time note)', async () => {
  await startAppData(AsyncStorage, false);
  await switchDataSpace('demo');
  expect(shouldOfferTour(await readDemoMeta())).toBe(true);
  await updateDemoMeta({ tourDone: true, noteSeen: true });
  await resetDemoData();
  const meta = await readDemoMeta();
  expect(meta).toMatchObject({ tourDone: true, noteSeen: true });
  expect(shouldOfferTour(meta)).toBe(false);
});

test('every card can be skipped, and both skipping and finishing mark it done', () => {
  const src = read('src/demo/DemoTour.tsx');
  expect(src).toMatch(/label="Not now"/);
  expect((src.match(/Skip tour/g) ?? []).length).toBeGreaterThanOrEqual(2);
  expect(src).toMatch(/const finish = \(\) => \{\s*close\(\);\s*void updateDemoMeta\(\{ tourDone: true \}\);/);
  // Closing the sheet any other way (back, tapping outside) counts as skipping.
  expect(src).toMatch(/<SheetModal visible onClose=\{finish\}>/);
  // Screen readers: step count announced, each card a header.
  expect(src).toMatch(/accessibilityLiveRegion="polite"/);
  expect(src).toMatch(/accessibilityRole="header"/);
});

test('entering the demo offers it once; leaving closes it', () => {
  const actions = read('src/demo/useDemoActions.ts');
  expect(actions).toMatch(/if \(shouldOfferTour\(meta\)\) useTourStore\.getState\(\)\.show\(\);/);
  expect(actions).toMatch(/const exit = async \(\) => \{\s*useTourStore\.getState\(\)\.close\(\);/);
});
