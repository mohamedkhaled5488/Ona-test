// Part B: config/plans.ts is the one source for Essentials mode and Plus, and
// the app does what it says: every Plus feature and every cap in the config
// is enforced in code and appears in the comparison; descriptions carry no
// prices and no false claims; the state matrix and the caps behave as
// described; nothing anyone made is deleted, and Quit is never capped.
// IDs: docs/test-cases/plans.md (PLAN-CFG-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import { FREE_CAPS, PLAN_COMPARISON, PLUS_FEATURES, planDescriptionText, TRIAL_DAYS, type PlusFeatureId } from '../../config/plans';
import { canCreate, canPlanMealOn, isPlusNow, lastPlannableDate, usedNow } from '../../plans/access';
import { usePlanStore } from '../../store/usePlanStore';
import { useHabitsStore } from '../../store/useHabitsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useEntitlementStore } from '../../store/useEntitlementStore';
import { useSettingsStore, DEFAULT_SETTINGS } from '../../store/useSettingsStore';
import { setDataSpace } from '../dataSpace';
import { resetAll, makeHabit, useClock, restoreClock } from '../../test-utils';

const fs = require('fs') as { readFileSync: (p: string, e: string) => string; readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[] };
const path = require('path') as { join: (...p: string[]) => string };
function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['__tests__', 'test-utils'].includes(e.name)) files(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const CODE = files(path.join(process.cwd(), 'src')).filter((f) => !/config[\\/]plans\.ts$/.test(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

const DAY = 86_400_000;
const T = Date.parse('2026-10-24T12:00:00Z');
beforeEach(async () => {
  await resetAll();
  setDataSpace('real');
  useClock('2026-10-24T12:00');
});
afterEach(() => restoreClock());

describe('PLAN-CFG: the config and the code agree', () => {
  test('PLAN-CFG-001 every Plus feature is enforced somewhere in the app', () => {
    for (const id of Object.keys(PLUS_FEATURES) as PlusFeatureId[]) {
      const enforced = id === 'sync' ? /canUpload\(/.test(CODE) : new RegExp(`feature="${id}"|'${id}'|PLUS_FEATURES\\.${id}\\b`).test(CODE);
      expect({ id, enforced }).toEqual({ id, enforced: true });
    }
  });

  test('PLAN-CFG-002 every cap is checked where things are created', () => {
    for (const cap of Object.keys(FREE_CAPS) as (keyof typeof FREE_CAPS)[]) {
      const enforced = cap === 'dietWeeksAhead' ? /useMealDateGuard\(\)/.test(CODE) && /guardMealDate\(/.test(CODE) : new RegExp(`guard\\('${cap}'`).test(CODE);
      expect({ cap, enforced }).toEqual({ cap, enforced: true });
    }
  });

  test('PLAN-CFG-003 the comparison covers every Plus feature and every cap, and names only real ones', () => {
    const plus = new Set(PLAN_COMPARISON.flatMap((r) => r.enforces.plus ?? []));
    const caps = new Set(PLAN_COMPARISON.map((r) => r.enforces.cap).filter(Boolean));
    expect([...plus].sort()).toEqual(Object.keys(PLUS_FEATURES).sort());
    expect([...caps].sort()).toEqual(Object.keys(FREE_CAPS).sort());
  });

  test('PLAN-CFG-004 the numbers in the comparison are the caps', () => {
    for (const r of PLAN_COMPARISON) {
      const cap = r.enforces.cap;
      if (cap && cap !== 'dietWeeksAhead') expect({ feature: r.feature, says: r.free.includes(String(FREE_CAPS[cap])) }).toEqual({ feature: r.feature, says: true });
    }
  });

  test('PLAN-CFG-005 no prices or percentages, and no claims Ona can\'t back', () => {
    const all = [planDescriptionText(), ...Object.values(PLUS_FEATURES).flatMap((f) => [f.title, f.line]), ...PLAN_COMPARISON.flatMap((r) => [r.feature, r.free, r.plus])].join('\n');
    expect(all).not.toMatch(/[$€£¥]|\b\d+(\.\d+)?\s?%|\bper (month|year)\b/i);
    expect(all).not.toMatch(/end-to-end|encrypt|photo sync|sync(s|ed)? (your )?photos|therap|cure|treat|diagnos|clinical|medical/i);
    expect(planDescriptionText()).toContain(String(TRIAL_DAYS));
  });

  test('PLAN-CFG-006 Quit, support resources and the plain data export are never capped or locked', () => {
    expect(Object.keys(FREE_CAPS).some((c) => /quit/i.test(c))).toBe(false);
    expect(PLAN_COMPARISON.find((r) => r.feature === 'Quit a Habit')!.free).toMatch(/Unlimited/);
    expect(PLAN_COMPARISON.find((r) => r.feature === 'Support and crisis resources')).toMatchObject({ free: 'Always', plus: 'Always' });
    expect(PLAN_COMPARISON.find((r) => r.feature === 'Export')!.free).toMatch(/always/i);
    expect(CODE).not.toMatch(/plusAction\('pdfExports', async \(\) => \{\s*const result = await exportQuitJourneyAsPdf/);
  });
});

describe('PLAN-CFG: how Essentials mode, the trial and Plus behave', () => {
  const trialEnding = (inMs: number) => ({ userId: 'u1', serverTime: new Date(T).toISOString(), fetchedAt: T, trial: { startedAt: new Date(T - 20 * DAY).toISOString(), endsAt: new Date(T + inMs).toISOString() }, subscription: null });
  const signedIn = (snapshot: object | null) => {
    useAuthStore.setState({ session: { user: { id: 'u1' } } as never });
    if (snapshot) useEntitlementStore.getState().saveSnapshot(snapshot as never);
  };

  test('PLAN-CFG-010 the trial is the full Plus experience until its last minute, then Essentials mode', () => {
    signedIn(trialEnding(10 * DAY));
    expect(isPlusNow(T)).toBe(true); // day 20 of 30
    expect(isPlusNow(T + 10 * DAY - 60_000)).toBe(true); // the last minute
    expect(isPlusNow(T + 10 * DAY + 60_000)).toBe(false); // over
    useAuthStore.setState({ session: null });
    expect(isPlusNow(T)).toBe(false); // no account: Essentials mode
    setDataSpace('demo');
    expect(isPlusNow(T)).toBe(true); // the demo shows everything
  });

  test('PLAN-CFG-011 at a cap in Essentials mode, one more waits for Plus; with Plus there\'s no cap', () => {
    for (let i = 0; i < FREE_CAPS.buildHabits; i++) useHabitsStore.setState((s) => ({ habits: [...s.habits, makeHabit({ id: `h${i}` })] }));
    expect(usedNow('buildHabits')).toBe(FREE_CAPS.buildHabits);
    expect(canCreate('buildHabits', false)).toBe(false);
    expect(canCreate('buildHabits', true)).toBe(true);
  });

  test('PLAN-CFG-012 over a cap after a trial, nothing is deleted or changed: every item stays as it was', () => {
    for (let i = 0; i < 5; i++) usePlanStore.getState().createPlan(`Plan ${i}`, '', '#3D8B7A');
    const before = JSON.stringify(usePlanStore.getState().plans);
    expect(canCreate('activePlans', false)).toBe(false);
    expect(JSON.stringify(usePlanStore.getState().plans)).toBe(before);
    // Archiving one makes room, it's not required to keep using the others.
    usePlanStore.getState().archivePlan(usePlanStore.getState().plans[0].id, { worked: '', differently: '' } as never);
    expect(usedNow('activePlans')).toBe(4);
  });

  test('PLAN-CFG-013 Diet in Essentials mode: plan up to next week; past weeks stay open', () => {
    useSettingsStore.setState({ ...DEFAULT_SETTINGS, weekStartsOn: 1 });
    // Saturday 2026-10-24: this week is Oct 19-25, next week Oct 26 - Nov 1.
    expect(lastPlannableDate('2026-10-24')).toBe('2026-11-01');
    expect(canPlanMealOn('2026-11-01', false, '2026-10-24')).toBe(true);
    expect(canPlanMealOn('2026-11-02', false, '2026-10-24')).toBe(false);
    expect(canPlanMealOn('2026-09-01', false, '2026-10-24')).toBe(true); // the past stays editable
    expect(canPlanMealOn('2027-01-01', true, '2026-10-24')).toBe(true); // Plus: no horizon
  });

  test('PLAN-CFG-014 every state the store can report maps to a mode, and only these give Plus', () => {
    const { computeEntitlement } = require('../entitlement') as typeof import('../entitlement');
    const { forcedSnapshot } = require('../../hooks/useEntitlement') as typeof import('../../hooks/useEntitlement');
    const plusStates = ['trial', 'subscribed', 'canceledActive', 'grace', 'lifetime'];
    for (const s of ['free', 'trial', 'trialEnded', 'subscribed', 'canceledActive', 'grace', 'onHold', 'expired', 'lifetime'] as const) {
      expect({ s, plus: computeEntitlement(forcedSnapshot(s, T), T).syncAccess }).toEqual({ s, plus: plusStates.includes(s) });
    }
  });
});
