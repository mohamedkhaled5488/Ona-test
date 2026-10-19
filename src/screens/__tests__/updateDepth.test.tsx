// Regression: "Maximum update depth exceeded" crashed Daily Planning. Root
// cause: a store selector built a new array on every call
// (usePlanStore((s) => s.plans.filter(...)) in the plan-step picker), so
// React saw "changed" state on every render and re-rendered forever.
// 1) No selector anywhere may build a new array or object (do it in the
//    render body, or wrap the selector in useShallow).
// 2) The screen that crashed opens its picker, with plans, without the loop.
// IDs: docs/audit-report.md (FIX-REG-01)
jest.mock('../../utils/notifications', () => ({
  cancelReminders: jest.fn(async () => {}),
  scheduleReminder: jest.fn(async () => []),
  scheduleTaskReminders: jest.fn(async () => []),
}));
jest.setTimeout(30_000);

import { screen, userEvent } from '@testing-library/react-native';
import { resetAll, useClock, restoreClock } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { usePlanStore } from '../../store/usePlanStore';
import { DailyPlanningScreen } from '../DailyPlanningScreen';

const fs = require('fs') as { readFileSync: (p: string, e: string) => string; readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[] };
const path = require('path') as { join: (...p: string[]) => string; relative: (a: string, b: string) => string };

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'test-utils') sourceFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

// The selector passed to every useXxxStore( ... ) call, with nested
// brackets balanced.
function selectors(src: string): string[] {
  const out: string[] = [];
  const re = /\buse[A-Z]\w*Store\(/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
    }
    out.push(src.slice(start, i - 1));
  }
  return out;
}

// Builds something new each call: a copy, a literal, or a derived list.
const NEW_EACH_CALL = /\.(filter|map|slice|concat|sort|toSorted|reverse|flatMap|flat)\(|Object\.(keys|values|entries|fromEntries|assign)\(|Array\.from\(|=>\s*\(\s*\{|=>\s*\[|\[\s*\.\.\.|\{\s*\.\.\.|new (Map|Set|Date)\(/;

test('FIX-REG-01a no store selector builds a new array or object on each call', () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(path.join(process.cwd(), 'src'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const sel of selectors(src)) {
      if (!/=>/.test(sel) || /useShallow/.test(sel)) continue; // not a selector, or compared shallowly
      if (NEW_EACH_CALL.test(sel)) offenders.push(`${path.relative(process.cwd(), file)}: ${sel.replace(/\s+/g, ' ').slice(0, 100)}`);
    }
  }
  expect(offenders).toEqual([]);
});

test('FIX-REG-01b the check itself catches the selector that crashed Daily Planning', () => {
  const crashed = 'const active = usePlanStore((s) => s.plans.filter((p) => p.status === \'active\'));';
  expect(selectors(crashed).some((s) => NEW_EACH_CALL.test(s))).toBe(true);
  expect(selectors('const plans = usePlanStore((s) => s.plans);').some((s) => NEW_EACH_CALL.test(s))).toBe(false);
});

describe('FIX-REG-01c Daily Planning with plans, picker open', () => {
  beforeEach(async () => {
    await resetAll();
    useClock('2026-10-18T09:00');
  });
  afterEach(() => restoreClock());

  test('opens and stays open without the update loop', async () => {
    const errors: string[] = [];
    const spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args.map(String).join(' ')));
    try {
      const a = usePlanStore.getState().createPlan('Run a 10K', 'Feel strong', '#3D8B7A');
      usePlanStore.getState().addStep(a, [], 'Buy running shoes');
      const b = usePlanStore.getState().createPlan('Old plan', '', '#8B72B0');
      usePlanStore.getState().addStep(b, [], 'Archived step');
      usePlanStore.getState().archivePlan?.(b, { worked: '', differently: '' } as never);

      await renderScreen('dailyPlanning', DailyPlanningScreen);
      const user = userEvent.setup();
      await user.press(await screen.findByText('Pull a step from Plan Builder'));
      expect(await screen.findByText('Buy running shoes')).toBeTruthy();
      expect(errors.filter((e) => /Maximum update depth|getSnapshot should be cached/.test(e))).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
