// After a feeling is logged: a letter to yourself if one matches, else, for a
// Low or Tense feeling, a quiet offer of Support for this feeling.
// "You left yourself a note for days like this. Would you like to read it?"
// After a feeling is logged anywhere (logFeeling tells this host), a letter
// that matches it is offered once, with Read it now / Later / Not now. Never
// opened without a choice; never more than one offer for one feeling; never
// while Letters is held (data/sectionsMeta.ts). Read here, in the sheet:
// "See another" when more match, "Hide this letter for now".
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { SheetModal } from '../components/SheetModal';
import { Body, Caption, SectionHeading } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { useUi } from '../components/UiProvider';
import { LETTERS } from '../content';
import { useLettersStore } from '../store/useLettersStore';
import { useFeelingsStore } from '../store/useFeelingsStore';
import { isLive } from '../data/sectionsMeta';
import { formatDisplayDate } from '../utils/date';
import { spacing } from '../theme';
import { themedStyles } from '../theme/runtime';
import { lettersFor, writtenOnDate } from './delivery';
import { onFeelingLogged } from './offerBus';
import type { FeelingCheckIn, Letter } from '../types/sections';
import { useSupportStore } from '../store/useSupportStore';
import { openSection } from '../navigation/navigationRef';

// After the feeling sheet has closed, so the two sheets don't meet.
export const OFFER_DELAY_MS = 400;
export const SUPPORT_OFFER = { message: 'Would something help with this feeling?', action: 'See ideas' };

export const writtenOnText = (l: Letter) => LETTERS.writtenOn.replace('{date}', formatDisplayDate(writtenOnDate(l)));

export function LetterOfferHost() {
  const [offer, setOffer] = useState<{ ids: string[]; index: number; reading: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showToast } = useUi();
  const letters = useLettersStore((s) => s.letters);

  // No letter for it: for a Low or Tense feeling, a quiet "See ideas" (Support
  // for this feeling), never a sheet; the person can turn it off there.
  const offerSupport = (feeling: FeelingCheckIn) => {
    if (!isLive('support') || !useSupportStore.getState().offerAfterLog) return;
    if (feeling.source?.kind === 'support' || (feeling.zone !== 'low' && feeling.zone !== 'tense')) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => showToast({ message: SUPPORT_OFFER.message, actionLabel: SUPPORT_OFFER.action, onAction: () => openSection('support', { feelingId: feeling.id }) }), OFFER_DELAY_MS);
  };

  useEffect(
    () =>
      onFeelingLogged((feelingId) => {
        if (!isLive('letters')) {
          const f = useFeelingsStore.getState().entries.find((e) => e.id === feelingId);
          if (f) offerSupport(f);
          return;
        }
        const store = useLettersStore.getState();
        if (store.offeredFor === feelingId) return; // one offer per feeling
        const feeling = useFeelingsStore.getState().entries.find((e) => e.id === feelingId);
        if (!feeling) return;
        const matches = lettersFor(feeling, store.letters);
        if (!matches.length) {
          offerSupport(feeling);
          return;
        }
        store.setOfferedFor(feelingId);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setOffer({ ids: matches.map((l) => l.id), index: 0, reading: false }), OFFER_DELAY_MS);
      }),
    []
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  if (!offer) return null;
  const letter = letters.find((l) => l.id === offer.ids[offer.index]);
  const close = () => setOffer(null);
  if (!letter) return null;
  const store = useLettersStore.getState();
  const read = (index: number) => {
    store.markShown(offer.ids[index]);
    setOffer({ ...offer, index, reading: true });
  };

  return (
    <SheetModal visible onClose={close}>
      {!offer.reading ? (
        <View style={styles.gap} testID="letter-offer">
          <SectionHeading>{LETTERS.offer}</SectionHeading>
          <PrimaryButton label={LETTERS.offerRead} onPress={() => read(offer.index)} testID="letter-offer-read" />
          <View style={styles.row}>
            <PrimaryButton
              label={LETTERS.offerLater}
              variant="outline"
              style={styles.flex}
              onPress={() => {
                store.saveForLater(letter.id);
                close();
              }}
            />
            <PrimaryButton label={LETTERS.offerNotNow} variant="outline" style={styles.flex} onPress={close} />
          </View>
        </View>
      ) : (
        <View style={styles.gap} testID="letter-reading">
          <Caption>{writtenOnText(letter)}</Caption>
          <Body style={styles.letter}>{letter.text}</Body>
          {offer.index < offer.ids.length - 1 && <PrimaryButton label="See another" variant="outline" onPress={() => read(offer.index + 1)} />}
          <PrimaryButton
            label={LETTERS.hideForNow}
            variant="outline"
            onPress={() => {
              store.setHidden(letter.id, true);
              close();
              showToast({ message: 'Hidden for now. It stays in Letters to Myself.', actionLabel: 'Undo', onAction: () => useLettersStore.getState().setHidden(letter.id, false) });
            }}
          />
          <PrimaryButton label="Close" onPress={close} />
        </View>
      )}
    </SheetModal>
  );
}

const styles = themedStyles(() => ({
  gap: { gap: spacing.md },
  row: { flexDirection: 'row' as const, gap: spacing.sm },
  flex: { flex: 1 },
  letter: { lineHeight: 24 },
}));
