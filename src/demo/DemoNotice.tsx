// Shown where something belongs to the real account, not the demo (account,
// sign-in, purchases). Says why, calmly, with a way out.
import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../components/Card';
import { Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { useDemoActions } from './useDemoActions';
import { colors, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

export function DemoNotice({ title, text, exitButton = true }: { title: string; text: string; exitButton?: boolean }) {
  const { confirmExit } = useDemoActions();
  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <Ionicons name="sparkles-outline" size={20} color={colors.amber} />
        <Body style={styles.title} accessibilityRole="header">
          {title}
        </Body>
      </View>
      <Caption>{text}</Caption>
      {exitButton && <PrimaryButton label="Exit demo" variant="outline" onPress={confirmExit} style={styles.button} />}
    </Card>
  );
}

const styles = themedStyles(() => ({
  card: { gap: spacing.sm, marginBottom: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1 },
  button: { marginTop: spacing.xs },
}));
