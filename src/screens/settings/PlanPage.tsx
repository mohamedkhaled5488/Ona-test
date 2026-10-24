// Settings → Account & Subscription → Plan & usage.
// Prices, currencies and periods come only from the store's Offering — the
// app has no prices of its own. Only sync is paid; nothing here blocks local data.
import { useReadingListStore } from '../../store/useReadingListStore';
import { useBudgetStore } from '../../store/useBudgetStore';
import { useDailyPlanningStore } from '../../store/useDailyPlanningStore';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption, SectionHeading } from '../../components/Typography';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useUi } from '../../components/UiProvider';
import { useEntitlement } from '../../hooks/useEntitlement';
import { useFeature } from '../../config/features';
import { CAP_LABELS, ESSENTIALS_NAME, PLAN_COMPARISON, PLAY_SUBSCRIPTIONS_URL, PLUS_NAME } from '../../config/plans';
import { usePlanStore } from '../../store/usePlanStore';
import { useHabitsStore } from '../../store/useHabitsStore';
import { useQuitHabitsStore } from '../../store/useQuitHabitsStore';
import { useSkillsStore } from '../../store/useSkillsStore';
import { capUsage } from '../../utils/entitlement';
import { getBillingClient } from '../../billing/billingClient';
import { useOffering } from '../../billing/useOffering';
import { useBillingActions } from '../../billing/useBillingActions';
import { useAccountStore } from '../../store/useAccountStore';
import { track } from '../../utils/analytics';
import { deviceRegion } from '../../config/about';
import { buildPlanCards, finePrint, type PlanCard } from '../../billing/offering';
import { showsPlanList, stateCard } from '../../billing/planState';
import type { PlanRole } from '../../billing/types';
import { colors, fonts, radii, spacing } from '../../theme';
import { themedStyles } from '../../theme/runtime';
import { DANGER, Group, NavRow, Notice } from './SettingsParts';
import { useDataSpace } from '../../hooks/useDataSpace';
import { DEMO_PURCHASE_MESSAGE } from '../../billing/purchaseFlow';

function openManage() {
  void Linking.openURL(PLAY_SUBSCRIPTIONS_URL);
}

function useRestore() {
  const { showToast } = useUi();
  const actions = useBillingActions();
  return async () => showToast({ message: await actions.restore() });
}

function StateCard() {
  const entitlement = useEntitlement();
  const pending = useAccountStore((s) => s.pendingPurchase);
  const content = stateCard(entitlement);
  const warn = content.tone === 'warn';
  return (
    <View style={[styles.stateCard, warn && styles.stateCardWarn]} accessibilityRole="summary">
      <SectionHeading style={warn ? styles.warnText : undefined}>{content.title}</SectionHeading>
      {content.lines.map((l) => (
        <Caption key={l} style={styles.stateLine}>
          {l}
        </Caption>
      ))}
      {pending && !entitlement.syncAccess && (
        <Caption style={styles.stateLine}>Your purchase is waiting on Google Play. Sync starts once it goes through.</Caption>
      )}
      {content.action === 'manage' && (
        <PrimaryButton label={content.actionLabel ?? 'Manage subscription'} variant="outline" onPress={openManage} style={styles.stateButton} />
      )}
    </View>
  );
}

