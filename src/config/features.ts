// Free/paid line, kept behind flags so it can be wired to a real entitlement
// later. Gating isn't part of this pass — everything is on.
//   Free: Recap's Home view (period switch, effort summary, heatmap,
//         highlights, area cards, effort over time, observations).
//   Deeper tier: cross-section detail — the area pages and the story view.
// Developer tools (debug builds only) can override any flag.
import { useSettingsStore, type FeatureFlagId } from '../store/useSettingsStore';

export const FEATURES: Record<FeatureFlagId, boolean> = {
  recapAreaPages: true,
  recapStory: true,
  // Plan & usage. Off until decided; founders limits (count or end date)
  // belong in remote config, not here — see docs/billing-setup-checklist.md.
  lifetimeEnabled: false,
  foundersEnabled: false,
  redeemCodeEnabled: false,
};

export const FEATURE_LABELS: Record<FeatureFlagId, string> = {
  recapAreaPages: 'Recap area pages',
  recapStory: 'Recap story',
  lifetimeEnabled: 'Lifetime plan',
  foundersEnabled: 'Founders price',
  redeemCodeEnabled: 'Redeem code button',
};

export function useFeature(flag: FeatureFlagId): boolean {
  const override = useSettingsStore((s) => s.devFeatureOverrides[flag]);
  return __DEV__ && override !== undefined ? override : FEATURES[flag];
}
