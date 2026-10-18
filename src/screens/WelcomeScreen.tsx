// The first-run screen: only on a fresh install with no account (and when
// leaving Demo mode with no account). Ona works without an account, so
// "Start using Ona" comes first; signing in and the demo are alternatives.
import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { OnaMark } from '../components/OnaMark';
import { OnaWordmark } from '../components/OnaWordmark';
import { PrimaryButton } from '../components/PrimaryButton';
import { Body, Caption, DisplayTitle } from '../components/Typography';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useDemoActions } from '../demo/useDemoActions';
import { setStartScreen } from '../navigation/startScreen';
import { colors, fonts, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'welcome'>;

export function WelcomeScreen({ navigation, route }: Props) {
  const session = useAuthStore((s) => s.session);
  const { enter } = useDemoActions();
  const returning = !!route.params?.hasData;

  const start = () => {
    useSettingsStore.getState().set('welcomeSeen', true);
    setStartScreen('Main');
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  // Signed in from here: straight into the app.
  useEffect(() => {
    if (session) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  return (
    <Screen style={styles.screen}>
      <View style={styles.brand}>
        <OnaMark size={56} />
        <OnaWordmark size={30} />
      </View>
      <DisplayTitle style={styles.title}>A calm place to plan, reflect and grow.</DisplayTitle>
      <Body style={styles.lead}>Use as much or as little as you like. Nothing nags you, and everything stays on this phone unless you choose to sync.</Body>

      <PrimaryButton label={returning ? 'Back to my Ona' : 'Start using Ona'} onPress={start} style={styles.primary} />
      <Caption style={styles.hint}>No account needed.</Caption>

      <PrimaryButton label="Sign in or create an account" variant="outline" onPress={() => navigation.navigate('signIn')} style={styles.secondary} />
      <Caption style={styles.hint}>Only needed to sync between devices.</Caption>

      <Pressable
        onPress={() => {
          setStartScreen('Main');
          void enter();
        }}
        style={styles.demo}
        accessibilityRole="button"
        accessibilityHint="Opens Ona filled with sample data. Your own data stays separate and untouched."
      >
        <Body style={styles.demoText}>Explore with sample data</Body>
        <Caption style={styles.hint}>See what Ona looks like after a few weeks of use.</Caption>
      </Pressable>
      <Pressable onPress={() => navigation.navigate('discoverTour', {})} style={styles.demo} accessibilityRole="button">
        <Body style={styles.demoText}>Take a 5-minute tour</Body>
      </Pressable>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  screen: { paddingTop: spacing.xxl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  title: { marginBottom: spacing.md },
  lead: { color: colors.inkSoft, marginBottom: spacing.xl },
  primary: { marginTop: spacing.sm },
  secondary: { marginTop: spacing.lg },
  hint: { color: colors.inkSoft, textAlign: 'center', marginTop: spacing.xs },
  demo: { alignItems: 'center', marginTop: spacing.xl, paddingVertical: spacing.sm, minHeight: 48 },
  demoText: { color: colors.teal, fontFamily: fonts.bodyMedium },
}));
