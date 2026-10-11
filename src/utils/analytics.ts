// Usage analytics, opt-in only ("Share anonymous usage data to improve Ona").
//
// Hard rules, enforced here rather than at call sites:
// - Only the generic events on the allowlist below can ever leave the device.
//   Feelings, tags, journal content, habit or Quit data, or anything else from
//   inside the sections is not on it and is dropped, whatever a caller passes.
// - The only properties allowed are a plan id and a country code, and both
//   are checked against a strict format. Everything else is stripped.
// - Nothing is sent unless the user switched the consent on.
// - No transport is installed by default, so until an analytics endpoint is
//   chosen and wired with setAnalyticsTransport(), nothing is sent anywhere.
import { useSettingsStore } from '../store/useSettingsStore';
import { isDemo } from './dataSpace';

export const ALLOWED_EVENTS = [
  'install',
  'signup',
  'trial_started',
  'trial_ended',
  'paywall_viewed',
  'plan_selected',
  'purchase_started',
  'purchase_completed',
  'purchase_canceled',
  'restore_clicked',
] as const;
export type AnalyticsEvent = (typeof ALLOWED_EVENTS)[number];

export interface AnalyticsProps {
  planId?: string; // a store package id, e.g. "annual"
  country?: string; // ISO 3166 two-letter code
}

export interface OutgoingEvent extends AnalyticsProps {
  name: AnalyticsEvent;
  at: string;
}

type Transport = (event: OutgoingEvent) => void;
let transport: Transport | null = null;

export function setAnalyticsTransport(next: Transport | null): void {
  transport = next;
}

function isAllowed(name: string): name is AnalyticsEvent {
  return (ALLOWED_EVENTS as readonly string[]).includes(name);
}

function cleanProps(props: Record<string, unknown> | undefined): AnalyticsProps {
  const out: AnalyticsProps = {};
  if (typeof props?.planId === 'string' && /^[a-z0-9_.:-]{1,40}$/i.test(props.planId)) out.planId = props.planId;
  if (typeof props?.country === 'string' && /^[A-Z]{2}$/.test(props.country)) out.country = props.country;
  return out;
}

// Accepts any string and any props on purpose, so this is the only gate.
export function track(name: string, props?: Record<string, unknown>): void {
  if (isDemo()) return; // nothing leaves the phone in Demo mode
  if (!useSettingsStore.getState().consent.analytics) return;
  if (!isAllowed(name)) return;
  transport?.({ name, at: new Date().toISOString(), ...cleanProps(props) });
}
