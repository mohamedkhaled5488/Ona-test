// Demo mode, stage 3: ways in and out. The first-run screen (fresh install,
// no account), where leaving the demo goes, and the account, sign-in and
// purchase screens in demo. Demo mode ships in release builds; the Developer
// page stays debug-only.
// These build the full 8-week sample set; give them room on a slow, busy
// machine (a coverage run) instead of the default 5 seconds.
jest.setTimeout(20_000);

jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { __resetForTests, decideStartScreen, hasRealData, startAppData, switchDataSpace } from '../dataSpaceController';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import { DATA_SAFETY } from '../../config/about';
import { todayISO } from '../date';
import { useClock, restoreClock } from '../../test-utils';

// A fixed time, so nothing here depends on the real date (see src/test-utils/time.ts).
beforeEach(() => {
  useClock('2026-10-18T12:00');
});
afterEach(() => restoreClock());

const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
const path = require('path') as { join: (...p: string[]) => string };
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
const storage = AsyncStorage as unknown as { clear: () => Promise<void>; setItem: (k: string, v: string) => Promise<void> };

beforeEach(async () => {
  await storage.clear();
  __resetForTests();
  useSettingsStore.setState({ welcomeSeen: false });
});

describe('the first-run screen', () => {
  test('a fresh install with no account opens on it', async () => {
    await startAppData(AsyncStorage, false);
    expect(await decideStartScreen(false)).toBe('welcome');
  });

  test('signed in, or already past it: Home', async () => {
    await startAppData(AsyncStorage, false);
    expect(await decideStartScreen(true)).toBe('Main');
    useSettingsStore.getState().set('welcomeSeen', true);
    expect(await decideStartScreen(false)).toBe('Main');
  });

  test('someone updating with data already here never sees it (and is marked as past it)', async () => {
    await storage.setItem('ona.data.journaling', JSON.stringify({ v: 1, state: { entries: [{ id: 'j1', date: '2026-10-01', zone: 'calm', text: 'hi', tags: [] }] } }));
    await startAppData(AsyncStorage, false);
    expect(await decideStartScreen(false)).toBe('Main');
    expect(useSettingsStore.getState().welcomeSeen).toBe(true);
  });

  test('in demo, never', async () => {
    await startAppData(AsyncStorage, false);
    await switchDataSpace('demo');
    expect(await decideStartScreen(false)).toBe('Main');
  });
});

describe('"has data" means something the user made', () => {
  test('sections saved empty (as entering the demo does) don\'t count; one task does', async () => {
    await startAppData(AsyncStorage, false);
    await switchDataSpace('demo'); // saves every real section, empty
    await switchDataSpace('real');
    expect(await hasRealData()).toBe(false);
    useDailyPlanningStore.getState().addTask(todayISO(), 'A real task');
    await switchDataSpace('demo');
    expect(await hasRealData()).toBe(true);
  });
});

describe('screens in demo', () => {
  test('the account page, email/password changes and sign-in explain instead of acting', () => {
    const account = read('src/screens/settings/AccountPages.tsx');
    expect(account).toMatch(/export function AccountPage\(props[\s\S]{0,80}?\) \{\s*const demo = useDataSpace\(\) === 'demo';\s*if \(!demo\) return <RealAccountPage/);
    expect(account).toMatch(/export function ChangeCredentialPage\(props[\s\S]{0,80}?\) \{\s*if \(useDataSpace\(\) === 'demo'\) return <DemoNotice/);
    const auth = read('src/screens/AuthScreen.tsx');
    expect(auth).toMatch(/export function AuthScreen\(props[\s\S]{0,80}?\) \{\s*if \(useDataSpace\(\) === 'demo'\)/);
  });

  test('the plans are visible but Subscribe is off and Restore hidden, with the reason', () => {
    const plan = read('src/screens/settings/PlanPage.tsx');
    expect(plan).toMatch(/disabled=\{!selected \|\| busy \|\| demo\}/);
    expect(plan).toMatch(/\{demo && <Caption style=\{styles\.stateLine\}>\{DEMO_PURCHASE_MESSAGE\}<\/Caption>\}/);
    expect(plan).toMatch(/\{!demo && <NavRow icon="refresh-outline" label="Restore purchases"/);
  });

  test('leaving the demo with no account goes to the first-run screen', () => {
    const actions = read('src/demo/useDemoActions.ts');
    expect(actions).toMatch(/if \(!useAuthStore\.getState\(\)\.session\) setStartScreen\('welcome', await hasRealData\(\)\);\s*await switchDataSpace\('real'\);/);
  });
});

describe('release safety and privacy notes', () => {
  test('Demo mode is in Settings → Help in every build; the Developer page stays debug-only', () => {
    const help = read('src/screens/settings/HelpAboutPages.tsx');
    expect(help).toMatch(/<DemoModeGroup \/>/);
    const group = help.slice(help.indexOf('function DemoModeGroup'), help.indexOf('function ResourceRow'));
    expect(group).not.toMatch(/__DEV__/);
    expect(help.slice(help.indexOf('export function HelpPage'), help.indexOf('function DemoModeGroup'))).not.toMatch(/__DEV__ && <DemoModeGroup/);
    const router = read('src/screens/SettingsScreen.tsx');
    expect(router).toMatch(/case 'developer':\s*return __DEV__ \?/);
  });

  test('Data safety says what demo data is', () => {
    const demo = DATA_SAFETY.find((d) => d.title === 'Demo mode');
    expect(demo?.body).toMatch(/sample content/);
    expect(demo?.body).toMatch(/stored on this phone only/);
  });

  test('the first-run screen offers the demo without an account', () => {
    const welcome = read('src/screens/WelcomeScreen.tsx');
    expect(welcome).toMatch(/Explore with sample data/);
    expect(welcome).toMatch(/No account needed\./);
  });
});
