// After signing in, when this phone's data and the account's would meet
// (sync/signInFlow.ts): the person chooses, with the counts in front of
// them. Nothing syncs until they do, and nothing is deleted whatever they
// choose. "Decide later" leaves everything as it is; Settings → Account
// opens this again.
import React from 'react';
import { Pressable, View } from 'react-native';
import { SheetModal } from './SheetModal';
import { Card } from './Card';
import { Body, Caption, ScreenTitle } from './Typography';
import { useUi } from './UiProvider';
import { chooseForAccount, useAccountChoiceStore, type ChoiceOption } from '../sync/signInFlow';
import { colors, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

export const CHOICE_COPY = {
  merge: {
    title: 'This phone and your account both have data',
    counts: (here: number, inAccount: number) => `${items(here)} on this phone, ${items(inAccount)} in your account.`,
    options: [
      { id: 'merge', label: 'Merge them (recommended)', line: 'Everything from both, together in your account. Nothing is deleted.' },
      { id: 'keepSeparate', label: "Keep this phone's data separate", line: "Your account's data comes to this phone. This phone's data is kept aside, and comes back when you sign out." },
      { id: 'accountOnly', label: "Use the account's data only", line: "Your account's data comes to this phone. A copy of this phone's data stays on it until you remove it (Privacy, Security & Data)." },
    ],
  },
  otherAccount: {
    title: 'This phone has data from another account',
    counts: (here: number) => `${items(here)} here came from a different Ona account. They aren't added to this one unless you choose.`,
    options: [
      { id: 'keepSeparate', label: 'Keep them separate (recommended)', line: "Your account's data comes to this phone. The other account's data is kept aside on this phone, not deleted." },
      { id: 'addToAccount', label: 'Add them to this account', line: 'Everything here is added to the account you just signed in with.' },
    ],
  },
  later: 'Decide later',
  laterLine: "Nothing syncs until you choose. Settings → Account & Subscription opens this again.",
} as const;

export function AccountChoiceSheet() {
  const pending = useAccountChoiceStore((s) => s.pending);
  const busy = useAccountChoiceStore((s) => s.busy);
  const hidden = useAccountChoiceStore((s) => s.hidden);
  const hide = () => useAccountChoiceStore.setState({ hidden: true });
  const { showToast } = useUi();
  if (!pending) return null;
  const copy = pending.kind === 'merge' ? CHOICE_COPY.merge : CHOICE_COPY.otherAccount;
  const counts = pending.kind === 'merge' ? CHOICE_COPY.merge.counts(pending.here, pending.inAccount) : CHOICE_COPY.otherAccount.counts(pending.here);
  const choose = (id: ChoiceOption) =>
    void chooseForAccount(id).catch((e) => showToast({ message: `Couldn't do that: ${e instanceof Error ? e.message : String(e)}. Nothing was changed.` }));
  return (
    <SheetModal visible={!hidden} onClose={hide}>
      <ScreenTitle>{copy.title}</ScreenTitle>
      <Body style={styles.counts}>{counts}</Body>
      {copy.options.map((o) => (
        <Pressable key={o.id} disabled={busy} onPress={() => choose(o.id as ChoiceOption)} accessibilityRole="button" accessibilityLabel={o.label} testID={`account-choice-${o.id}`}>
          <Card style={styles.option}>
            <Body>{o.label}</Body>
            <Caption style={styles.line}>{o.line}</Caption>
          </Card>
        </Pressable>
      ))}
      <View style={styles.later}>
        <Pressable onPress={hide} accessibilityRole="button" hitSlop={8}>
          <Caption style={styles.laterLabel}>{CHOICE_COPY.later}</Caption>
        </Pressable>
        <Caption style={styles.line}>{CHOICE_COPY.laterLine}</Caption>
      </View>
    </SheetModal>
  );
}

const styles = themedStyles(() => ({
  counts: { marginTop: spacing.sm, marginBottom: spacing.md },
  option: { marginBottom: spacing.sm, gap: spacing.xs },
  line: { color: colors.inkSoft },
  later: { marginTop: spacing.sm, gap: spacing.xs },
  laterLabel: { color: colors.teal },
}));
