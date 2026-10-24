// The sheet shown when this phone's data and an account's would meet: the
// counts, the options with Merge / Keep separate first, and "Decide later".
// IDs: docs/test-cases/integration.md (JRN-ACC-050..052)
jest.mock('../../sync/signInFlow', () => ({ ...jest.requireActual('../../sync/signInFlow'), chooseForAccount: jest.fn(async () => {}) }));

import React from 'react';
import { screen } from '@testing-library/react-native';
import { AccountChoiceSheet, CHOICE_COPY } from '../../components/AccountChoiceSheet';
import { chooseForAccount, useAccountChoiceStore } from '../../sync/signInFlow';
import { renderWithApp } from '../../test-utils/render';

beforeEach(() => {
  (chooseForAccount as jest.Mock).mockClear();
  useAccountChoiceStore.setState({ pending: null, readyFor: null, busy: false, hidden: false });
});

test('JRN-ACC-050 merge: both counts, Merge first and marked recommended; a tap chooses it', async () => {
  useAccountChoiceStore.setState({ pending: { kind: 'merge', userId: 'u1', here: 12, inAccount: 340 } });
  const r = await renderWithApp(<AccountChoiceSheet />);
  expect(screen.getByText(CHOICE_COPY.merge.title)).toBeTruthy();
  expect(screen.getByText('12 items on this phone, 340 items in your account.')).toBeTruthy();
  const labels = CHOICE_COPY.merge.options.map((o) => o.label);
  expect(labels[0]).toMatch(/^Merge them \(recommended\)$/);
  for (const l of labels) expect(screen.getByText(l)).toBeTruthy();
  await r.user.press(screen.getByTestId('account-choice-merge'));
  expect(chooseForAccount).toHaveBeenCalledWith('merge');
});

test("JRN-ACC-051 another account's data: never added by default; Keep separate first", async () => {
  useAccountChoiceStore.setState({ pending: { kind: 'otherAccount', userId: 'b', here: 1, otherOwner: 'a' } });
  const r = await renderWithApp(<AccountChoiceSheet />);
  expect(screen.getByText(CHOICE_COPY.otherAccount.counts(1))).toBeTruthy();
  expect(CHOICE_COPY.otherAccount.options[0].id).toBe('keepSeparate');
  await r.user.press(screen.getByTestId('account-choice-keepSeparate'));
  expect(chooseForAccount).toHaveBeenCalledWith('keepSeparate');
});

test('JRN-ACC-052 Decide later closes the sheet and the choice keeps waiting', async () => {
  useAccountChoiceStore.setState({ pending: { kind: 'merge', userId: 'u1', here: 1, inAccount: 1 } });
  const r = await renderWithApp(<AccountChoiceSheet />);
  await r.user.press(screen.getByText(CHOICE_COPY.later));
  expect(useAccountChoiceStore.getState()).toMatchObject({ hidden: true, pending: { kind: 'merge' } });
  expect(chooseForAccount).not.toHaveBeenCalled();
});
