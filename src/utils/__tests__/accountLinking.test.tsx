// One person, one account (auth/linking.ts, Settings → Account → Sign-in
// methods): list what's linked, link Google, set a password, unlink, and
// never remove the last way in. IDs: docs/test-cases/integration.md (LINK-*)
jest.mock('../notifications', () => ({ cancelReminders: jest.fn(async () => {}), scheduleReminder: jest.fn(async () => []), scheduleTaskReminders: jest.fn(async () => []) }));

import React from 'react';
import { Platform } from 'react-native';
import { screen } from '@testing-library/react-native';
import { LINKING_COPY, linkGoogle, listSignInMethods, setPassword, unlinkMethod, type LinkingAuth } from '../../auth/linking';
import { SignInMethodsGroup } from '../../screens/settings/SignInMethodsGroup';
import { renderWithApp } from '../../test-utils/render';
import { resetAll } from '../../test-utils';

type Identity = { identity_id: string; provider: string; identity_data?: Record<string, unknown> };
function fakeAuth(identities: Identity[], over: Partial<LinkingAuth> = {}) {
  const list = [...identities];
  const auth: LinkingAuth & { list: Identity[] } = {
    list,
    getUserIdentities: async () => ({ data: { identities: [...list] }, error: null }),
    linkIdentity: jest.fn(async () => {
      list.push({ identity_id: 'g1', provider: 'google', identity_data: { email: 'me@gmail.com' } });
      return { error: null };
    }),
    unlinkIdentity: jest.fn(async (i: unknown) => {
      const id = (i as Identity).identity_id;
      const at = list.findIndex((x) => x.identity_id === id);
      if (list.length <= 1) return { error: { message: 'User must have at least 1 identity after unlinking', code: 'single_identity_not_deletable' } };
      list.splice(at, 1);
      return { error: null };
    }),
    updateUser: jest.fn(async () => ({ error: null })),
    ...over,
  };
  return auth;
}
const google = (signIn: () => Promise<unknown>) => ({
  google: { configure: jest.fn(), hasPlayServices: jest.fn(async () => true), signIn, getTokens: jest.fn(async () => ({ idToken: 'tok2', accessToken: 'a' })), signOut: jest.fn(async () => {}), clearCachedAccessToken: jest.fn(async () => {}) } as never,
  webClientId: 'web-client-id',
  isOnline: async () => true,
});
const success = async () => ({ type: 'success', data: { idToken: 'tok', user: { email: 'me@gmail.com' } } });
const EMAIL: Identity = { identity_id: 'e1', provider: 'email', identity_data: { email: 'me@example.com' } };

beforeEach(async () => {
  await resetAll();
});

test('LINK-001 lists the ways in: email, Google, Apple (and nothing else)', async () => {
  const r = await listSignInMethods(fakeAuth([EMAIL, { identity_id: 'g1', provider: 'google', identity_data: { email: 'me@gmail.com' } }, { identity_id: 'x', provider: 'phone' }]));
  expect(r).toMatchObject({ ok: true, methods: [{ provider: 'email', email: 'me@example.com' }, { provider: 'google', email: 'me@gmail.com' }] });
});

test('LINK-002 Link Google: the native sign-in\'s token is linked to this account (not signed in with)', async () => {
  const auth = fakeAuth([EMAIL]);
  const r = await linkGoogle(auth, google(success));
  expect(r.ok).toBe(true);
  expect(auth.linkIdentity).toHaveBeenCalledWith({ provider: 'google', token: 'tok' });
  expect(auth.list.map((i) => i.provider)).toEqual(['email', 'google']);
});

test('LINK-003 a Google account already used by another Ona account: said plainly, nothing changes', async () => {
  const auth = fakeAuth([EMAIL], { linkIdentity: jest.fn(async () => ({ error: { message: 'Identity is already linked to another user', code: 'identity_already_exists', status: 422 } })) });
  const r = await linkGoogle(auth, google(success));
  expect(r).toMatchObject({ ok: false, message: LINKING_COPY.alreadyUsed('Google') });
  expect(auth.list).toHaveLength(1);
});

