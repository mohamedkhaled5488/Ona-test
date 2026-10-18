// Discover Ona: try the demo, take the tour, or open the tour at one section.
// Works signed out and offline; nothing here touches your own data.
import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Body, Caption, Eyebrow, ScreenTitle, SectionHeading } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { EXPLORE_GROUPS, GROUP_TITLES, t } from '../discover/content';
import { useDemoActions } from '../demo/useDemoActions';
import { useDataSpace } from '../hooks/useDataSpace';
import { useSettingsStore } from '../store/useSettingsStore';
import { track } from '../utils/analytics';
import { colors, fonts, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'discover'>;

export function DiscoverScreen({ navigation }: Props) {
  const space = useDataSpace();
  const { enter } = useDemoActions();
  const lastSlide = useSettingsStore((s) => s.discoverLastSlide);
  const done = useSettingsStore((s) => s.discoverTourDone);
  const canResume = !!lastSlide && !done;

  useEffect(() => {
    track('discover_opened');
  }, []);

  return (
    <Screen>
      <ScreenTitle accessibilityRole="header">{t('discoverTitle')}</ScreenTitle>
      <Caption style={styles.lead}>{t('discoverLead')}</Caption>

      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <Ionicons name="sparkles-outline" size={20} color={colors.teal} />
          <SectionHeading>{t('demoTitle')}</SectionHeading>
        </View>
        <Body style={styles.cardBody}>{t('demoBody')}</Body>
        {space === 'demo' ? (
          <Caption style={styles.note}>{t('demoActive')}</Caption>
        ) : (
          <PrimaryButton label={t('demoButton')} variant="outline" onPress={() => void enter()} style={styles.button} />
        )}
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <Ionicons name="albums-outline" size={20} color={colors.teal} />
          <SectionHeading>{t('tourTitle')}</SectionHeading>
        </View>
        <Body style={styles.cardBody}>{t('tourBody')}</Body>
        <PrimaryButton
          label={canResume ? t('tourResume') : done ? t('tourReplay') : t('tourStart')}
          onPress={() => navigation.navigate('discoverTour', canResume ? { resume: true } : {})}
          style={styles.button}
        />
        {canResume && (
          <Pressable onPress={() => navigation.navigate('discoverTour', {})} accessibilityRole="button" style={styles.restart}>
            <Caption style={styles.link}>{t('tourStart')}</Caption>
          </Pressable>
        )}
      </Card>

      <Eyebrow style={styles.exploreTitle}>{t('exploreTitle')}</Eyebrow>
      <Caption style={styles.lead}>{t('exploreBody')}</Caption>
      {EXPLORE_GROUPS.map(({ group, sections }) => (
        <Card key={group} style={styles.groupCard}>
          <Caption style={styles.groupTitle}>{GROUP_TITLES[group]}</Caption>
          {sections.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => navigation.navigate('discoverTour', { sectionId: s.id })}
              accessibilityRole="button"
              accessibilityHint="Opens the tour at this section"
              style={styles.row}
            >
              <Body style={styles.flex}>{s.title}</Body>
              <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
            </Pressable>
          ))}
        </Card>
      ))}
      <View style={styles.bottom} />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  lead: { color: colors.inkSoft, marginBottom: spacing.md },
  card: { marginBottom: spacing.md, gap: spacing.xs },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardBody: { color: colors.ink },
  button: { marginTop: spacing.sm },
  note: { color: colors.inkSoft, marginTop: spacing.sm },
  restart: { alignItems: 'center', minHeight: 40, justifyContent: 'center' },
  link: { color: colors.teal, fontFamily: fonts.bodyMedium },
  exploreTitle: { marginTop: spacing.md },
  groupCard: { marginBottom: spacing.sm, paddingVertical: spacing.sm },
  groupTitle: { color: colors.teal, fontFamily: fonts.bodyMedium },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  flex: { flex: 1 },
  bottom: { height: spacing.xl },
}));