function PlanOption({ card, selected, onSelect }: { card: PlanCard; selected: boolean; onSelect: () => void }) {
  return (
    <Pressable
      onPress={onSelect}
      style={[styles.plan, card.highlighted && styles.planHighlighted, selected && styles.planSelected]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${card.title}, ${card.priceLine}${card.badge ? `, ${card.badge}` : ''}`}
    >
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.teal : colors.inkSoft} />
      <View style={styles.planText}>
        <View style={styles.planTitleRow}>
          <Body style={styles.planTitle}>{card.title}</Body>
          {card.badge ? (
            <View style={styles.badge}>
              <Caption style={styles.badgeText}>{card.badge}</Caption>
            </View>
          ) : null}
        </View>
        <Body>{card.priceLine}</Body>
        {card.note ? <Caption>{card.note}</Caption> : null}
      </View>
    </Pressable>
  );
}

// The plan list with its buttons. Also used inside the plans sheet.
export function Plans({ onPurchased, inSheet = false }: { onPurchased?: () => void; inSheet?: boolean } = {}) {
  const { loading, offering, available, error } = useOffering();
  const lifetimeEnabled = useFeature('lifetimeEnabled');
  const foundersEnabled = useFeature('foundersEnabled');
  const redeemEnabled = useFeature('redeemCodeEnabled');
  const { showToast } = useUi();
  const { cards, defaultRole } = useMemo(() => buildPlanCards(offering, { lifetimeEnabled, foundersEnabled }), [offering, lifetimeEnabled, foundersEnabled]);
  const [picked, setPicked] = useState<PlanRole | null>(null);
  const selectedRole = picked ?? defaultRole;
  const selected = cards.find((c) => c.pkg.role === selectedRole);
  const [busy, setBusy] = useState(false);
  // Shown under the button as well as in a toast: inside the plans sheet a
  // toast would sit behind it.
  const [message, setMessage] = useState<string | null>(null);

  const actions = useBillingActions();
  const demo = useDataSpace() === 'demo';
  // Opening Plan & usage counts as viewing the plans; the sheet logs its own view.
  useEffect(() => {
    if (!inSheet) track('paywall_viewed', { country: deviceRegion() });
  }, [inSheet]);
  const subscribe = async () => {
    if (!selected) return;
    setBusy(true);
    const { outcome, message: text } = await actions.purchase(selected.pkg);
    setBusy(false);
    setMessage(text);
    if (text) showToast({ message: text });
    if (outcome === 'purchased') onPurchased?.();
  };

  const restore = useRestore();

  if (loading) {
    return (
      <Group title="Plans">
        <ActivityIndicator color={colors.teal} style={styles.pad} />
      </Group>
    );
  }
  if (!available || !offering || cards.length === 0) {
    return (
      <Group title="Plans">
        <Caption style={styles.pad}>{error ? "Plans couldn't load right now. Check your connection and try again." : "Plans aren't available in this version yet."}</Caption>
      </Group>
    );
  }

  return (
    <Group title="Plans" footer={__DEV__ ? 'Preview with sample store prices. Real prices come from Google Play.' : undefined}>
      <View style={styles.plans} accessibilityRole="radiogroup">
        {cards.map((card) => (
          <PlanOption
            key={card.pkg.packageId}
            card={card}
            selected={card.pkg.role === selectedRole}
            onSelect={() => {
              setPicked(card.pkg.role);
              actions.selectPlan(card.pkg);
            }}
          />
        ))}
      </View>
      <PrimaryButton label={busy ? 'Opening Google Play…' : 'Subscribe'} disabled={!selected || busy || demo} onPress={() => void subscribe()} style={styles.subscribe} />
      {demo && <Caption style={styles.stateLine}>{DEMO_PURCHASE_MESSAGE}</Caption>}
      {message ? (
        <Caption style={styles.stateLine} accessibilityLiveRegion="polite">
          {message}
        </Caption>
      ) : null}
      <Caption style={styles.finePrint}>{finePrint(selected?.pkg)}</Caption>
      <NavRow icon="card-outline" label="Manage subscription" external onPress={openManage} />
      {!demo && <NavRow icon="refresh-outline" label="Restore purchases" onPress={() => void restore()} />}
      {redeemEnabled && getBillingClient().redeemCode && (
        <NavRow icon="gift-outline" label="Redeem code" onPress={() => void getBillingClient().redeemCode?.()} />
      )}
    </Group>
  );
}

function Usage() {
  const entitlement = useEntitlement();
  const plans = usePlanStore((s) => s.plans);
  const habits = useHabitsStore((s) => s.habits);
  const skills = useSkillsStore((s) => s.skills);
  const readingEntries = useReadingListStore((s) => s.entries);
  const budgets = useBudgetStore((s) => s.budgets);
  const taskTemplates = useDailyPlanningStore((s) => s.taskTemplates);
  const usage = capUsage({ plans, habits, skills, readingEntries, budgets, taskTemplates });
  const unlimited = entitlement.syncAccess;
  return (
    <Group title={unlimited ? 'Usage' : `${ESSENTIALS_NAME} usage`} footer="Archived and finished items don't count, and you can still open them any time. Quit habits never count. If you're above a number here, everything you have keeps working.">
      {usage.map((u) => (
        <View key={u.id} style={styles.usageRow} accessibilityLabel={`${CAP_LABELS[u.id]}: ${u.used}${unlimited ? '' : ` of ${u.cap}`}`}>
          <View style={styles.usageText}>
            <Body>{CAP_LABELS[u.id]}</Body>
            <Caption>{unlimited ? `${u.used} · no limit on your plan` : `${u.used} of ${u.cap}`}</Caption>
          </View>
          {!unlimited && (
            <View style={styles.track}>
              {/* Information, not pressure: the same calm color at any level. */}
              <View style={[styles.fill, { width: `${Math.min(100, (u.used / u.cap) * 100)}%` }]} />
            </View>
          )}
        </View>
      ))}
    </Group>
  );
}

export function PlanPage() {
  const entitlement = useEntitlement();
  const restore = useRestore();
  return (
    <>
      <StateCard />
      {showsPlanList(entitlement) && <Plans />}
      {!showsPlanList(entitlement) && entitlement.state !== 'lifetime' && (
        <Group>
          <NavRow icon="refresh-outline" label="Restore purchases" onPress={() => void restore()} />
        </Group>
      )}
      <Usage />
      <Group title="What's included">
        <View style={styles.compareHead}>
          <Caption style={styles.compareFeature} />
          <Caption style={styles.compareCol}>{ESSENTIALS_NAME}</Caption>
          <Caption style={styles.compareCol}>{PLUS_NAME}</Caption>
        </View>
        {PLAN_COMPARISON.map((row) => (
          <View key={row.feature} style={styles.compareRow}>
            <Caption style={[styles.compareFeature, styles.ink]}>{row.feature}</Caption>
            <Caption style={styles.compareCol}>{row.free}</Caption>
            <Caption style={styles.compareCol}>{row.plus}</Caption>
          </View>
        ))}
      </Group>
      {entitlement.loading && (
        <Notice>
          <Caption>Checking your plan…</Caption>
        </Notice>
      )}
    </>
  );
}

const styles = themedStyles(() => ({
  pad: { paddingVertical: spacing.md },
  stateCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md + 2,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  stateCardWarn: { borderColor: DANGER },
  warnText: { color: DANGER },
  stateLine: { color: colors.ink },
  stateButton: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  plans: { gap: spacing.sm, paddingVertical: spacing.sm },
  plan: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.stone,
  },
  planHighlighted: { borderColor: colors.teal },
  planSelected: { borderWidth: 2, borderColor: colors.teal },
  planText: { flex: 1, gap: 2 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  planTitle: { fontFamily: fonts.bodyMedium },
  badge: { backgroundColor: colors.teal, borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { color: colors.white, fontSize: 12, lineHeight: 16 },
  subscribe: { marginTop: spacing.sm },
  finePrint: { marginTop: spacing.sm, marginBottom: spacing.xs },
  usageRow: { paddingVertical: spacing.sm, gap: 6 },
  usageText: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  track: { height: 6, borderRadius: radii.full, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radii.full, backgroundColor: colors.teal },
  compareHead: { flexDirection: 'row', paddingVertical: spacing.xs },
  compareRow: { flexDirection: 'row', paddingVertical: spacing.xs + 2, borderTopWidth: 1, borderTopColor: colors.line },
  compareFeature: { flex: 2 },
  compareCol: { flex: 1, textAlign: 'center' },
  ink: { color: colors.ink },
}));