test('LINK-004 manual linking off on the server: said plainly', async () => {
  const auth = fakeAuth([EMAIL], { linkIdentity: jest.fn(async () => ({ error: { message: 'Manual linking is disabled', code: 'manual_linking_disabled' } })) });
  expect(await linkGoogle(auth, google(success))).toMatchObject({ ok: false, message: LINKING_COPY.manualLinkingOff });
});

test('LINK-005 cancelling the Google sheet, or offline: no error, nothing linked', async () => {
  const auth = fakeAuth([EMAIL]);
  expect(await linkGoogle(auth, google(async () => ({ type: 'cancelled', data: null })))).toMatchObject({ ok: false, kind: 'cancelled' });
  expect(await linkGoogle(auth, { ...google(success), isOnline: async () => false })).toMatchObject({ ok: false, kind: 'offline' });
  expect(auth.linkIdentity).not.toHaveBeenCalled();
});

test('LINK-006 set a password (for email sign-in too): at least 8 characters', async () => {
  const auth = fakeAuth([{ identity_id: 'g1', provider: 'google' }]);
  expect(await setPassword(auth, 'short')).toEqual({ ok: false, message: LINKING_COPY.passwordTooShort });
  expect(await setPassword(auth, 'a-long-password')).toEqual({ ok: true });
  expect(auth.updateUser).toHaveBeenCalledWith({ password: 'a-long-password' });
});

test('LINK-007 unlink: allowed while another way in remains; the last one never', async () => {
  const auth = fakeAuth([EMAIL, { identity_id: 'g1', provider: 'google' }]);
  const all = (await listSignInMethods(auth)) as { ok: true; methods: Parameters<typeof unlinkMethod>[1] };
  expect(await unlinkMethod(auth, all.methods, all.methods[1])).toEqual({ ok: true });
  const left = (await listSignInMethods(auth)) as typeof all;
  expect(await unlinkMethod(auth, left.methods, left.methods[0])).toEqual({ ok: false, message: LINKING_COPY.lastMethod });
  expect(auth.list).toHaveLength(1);
});

test('LINK-008 the server refusing the last one is said the same way', async () => {
  const auth = fakeAuth([EMAIL]);
  const two = [{ provider: 'email' as const, identityId: 'e1', raw: EMAIL }, { provider: 'google' as const, identityId: 'ghost', raw: { identity_id: 'ghost' } }];
  auth.list.length = 1;
  expect(await unlinkMethod(auth, two, two[0])).toEqual({ ok: false, message: LINKING_COPY.lastMethod });
});

test('LINK-009 the Settings section: linked methods, "Link Google" on Android, "Set a password" without an email identity', async () => {
  const os = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  try {
    const onSetPassword = jest.fn();
    const r = await renderWithApp(<SignInMethodsGroup onSetPassword={onSetPassword} auth={fakeAuth([{ identity_id: 'g1', provider: 'google', identity_data: { email: 'me@gmail.com' } }])} />);
    expect(await screen.findByText(LINKING_COPY.title)).toBeTruthy();
    expect(screen.getByText(LINKING_COPY.google)).toBeTruthy();
    expect(screen.getByText(LINKING_COPY.linked)).toBeTruthy();
    await r.user.press(screen.getByText(LINKING_COPY.setPassword));
    expect(onSetPassword).toHaveBeenCalled();
    r.unmount?.();
  } finally {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  }
});

test('LINK-010 the Settings section with email only: Link Google is offered (Android)', async () => {
  const os = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  try {
    await renderWithApp(<SignInMethodsGroup onSetPassword={jest.fn()} auth={fakeAuth([EMAIL])} />);
    expect(await screen.findByText(LINKING_COPY.linkGoogle)).toBeTruthy();
    expect(screen.getByText(LINKING_COPY.email)).toBeTruthy();
  } finally {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  }
});
