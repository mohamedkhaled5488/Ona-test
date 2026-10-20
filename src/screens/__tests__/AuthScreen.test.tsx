// The sign-in screen says what signing in does, next to every button:
// Ona's own buttons carry it in their label, and the full sentence sits
// under the email button and under Google's (whose wording is fixed by
// Google), in both "Sign in" and "Create account". Pressing a button records
// which screen the person used. IDs: docs/test-cases/integration.md (AUTH-C-*)
jest.mock('../../utils/notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));
const mockNoted: string[] = [];
jest.mock('../../sync/accountConsent', () => ({
  ...jest.requireActual('../../sync/accountConsent'),
  noteConsentSource: (s: string) => void mockNoted.push(s),
}));
jest.setTimeout(20_000);

import { screen, userEvent } from '@testing-library/react-native';
import { resetAll } from '../../test-utils';
import { renderScreen } from '../../test-utils/render';
import { AuthScreen } from '../AuthScreen';
import { useAuthStore } from '../../store/useAuthStore';
import { ACCOUNT_STORAGE_SENTENCE, SIGN_IN_LABEL, SIGN_UP_LABEL } from '../../config/consentWording';

beforeEach(async () => {
  await resetAll();
  mockNoted.length = 0;
});

test('AUTH-C-001 "Create account": the button says it syncs your data, and the sentence is under the email button and under Google\'s', async () => {
  await renderScreen('signIn', AuthScreen);
  expect(screen.getByText(SIGN_UP_LABEL)).toBeTruthy();
  expect(screen.getByTestId('consent-sentence-email').props.children).toBe(ACCOUNT_STORAGE_SENTENCE);
  expect(screen.getByTestId('consent-sentence-google').props.children).toBe(ACCOUNT_STORAGE_SENTENCE);
  expect(screen.getByText('Continue with Google')).toBeTruthy(); // Google's own wording, unchanged
  expect(screen.queryByText('Store my feelings and habit data in my Ona account')).toBeNull(); // no box to tick
});

test('AUTH-C-002 "Sign in": the same, with "Sign in and sync my data"', async () => {
  await renderScreen('signIn', AuthScreen);
  const user = userEvent.setup();
  await user.press(screen.getByText('Sign in'));
  expect(screen.getByText(SIGN_IN_LABEL)).toBeTruthy();
  expect(screen.getAllByText(ACCOUNT_STORAGE_SENTENCE)).toHaveLength(2);
});

test('AUTH-C-003 the sentence is separate from the Terms, and says plainly what is kept and how to turn it off', () => {
  expect(ACCOUNT_STORAGE_SENTENCE).toMatch(/journal, feelings, habits and Quit tracking/);
  expect(ACCOUNT_STORAGE_SENTENCE).toMatch(/Turn this off any time in Settings/);
  expect(ACCOUNT_STORAGE_SENTENCE).not.toMatch(/terms/i);
});

test('AUTH-C-004 pressing Google on "Create account" records that screen before signing in', async () => {
  const signInWithGoogle = jest.fn(async () => ({ ok: false, kind: 'cancelled' as const, message: '' }));
  useAuthStore.setState({ signInWithGoogle } as never);
  await renderScreen('signIn', AuthScreen);
  const user = userEvent.setup();
  await user.press(screen.getByText('Continue with Google'));
  expect(mockNoted).toEqual(['google-sign-up']);
  expect(signInWithGoogle).toHaveBeenCalledWith({ analytics: false, tips: false }); // sync is the account check's call, not a box
});
