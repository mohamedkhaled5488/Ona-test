// Settings → Account → Sign-in methods: the ways to sign in to this one
// account (auth/linking.ts). Google links on Android (Ona offers Google
// there only); Apple comes with Sign in with Apple on iPhone.
import React, { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useUi } from '../../components/UiProvider';
import { supabase } from '../../lib/supabase';
import { googleModule, googleWebClientId } from '../../auth/googleSignIn';
import { LINKING_COPY, linkGoogle, listSignInMethods, methodName, unlinkMethod, type LinkingAuth, type SignInMethod } from '../../auth/linking';
import { isOnline } from '../../utils/network';
import { Group, NavRow } from './SettingsParts';

export function SignInMethodsGroup({ onSetPassword, auth = supabase.auth as unknown as LinkingAuth }: { onSetPassword: () => void; auth?: LinkingAuth }) {
  const { showDialog, showToast } = useUi();
  const [methods, setMethods] = useState<SignInMethod[] | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    void listSignInMethods(auth).then((r) => setMethods(r.ok ? r.methods : []));
  }, [auth]);
  useEffect(refresh, [refresh]);
  if (!methods) return null;

  const has = (p: SignInMethod['provider']) => methods.find((m) => m.provider === p);
  const askUnlink = (m: SignInMethod) =>
    showDialog({
      title: LINKING_COPY.unlinkTitle(methodName(m.provider)),
      message: methods.length <= 1 ? LINKING_COPY.lastMethod : LINKING_COPY.unlinkMessage,
      actions:
        methods.length <= 1
          ? [{ label: 'OK', style: 'cancel' }]
          : [
              { label: 'Cancel', style: 'cancel' },
              {
                label: LINKING_COPY.unlink,
                style: 'destructive',
                onPress: () =>
                  void unlinkMethod(auth, methods, m).then((r) => {
                    if (!r.ok) showToast({ message: r.message });
                    refresh();
                  }),
              },
            ],
    });
  const doLinkGoogle = async () => {
    setBusy(true);
    try {
      const r = await linkGoogle(auth, { google: googleModule(), webClientId: googleWebClientId(), isOnline: () => isOnline() });
      if (r.ok) showToast({ message: LINKING_COPY.linkedNow(LINKING_COPY.google) });
      else if (r.message) showToast({ message: r.message });
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const email = has('email');
  const google = has('google');
  const apple = has('apple');
  return (
    <Group title={LINKING_COPY.title} footer={LINKING_COPY.footer}>
      {email ? (
        <NavRow icon="mail-outline" label={LINKING_COPY.email} value={LINKING_COPY.linked} explain={email.email} onPress={() => askUnlink(email)} />
      ) : (
        <NavRow icon="mail-outline" label={LINKING_COPY.setPassword} explain="Sign in with your email too" onPress={onSetPassword} />
      )}
      {google ? (
        <NavRow icon="logo-google" label={LINKING_COPY.google} value={LINKING_COPY.linked} explain={google.email} onPress={() => askUnlink(google)} />
      ) : Platform.OS === 'android' ? (
        <NavRow icon="logo-google" label={busy ? 'Linking…' : LINKING_COPY.linkGoogle} explain="Sign in with Google too" onPress={() => !busy && void doLinkGoogle()} />
      ) : null}
      {apple && <NavRow icon="logo-apple" label={LINKING_COPY.apple} value={LINKING_COPY.linked} explain={apple.email} onPress={() => askUnlink(apple)} />}
    </Group>
  );
}
