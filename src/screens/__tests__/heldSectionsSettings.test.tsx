// Held sections, on screen (owner, 2026-11-01: Settings still mentioned Mind
// Games). Every Settings page, through the real Settings screen: no held
// section's name; and Recap's "Choose what Recap shows" lists every live one.
// Opening a held section from anywhere does nothing (it has no screen).
// IDs: docs/test-cases/integration.md (HELD-*)
jest.mock('../../utils/notifications', () => ({ ...jest.requireActual('../../utils/notifications'), cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []), getNotificationPermission: jest.fn(async () => ({ state: 'granted', canAskAgain: true })) }));
jest.setTimeout(60_000);

import { act, screen } from '@testing-library/react-native';
import { resetAll } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { renderApp } from '../../test-utils/renderApp';
import { SettingsScreen } from '../SettingsScreen';
import { SETTINGS_SECTIONS, type SettingsPage } from '../settings/pages';
import { heldSectionIds, sectionsMeta } from '../../data/sectionsMeta';
import { RECAP_SECTIONS } from '../../utils/recapStats';
import { openSection } from '../../navigation/navigationRef';

beforeEach(async () => {
  await resetAll();
});

const HELD = heldSectionIds();
const titleOf = (id: string) => sectionsMeta.find((m) => m.id === id)!.title;
const heldPattern = new RegExp(HELD.flatMap((id) => [titleOf(id), titleOf(id).replace(/s$/, '')]).join('|'), 'i');
const shownText = () => JSON.stringify(screen.toJSON());

// Pages that need more than a page name (a PIN scope) or are debug-only.
const PAGES: SettingsPage[] = ['root', 'account', 'plan', 'notifications', 'privacy', 'storedWhere', 'appearance', 'sound', 'sections', 'help', 'safety', 'about', 'whatsNew', 'dataSafety'];

test.each(PAGES)('HELD-009 Settings → %s names no held section', async (page) => {
  await renderScreen('settings', SettingsScreen, { page });
  expect(shownText()).not.toMatch(heldPattern);
});

test.each(SETTINGS_SECTIONS)('HELD-009 Settings → Sections → %s names no held section', async (section) => {
  await renderScreen('settings', SettingsScreen, { page: 'section', section });
  expect(shownText()).not.toMatch(heldPattern);
});

test('HELD-010 "Choose what Recap shows" lists every live section Recap shows, and no held one', async () => {
  await renderScreen('settings', SettingsScreen, { page: 'section', section: 'recap' });
  for (const id of RECAP_SECTIONS) expect(screen.getAllByText(titleOf(id)).length).toBeGreaterThan(0);
  expect(shownText()).not.toMatch(heldPattern);
});

test('HELD-011 opening a held section does nothing: Ona stays where it was', async () => {
  const app = await renderApp();
  const before = app.route();
  for (const id of HELD) await act(async () => openSection(id as never));
  expect(app.route()).toEqual(before);
});
