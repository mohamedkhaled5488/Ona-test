// Signing out keeps everything on the device; signing up records the
// consents exactly as ticked and starts the trial.
jest.mock('../notifications', () => ({
  cancelReminders: jest.fn(async () => {}),
  scheduleReminder: jest.fn(async () => []),
}));

const mockAuth = {
  signOut: jest.fn(async () => ({ error: null })),
  signUp: jest.fn(async (): Promise<{ data: { user: unknown }; error: null }> => ({ data: { user: { identities: [{ provider: 'email' }] } }, error: null })),
  signInWithIdToken: jest.fn(async () => ({ data: { user: { created_at: new Date().toISOString() } }, error: null })),
  signInWithPassword: jest.fn(async () => ({ error: null })),
  updateUser: jest.fn(async () => ({ error: null })),
};
const mockRpc = jest.fn(async () => ({ error: null }));
jest.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabaseUrl: undefined,
  // Getters, because this factory runs before the consts above are initialised.
  supabase: {
    get auth() {
      return mockAuth;
    },
    rpc: (...args: unknown[]) => (mockRpc as (...a: unknown[]) => unknown)(...args),
  },
}));

// A stand-in for the native Google module (the real one needs a device build).
const mockGoogleCalls: string[] = [];
jest.mock('../../auth/googleSignIn', () => {
  const actual = jest.requireActual('../../auth/googleSignIn');
  const google = {
    configure: () => {},
    hasPlayServices: async () => true,
    signIn: async () => ({ type: 'success', data: { idToken: 'tok', user: { email: 'g@example.com' } } }),
    getTokens: async () => ({ idToken: 'tok2', accessToken: 'a' }),
    signOut: async () => void mockGoogleCalls.push('signOut'),
    revokeAccess: async () => void mockGoogleCalls.push('revokeAccess'),
  };
  return { ...actual, googleModule: () => google, googleWebClientId: () => 'web.apps.googleusercontent.com' };
});
jest.mock('../network', () => ({ isOnline: async () => true }));

import { useAuthStore } from '../../store/useAuthStore';
import { useAccountStore } from '../../store/useAccountStore';
import { useSettingsStore, DEFAULT_SETTINGS } from '../../store/useSettingsStore';
import { useFeelingsStore } from '../../store/useFeelingsStore';
import { usePlanStore } from '../../store/usePlanStore';
import { setAnalyticsTransport, type OutgoingEvent } from '../analytics';

beforeEach(() => {
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, consent: { ...DEFAULT_SETTINGS.consent } });
  useAccountStore.setState({ lastSyncedAt: undefined, syncPaused: false });
});

test('signing out keeps every section and setting on this device', async () => {
  const feelings = useFeelingsStore.getState().entries;
  const plans = usePlanStore.getState().plans;
  useSettingsStore.getState().set('theme', 'light');
  await useAuthStore.getState().signOut();
  expect(mockAuth.signOut).toHaveBeenCalled();
  expect(useFeelingsStore.getState().entries).toBe(feelings);
  expect(usePlanStore.getState().plans).toBe(plans);
  expect(useSettingsStore.getState().theme).toBe('light');
  expect(mockRpc).not.toHaveBeenCalled();
});

test('sign-up records the consents as ticked; the trial is left to the server', async () => {
  const sent: OutgoingEvent[] = [];
  setAnalyticsTransport((e) => sent.push(e));
  await useAuthStore.getState().signUp('a@b.co', 'secret1', { storeData: true, analytics: false, tips: true });
  expect(useSettingsStore.getState().consent).toEqual({ storeData: true, analytics: false, tips: true });
  // Analytics consent was not given, so the sign-up event never left.
  expect(sent).toEqual([]);
  // The device never starts a trial itself (that's start_trial() on sign-in).
  expect(mockRpc).not.toHaveBeenCalled();
  setAnalyticsTransport(null);
});

test('with analytics consent, sign-up sends only the generic events', async () => {
  const sent: OutgoingEvent[] = [];
  setAnalyticsTransport((e) => sent.push(e));
  await useAuthStore.getState().signUp('c@d.co', 'secret1', { storeData: false, analytics: true, tips: false });
  expect(sent.map((e) => e.name)).toEqual(['signup']);
  expect(JSON.stringify(sent)).not.toContain('c@d.co');
  setAnalyticsTransport(null);
});

test('Continue with Google switches on only the consents that were ticked', async () => {
  const sent: OutgoingEvent[] = [];
  setAnalyticsTransport((e) => sent.push(e));
  const result = await useAuthStore.getState().signInWithGoogle({ storeData: true, analytics: false, tips: false });
  expect(result).toEqual({ ok: true, isNewUser: true });
  expect(mockAuth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'tok' });
  expect(useSettingsStore.getState().consent).toEqual({ storeData: true, analytics: false, tips: false });
  expect(sent).toEqual([]); // analytics wasn't ticked
  setAnalyticsTransport(null);
});

test('Continue with Google with nothing ticked turns nothing on', async () => {
  await useAuthStore.getState().signInWithGoogle({ storeData: false });
  expect(useSettingsStore.getState().consent).toEqual({ storeData: false, analytics: false, tips: false });
});

test('signing out also clears the Google session', async () => {
  mockGoogleCalls.length = 0;
  await useAuthStore.getState().signOut();
  expect(mockGoogleCalls).toEqual(['signOut']);
});

test('signing up with an email that already has an account says so, instead of "check your email"', async () => {
  mockAuth.signUp.mockResolvedValueOnce({ data: { user: { identities: [] } }, error: null });
  const ok = await useAuthStore.getState().signUp('taken@example.com', 'secret1', { storeData: false, analytics: false, tips: false });
  expect(ok).toBe(false);
  expect(useAuthStore.getState().error).toMatch(/already has an Ona account/);
});
