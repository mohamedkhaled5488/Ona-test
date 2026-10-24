// The modes have one name each, set in config/plans.ts: "Essentials mode"
// (after the trial, without Plus), "Plus" (the full mode) and "Plus trial".
// Every surface uses them; none says "free version", "expired", "downgrade"
// or "limited". IDs: docs/test-cases/plans.md (NAME-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import { ESSENTIALS_NAME, PLUS_NAME, TRIAL_NAME, STATE_COPY, PLAN_COMPARISON, planDescriptionText } from '../../config/plans';
import { stateCard } from '../../billing/planState';
import { planLabel } from '../../screens/settings/AccountPages';
import { dueNotice } from '../../billing/paywall';
import { computeEntitlement, type EntitlementState } from '../entitlement';
import { forcedSnapshot } from '../../hooks/useEntitlement';
import { TOUR } from '../../discover/content';

const fs = require('fs') as { readFileSync: (p: string, e: string) => string; readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[] };
const path = require('path') as { join: (...p: string[]) => string; relative: (a: string, b: string) => string };

function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['__tests__', 'test-utils'].includes(e.name)) files(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, '')).join('\n');
// What a person can read: strings and JSX text with a space or a capital
// (one-word lowercase strings are ids, such as the 'expired' state).
function texts(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`|>([^<>{}]+)</g)) {
    const t = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (t && /[a-z]/i.test(t) && (/\s/.test(t) || /^[A-Z]/.test(t))) out.push(t);
  }
  return out;
}
const COPY = files(path.join(process.cwd(), 'src')).flatMap((f) => texts(withoutComments(fs.readFileSync(f, 'utf8'))).map((t) => ({ f: path.relative(process.cwd(), f), t })));

test('NAME-001 the three state sentences, exactly', () => {
  expect(STATE_COPY.trial(23)).toBe('Plus trial, 23 days left. All features on.');
  expect(STATE_COPY.trial(1)).toBe('Plus trial, 1 day left. All features on.');
  expect(STATE_COPY.essentials).toBe('Essentials mode. Your data is safe on this phone.');
  expect(STATE_COPY.plus).toBe('Plus.');
  expect([ESSENTIALS_NAME, PLUS_NAME, TRIAL_NAME]).toEqual(['Essentials mode', 'Plus', 'Plus trial']);
});

test('NAME-002 no "free version", "expired", "downgrade" or "limited" anywhere a person can read', () => {
  const banned = /\b(free version|expired?|downgrad\w*|limited)\b/i;
  expect(COPY.filter(({ t }) => banned.test(t)).map(({ f, t }) => `${f}: "${t.slice(0, 90)}"`)).toEqual([]);
});

test('NAME-003 no other name for the modes', () => {
  const other = /\b(free plan|free tier|free mode|paid plan|paid version|premium|pro plan|ona plus|basic plan|free trial|trial ended)\b|^(Free|Paid|Trial|Subscribed)\b(?! of| ·)|^Trial,/i;
  // The crisis lines (config/about.ts) say a helpline is free of cost: that's
  // the service, not an Ona mode.
  const helplines = (f: string) => /config[\\/]about\.ts$/.test(f);
  expect(COPY.filter(({ f, t }) => other.test(t) && !helplines(f)).map(({ f, t }) => `${f}: "${t.slice(0, 90)}"`)).toEqual([]);
});

const STATES: EntitlementState[] = ['free', 'trial', 'trialEnded', 'subscribed', 'canceledActive', 'grace', 'onHold', 'expired', 'lifetime'];
const now = Date.parse('2026-10-24T12:00:00Z');
const ent = (s: EntitlementState) => computeEntitlement(forcedSnapshot(s, now), now);

test('NAME-004 Plan & usage and Settings → Account: every state is named Plus trial, Plus or Essentials mode', () => {
  for (const s of STATES) {
    const e = ent(s);
    expect({ s, title: [STATE_COPY.essentials, STATE_COPY.plus, ...(e.state === 'trial' ? [STATE_COPY.trial(e.trialDaysLeft ?? 0)] : [])].includes(stateCard(e).title) }).toEqual({ s, title: true });
    expect({ s, label: planLabel(e).startsWith(TRIAL_NAME) || [PLUS_NAME, ESSENTIALS_NAME].includes(planLabel(e)) }).toEqual({ s, label: true });
  }
  expect(planLabel(ent('trialEnded'))).toBe(ESSENTIALS_NAME);
  expect(planLabel(ent('subscribed'))).toBe(PLUS_NAME);
});

test('NAME-005 the banners use the same names', () => {
  const ending = dueNotice({ ...ent('trial'), trialDaysLeft: 3 }, []);
  expect(ending?.title).toBe(STATE_COPY.trial(3));
  const last = dueNotice({ ...ent('trial'), trialDaysLeft: 1 }, []);
  expect(last?.title).toContain(TRIAL_NAME);
  expect(dueNotice(ent('trialEnded'), [])?.title).toBe(STATE_COPY.essentials);
});

test('NAME-006 the comparison, the store text and the tour all use the names from the config', () => {
  const planPage = fs.readFileSync(path.join(process.cwd(), 'src/screens/settings/PlanPage.tsx'), 'utf8');
  expect(planPage).toMatch(/\{ESSENTIALS_NAME\}/);
  expect(planPage).toMatch(/\{PLUS_NAME\}/);
  const text = planDescriptionText();
  expect(text).toContain(ESSENTIALS_NAME);
  expect(text).toContain(TRIAL_NAME);
  expect(PLAN_COMPARISON.length).toBeGreaterThan(10);
  const tour = JSON.stringify(TOUR);
  expect(tour).toContain(ESSENTIALS_NAME);
  expect(tour).toContain(TRIAL_NAME);
});
