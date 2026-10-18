// The Discover slide tour: full-screen slides, swipe or Next/Back, Skip always
// there, progress grouped by section, jump to any section, and it resumes
// where it was left. All words come from discover/content.ts. Nothing here
// writes to the server; the only thing saved is the last slide and whether
// the tour was finished (local settings).
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, Pressable, ScrollView, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption, Eyebrow, ScreenTitle } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { SheetModal } from '../components/SheetModal';
import { ALL_SLIDES, GROUP_TITLES, TOUR, slideIndexOfSection, startIndex, t, type TourGroupId } from '../discover/content';
import { TourMock } from '../discover/TourMock';
import { useTryIt } from '../discover/tryIt';
import { useDemoActions } from '../demo/useDemoActions';
import { useDataSpace } from '../hooks/useDataSpace';
import { useSettingsStore } from '../store/useSettingsStore';
import { track } from '../utils/analytics';
import { colors, fonts, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'discoverTour'>;

const GROUP_ORDER: TourGroupId[] = ['welcome', 'plan', 'reflect', 'grow', 'learn', 'recap', 'data', 'finish'];

export function DiscoverTourScreen({ navigation, route }: Props) {
  const { width, height } = useWindowDimensions();
  const compact = height < 520; // landscape on a phone
  const insets = useSafeAreaInsets();
  const space = useDataSpace();
  const lastSlide = useSettingsStore((s) => s.discoverLastSlide);
  const tourDone = useSettingsStore((s) => s.discoverTourDone);
  const [index, setIndex] = useState(() => startIndex(route.params, lastSlide, tourDone));
  const [jumpOpen, setJumpOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const listRef = useRef<FlatList>(null);
  const tryIt = useTryIt();
  const { enter, exit } = useDemoActions();

  useEffect(() => {
    track('tour_started');
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduceMotion(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const slide = ALL_SLIDES[index];
  const last = index === ALL_SLIDES.length - 1;

  // Remember where we are; reaching the end counts as finished.
  useEffect(() => {
    const s = useSettingsStore.getState();
    s.set('discoverLastSlide', slide.key);
    if (last && !s.discoverTourDone) {
      s.set('discoverTourDone', true);
      track('tour_completed');
    }
    AccessibilityInfo.announceForAccessibility?.(`${t('slideOf', { n: index + 1, total: ALL_SLIDES.length })}. ${slide.title}`);
  }, [index, slide.key, slide.title, last]);

  // Keep the page in place when the width changes (rotation).
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: index * width, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(ALL_SLIDES.length - 1, i));
    setIndex(next);
    listRef.current?.scrollToOffset({ offset: next * width, animated: !reduceMotion });
  };
  const close = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'));
  const onSwipeEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    if (i !== index) setIndex(Math.max(0, Math.min(ALL_SLIDES.length - 1, i)));
  };

  const group = slide.group;
  const groupSlides = ALL_SLIDES.map((s, i) => ({ ...s, i })).filter((s) => s.group === group);
  const section = TOUR.find((s) => s.id === slide.sectionId)!;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.sm }]}>
      <View style={styles.top}>
        <Pressable onPress={() => setJumpOpen(true)} accessibilityRole="button" accessibilityLabel={t('jumpTo')} hitSlop={8} style={styles.jump}>
          <Ionicons name="list-outline" size={18} color={colors.inkSoft} />
          <Caption style={styles.jumpText}>{section.title}</Caption>
        </Pressable>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={last ? t('close') : t('skip')} hitSlop={10} style={styles.skip}>
          <Caption style={styles.skipText}>{last ? t('close') : t('skip')}</Caption>
        </Pressable>
      </View>

      {/* Progress, grouped by section: the groups, then the dots of this one. */}
      <View style={styles.groups} accessibilityLabel={t('slideOf', { n: index + 1, total: ALL_SLIDES.length })} accessible>
        {GROUP_ORDER.filter((g) => g !== 'finish').map((g) => (
          <Caption key={g} style={[styles.groupLabel, g === group && styles.groupLabelActive]}>
            {GROUP_TITLES[g]}
          </Caption>
        ))}
      </View>
      <View style={styles.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {groupSlides.map((s) => (
          <View key={s.key} style={[styles.dot, s.i === index && styles.dotActive, s.i < index && styles.dotSeen]} />
        ))}
      </View>

      <FlatList
        ref={listRef}
        data={ALL_SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={onSwipeEnd}
        onScrollEndDrag={onSwipeEnd}
        extraData={[index, width, space]}
        windowSize={3}
        initialNumToRender={2}
        renderItem={({ item, index: i }) => {
          const current = i === index;
          const sec = TOUR.find((s) => s.id === item.sectionId)!;
          return (
            <View
              style={{ width }}
              importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}
              accessibilityElementsHidden={!current}
            >
              <ScrollView contentContainerStyle={styles.slide}>
                <TourMock kind={item.mock} accent={sec.accent} compact={compact} />
                {item.group !== 'welcome' && item.group !== 'finish' && item.group !== 'data' && <Eyebrow style={styles.eyebrow}>{sec.title}</Eyebrow>}
                <ScreenTitle style={styles.title} accessibilityRole="header">
                  {item.title}
                </ScreenTitle>
                <Body style={styles.body}>{item.body}</Body>
                {item.tryIt && (
                  <PrimaryButton
                    label={t('tryIt')}
                    variant="outline"
                    style={styles.tryIt}
                    accessibilityHint={space === 'demo' ? undefined : 'Opens it with your data, or with sample data if you have none yet'}
                    onPress={() => void tryIt(item.tryIt!)}
                  />
                )}
                {item.group === 'finish' && (
                  <View style={styles.finish}>
                    {space !== 'demo' && <PrimaryButton label={t('finishDemo')} onPress={() => void enter({ offerTour: false })} />}
                    <PrimaryButton
                      label={t('finishOwn')}
                      variant={space === 'demo' ? 'primary' : 'outline'}
                      onPress={() => {
                        if (space === 'demo') void exit();
                        else navigation.navigate('Main');
                      }}
                    />
                    <Pressable onPress={close} accessibilityRole="button" style={styles.later}>
                      <Caption style={styles.laterText}>{t('finishLater')}</Caption>
                    </Pressable>
                  </View>
                )}
              </ScrollView>
            </View>
          );
        }}
      />

      <View style={styles.nav}>
        <PrimaryButton label={t('back')} variant="outline" style={styles.navButton} disabled={index === 0} onPress={() => goTo(index - 1)} />
        <PrimaryButton label={last ? t('done') : t('next')} style={styles.navButton} onPress={() => (last ? close() : goTo(index + 1))} />
      </View>

      <SheetModal visible={jumpOpen} onClose={() => setJumpOpen(false)}>
        <Eyebrow>{t('jumpTo')}</Eyebrow>
        <ScrollView style={styles.jumpList}>
          {GROUP_ORDER.map((g) => (
            <View key={g}>
              <Caption style={styles.jumpGroup}>{GROUP_TITLES[g]}</Caption>
              {TOUR.filter((s) => s.group === g).map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    setJumpOpen(false);
                    goTo(slideIndexOfSection(s.id));
                  }}
                  accessibilityRole="button"
                  style={styles.jumpRow}
                >
                  <Body style={s.id === slide.sectionId ? styles.jumpCurrent : undefined}>{s.title}</Body>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      </SheetModal>
    </View>
  );
}

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.stone },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, minHeight: 44 },
  jump: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, flexShrink: 1 },
  jumpText: { color: colors.inkSoft, fontFamily: fonts.bodyMedium },
  skip: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { color: colors.teal, fontFamily: fonts.bodyMedium, fontSize: 15 },
  groups: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  groupLabel: { color: colors.inkSoft, fontSize: 12 },
  groupLabelActive: { color: colors.teal, fontFamily: fonts.bodyMedium },
  dots: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  dotSeen: { backgroundColor: colors.teal, opacity: 0.45 },
  dotActive: { width: 20, backgroundColor: colors.teal },
  slide: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  eyebrow: { marginTop: spacing.md, color: colors.teal },
  title: { marginTop: spacing.xs },
  body: { color: colors.ink, lineHeight: 24 },
  tryIt: { marginTop: spacing.md, alignSelf: 'flex-start', paddingHorizontal: spacing.lg },
  finish: { marginTop: spacing.lg, gap: spacing.sm },
  later: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  laterText: { color: colors.inkSoft, fontFamily: fonts.bodyMedium },
  nav: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  navButton: { flex: 1 },
  jumpList: { maxHeight: 420, marginTop: spacing.sm },
  jumpGroup: { color: colors.inkSoft, marginTop: spacing.sm },
  jumpRow: { minHeight: 44, justifyContent: 'center', paddingLeft: spacing.sm, borderRadius: radii.sm },
  jumpCurrent: { color: colors.teal, fontFamily: fonts.bodyMedium },
}));
