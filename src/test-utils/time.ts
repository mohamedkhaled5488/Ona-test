// Time control for tests. Never let a test depend on the real date or the
// machine's time zone.
//
//   useClock('2026-10-18T09:00')   // local time in the test zone (America/New_York)
//   clock.set('2026-10-19T00:01')  // jump
//   clock.advance(15 * 60_000)     // move forward
//   restoreClock()                 // in afterEach
//
// It sets both the app's own clock (utils/clock.ts) and Date itself (Jest's
// modern fake timers with advanceTimers on, so setTimeout and awaits still
// work), so code that calls `new Date()` follows the same time.
import { resetClock, setClock } from '../utils/clock';

// The zone every Jest worker runs in (jest.globalSetup.js). It has daylight
// saving, so DST cases are real.
export const TEST_ZONE = 'America/New_York';

// Daylight saving changes in the test zone, 2026: clocks go 2:00 -> 3:00 on
// the start date and 2:00 -> 1:00 on the end date.
export const DST_2026 = { start: '2026-03-08', end: '2026-11-01' } as const;

// Month ends and other dates past bugs have tripped on.
export const TRICKY_DATES = {
  leapDay: '2028-02-29',
  feb28NonLeap: '2027-02-28',
  monthEnd30: '2026-09-30',
  monthEnd31: '2026-10-31',
  yearEnd: '2026-12-31',
  yearStart: '2027-01-01',
} as const;

// "2026-10-18T09:00" read as local time in the test zone.
export function localMs(localIso: string): number {
  const [d, t = '00:00'] = localIso.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm = 0, ss = 0] = t.split(':').map(Number);
  return new Date(y, m - 1, day, hh, mm, ss).getTime();
}

export interface TestClock {
  set: (localIso: string) => void;
  advance: (ms: number) => void;
  now: () => number;
}

let current = 0;

export function useClock(localIso: string): TestClock {
  current = localMs(localIso);
  jest.useFakeTimers({ now: current, advanceTimers: true, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  setClock(() => Date.now());
  return {
    set: (iso) => {
      current = localMs(iso);
      jest.setSystemTime(current);
    },
    advance: (ms) => {
      current = Date.now() + ms;
      jest.setSystemTime(current);
    },
    now: () => Date.now(),
  };
}

export function restoreClock(): void {
  resetClock();
  jest.useRealTimers();
}
