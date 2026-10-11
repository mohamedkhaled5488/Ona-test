import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { ScreenTitle, SectionHeading, Caption } from '../components/Typography';
import { colors, radii, sectionAccents, spacing } from '../theme';
import { withAlpha } from '../utils/color';
import { sectionsMeta } from '../data/sectionsMeta';
import { habitsCardMeta, type FolderMeta } from '../data/folders';
import type { RootStackParamList } from '../navigation/types';
import { themedStyles } from '../theme/runtime';



// One card per section inside a folder — same visual language the old
// flat Home grid used, just scoped to this folder's sections. Tapping
// 'habits' opens the Habits hub (Build/Quit mode switch) instead of a
// section directly, since it isn't a real section of its own.
export function FolderScreen({
  folder,
  navigation,
}: {
  folder: FolderMeta;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  return (
    <Screen>
      <View style={styles.headerIconWrap}>
        <Ionicons name={folder.icon} size={24} color={colors.amber} />
      </View>
      <ScreenTitle>{folder.title}</ScreenTitle>
      <Caption style={styles.subtitle}>{folder.tagline}</Caption>

      <View style={styles.grid}>
        {folder.sections.map((id) => {
          if (id === 'habits') {
            return (
              <Pressable
                key="habits"
                onPress={() => navigation.navigate('habitsHub')}
                style={({ pressed }) => [styles.cardWrapper, pressed && styles.pressed]}
              >
                <Card style={[styles.card, { borderLeftColor: colors.teal }]}>
                  <View style={[styles.iconWrap, { backgroundColor: withAlpha(colors.teal, 0.16) }]}>
                    <Ionicons name={habitsCardMeta.icon} size={22} color={colors.teal} />
                  </View>
                  <View style={styles.cardText}>
                    <SectionHeading style={styles.cardTitle}>{habitsCardMeta.title}</SectionHeading>
                    <Caption>{habitsCardMeta.tagline}</Caption>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.inkSoft} />
                </Card>
              </Pressable>
            );
          }
          const section = sectionsMeta.find((s) => s.id === id);
          if (!section) return null;
          const accent = sectionAccents[id];
          return (
            <Pressable
              key={id}
              onPress={() => navigation.navigate(id as any)}
              style={({ pressed }) => [styles.cardWrapper, pressed && styles.pressed]}
            >
              <Card style={[styles.card, { borderLeftColor: accent }]}>
                <View style={[styles.iconWrap, { backgroundColor: withAlpha(accent, 0.16) }]}>
                  <Ionicons name={section.icon} size={22} color={accent} />
                </View>
                <View style={styles.cardText}>
                  <SectionHeading style={styles.cardTitle}>{section.title}</SectionHeading>
                  <Caption>{section.tagline}</Caption>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.inkSoft} />
              </Card>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: withAlpha(colors.amber, 0.16),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.lg,
    maxWidth: 320,
  },
  grid: {
    gap: spacing.sm + 2,
  },
  cardWrapper: {
    width: '100%',
  },
  pressed: {
    opacity: 0.8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderLeftWidth: 3,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    marginTop: 0,
  },
}));
