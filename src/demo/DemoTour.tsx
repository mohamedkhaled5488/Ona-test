// The tour's cards. Light and skippable: "Skip" is always there, nothing
// needs a tap to continue, and it's never offered again once dismissed.
import React from 'react';
import { Pressable, View } from 'react-native';
import { SheetModal } from '../components/SheetModal';
import { PrimaryButton } from '../components/PrimaryButton';
import { Body, Caption, SectionHeading } from '../components/Typography';
import { TOUR_STEPS, useTourStore } from './tour';
import { updateDemoMeta } from '../utils/dataSpaceController';
import { navigationRef } from '../navigation/navigationRef';
import { colors, fonts, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

export function DemoTour() {
  const { open, step, goto, close } = useTourStore();
  if (!open) return null;

  // Finishing or skipping: either way, it's done for good.
  const finish = () => {
    close();
    void updateDemoMeta({ tourDone: true });
  };
  const showMe = (route: (typeof TOUR_STEPS)[number]['goTo']['route']) => {
    finish();
    if (!navigationRef.isReady()) return;
    if (route === 'Main') navigationRef.navigate('Main');
    else navigationRef.navigate(route as never);
  };

  const card = step >= 0 ? TOUR_STEPS[step] : null;
  const last = step === TOUR_STEPS.length - 1;

  return (
    <SheetModal visible onClose={finish}>
      {!card ? (
        <View style={styles.body} accessibilityViewIsModal>
          <SectionHeading accessibilityRole="header">Take a short tour?</SectionHeading>
          <Body style={styles.text}>Five quick cards on what to look at first. You can skip it, and it won't ask again.</Body>
          <View style={styles.row}>
            <PrimaryButton label="Not now" variant="outline" style={styles.flex} onPress={finish} />
            <PrimaryButton label="Show me" style={styles.flex} onPress={() => goto(0)} />
          </View>
        </View>
      ) : (
        <View style={styles.body} accessibilityViewIsModal>
          <Caption style={styles.muted} accessibilityLiveRegion="polite">
            {step + 1} of {TOUR_STEPS.length}
          </Caption>
          <SectionHeading accessibilityRole="header">{card.title}</SectionHeading>
          <Body style={styles.text}>{card.text}</Body>
          <Pressable onPress={() => showMe(card.goTo.route)} accessibilityRole="button" style={styles.link} accessibilityHint="Opens it and ends the tour">
            <Body style={styles.linkText}>{card.goTo.label}</Body>
          </Pressable>
          <View style={styles.row}>
            {step > 0 ? <PrimaryButton label="Back" variant="outline" style={styles.flex} onPress={() => goto(step - 1)} /> : <PrimaryButton label="Skip tour" variant="outline" style={styles.flex} onPress={finish} />}
            <PrimaryButton label={last ? 'Done' : 'Next'} style={styles.flex} onPress={() => (last ? finish() : goto(step + 1))} />
          </View>
          {step > 0 && !last && (
            <Pressable onPress={finish} accessibilityRole="button" style={styles.skip}>
              <Caption style={styles.muted}>Skip tour</Caption>
            </Pressable>
          )}
        </View>
      )}
    </SheetModal>
  );
}

const styles = themedStyles(() => ({
  body: { gap: spacing.sm },
  text: { color: colors.ink },
  muted: { color: colors.inkSoft },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  flex: { flex: 1 },
  link: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  linkText: { color: colors.teal, fontFamily: fonts.bodyMedium },
  skip: { alignSelf: 'center', minHeight: 40, justifyContent: 'center' },
}));
