// Help & Safety, About & Legal, and the debug-only Developer tools.
import React, { useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import Constants from 'expo-constants';
import { Body, Caption, SectionHeading } from '../../components/Typography';
import { useUi } from '../../components/UiProvider';
import { CREDITS, DATA_SAFETY, LEGAL, LICENSES, SAFETY_FALLBACK, SAFETY_RESOURCES, WHATS_NEW, deviceRegion, type SafetyResource } from '../../config/about';
import { FEATURES, FEATURE_LABELS } from '../../config/features';
import { useSettingsStore, type FeatureFlagId } from '../../store/useSettingsStore';
import { useAccountStore } from '../../store/useAccountStore';
import type { EntitlementState } from '../../utils/entitlement';
import { restoreSampleData } from '../../utils/localData';
import { sendTestNotification } from '../../utils/notifications';
import { clearDevLog, devLogLines } from '../../utils/devLog';
import { colors, fonts, spacing } from '../../theme';
import { themedStyles } from '../../theme/runtime';
import { ChoiceRow, Group, InfoRow, NavRow, Notice, ToggleRow } from './SettingsParts';
import type { SettingsPage } from './pages';
import { useDataSpace } from '../../hooks/useDataSpace';
import { useDemoActions } from '../../demo/useDemoActions';
import { appVersion, diagnostics } from '../../utils/diagnostics';

type Go = (page: SettingsPage) => void;

function mailto(subject: string, body: string): string | null {
  if (!LEGAL.supportEmail) return null;
  return `mailto:${LEGAL.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function useOpen() {
  const { showToast } = useUi();
  return (url: string | null, missing: string) => {
    if (!url) {
      showToast({ message: missing });
      return;
    }
    Linking.openURL(url).catch(() => showToast({ message: "Couldn't open that link." }));
  };
}

const FAQ: { q: string; a: string }[] = [
  { q: 'Do I need an account?', a: 'No. Every section works on this device without one. An account is only for syncing between devices.' },
  { q: 'Why did a reminder not arrive?', a: 'Check that the reminder is on in Settings → Notifications, that quiet hours don\'t cover it, and see "Reminders arriving late?" on that page.' },
  { q: 'Can I hide a section from Recap?', a: 'Yes. Settings → Sections → Recap → Choose what Recap shows.' },
  { q: 'How do I get my data out?', a: 'Settings → Privacy, Security & Data → Export my data.' },
];

export function HelpPage({ go, openSleepHelp }: { go: Go; openSleepHelp: () => void }) {
  const { showDialog } = useUi();
  const open = useOpen();
  const [openQ, setOpenQ] = useState<string | null>(null);

  const contact = () => open(mailto('Ona support', `\n\n---\n${diagnostics()}`), 'A support email address will be set up before launch.');

  const reportBug = () =>
    showDialog({
      title: 'Report a bug',
      message: `You can include basic app and device details to help us find it. Nothing you've written or tracked is included.\n\n${diagnostics()}`,
      actions: [
        { label: 'Cancel', style: 'cancel' },
        { label: 'Without details', style: 'default', onPress: () => open(mailto('Bug report', 'What happened?\n\n'), 'A support email address will be set up before launch.') },
        { label: 'Include details', style: 'default', onPress: () => open(mailto('Bug report', `What happened?\n\n\n---\n${diagnostics()}`), 'A support email address will be set up before launch.') },
      ],
    });

  return (
    <>
      <Group title="How Ona works">
        <Body style={styles.para}>
          Ona is a set of calm tools for planning, reflecting, growing and learning. Everything stays on your phone unless you choose to sync. Use as much or as
          little as you like; nothing nags you.
        </Body>
        {FAQ.map((item) => (
          <Pressable key={item.q} onPress={() => setOpenQ(openQ === item.q ? null : item.q)} style={styles.faq} accessibilityRole="button">
            <Body style={styles.faqQ}>{item.q}</Body>
            {openQ === item.q && <Caption>{item.a}</Caption>}
          </Pressable>
        ))}
        <NavRow label="Sleep help" explain="Wind-down ideas, sounds and the bedtime routine" onPress={openSleepHelp} />
        {LEGAL.helpCenterUrl && <NavRow label="Help center" external onPress={() => open(LEGAL.helpCenterUrl, '')} />}
      </Group>

      <DemoModeGroup />

      <Group title="Get in touch">
        <NavRow icon="mail-outline" label="Contact support" explain="Opens an email with the app version and phone model" onPress={contact} />
        <NavRow icon="bug-outline" label="Report a bug" explain="You choose what to attach" onPress={reportBug} />
        <NavRow icon="star-outline" label="Rate Ona" explain="Opens the Play Store" onPress={() => open(LEGAL.playStoreUrl, 'Rating opens once Ona is on the Play Store.')} />
      </Group>

      <Group title="Safety">
        <NavRow icon="heart-outline" label="Safety and support resources" explain="If you're struggling or in danger" onPress={() => go('safety')} />
      </Group>

      <Caption style={styles.disclaimer}>Ona is not a medical service and can't diagnose.</Caption>
    </>
  );
}

// Demo mode: Ona filled with sample data, kept apart from the user's own.
function DemoModeGroup() {
  const demo = useDataSpace() === 'demo';
  const { enter, confirmExit, confirmReset } = useDemoActions();
  return (
    <Group title="Demo mode" footer="Sample data lives on this phone only, apart from yours. Nothing in the demo is synced, scheduled or sent anywhere.">
      {demo ? (
        <>
          <NavRow icon="exit-outline" label="Exit demo" explain="Back to your own Ona, exactly as you left it" onPress={confirmExit} />
          <NavRow icon="refresh-outline" label="Reset demo data" explain="Back to the original sample set" onPress={confirmReset} />
        </>
      ) : (
        <NavRow icon="sparkles-outline" label="Explore with sample data" explain="See Ona after a few weeks of use. Your own data is untouched." onPress={() => void enter()} />
      )}
    </Group>
  );
}

function ResourceRow({ r }: { r: SafetyResource }) {
  return (
    <Pressable
      onPress={r.url ? () => void Linking.openURL(r.url!) : undefined}
      disabled={!r.url}
      style={styles.resource}
      accessibilityRole={r.url ? 'link' : undefined}
    >
      <Body style={styles.faqQ}>{r.name}</Body>
      <Body>{r.contact}</Body>
      <Caption>{r.detail}</Caption>
      {__DEV__ && !r.verifiedOn && <Caption style={styles.unverified}>Not verified yet — check before launch</Caption>}
    </Pressable>
  );
}

export function SafetyPage() {
  const region = deviceRegion();
  const local = (region && SAFETY_RESOURCES[region]) || [];
  return (
    <>
      <Notice>
        <Caption>If you or someone else is in immediate danger, call your local emergency number now.</Caption>
      </Notice>
      {local.length > 0 && (
        <Group title={`For your region (${region})`}>
          {local.map((r) => (
            <ResourceRow key={r.name} r={r} />
          ))}
        </Group>
      )}
      <Group title="Anywhere">
        {SAFETY_FALLBACK.map((r) => (
          <ResourceRow key={r.name} r={r} />
        ))}
      </Group>
      <Caption style={styles.disclaimer}>Ona is not a medical service and can't diagnose.</Caption>
    </>
  );
}

export function AboutPage({ go }: { go: Go }) {
  const open = useOpen();
  const { version, build } = appVersion();
  return (
    <>
      <Group>
        <InfoRow label="Version" value={build ? `${version} (${build})` : version} />
        <NavRow label="What's new" onPress={() => go('whatsNew')} />
      </Group>
      <Group title="Legal" footer={LEGAL.privacyPolicyUrl ? undefined : 'The privacy policy and terms will be published before launch.'}>
        <NavRow label="Privacy policy" external onPress={() => open(LEGAL.privacyPolicyUrl, 'The privacy policy will be published before launch.')} />
        <NavRow label="Terms of service" external onPress={() => open(LEGAL.termsUrl, 'The terms will be published before launch.')} />
        <NavRow label="Data safety" explain="A plain summary of what Ona does with your data" onPress={() => go('dataSafety')} />
        <NavRow label="Open-source licenses" onPress={() => go('licenses')} />
      </Group>
      <Group title="Credits">
        {CREDITS.map((c) => (
          <Caption key={c} style={styles.credit}>
            {c}
          </Caption>
        ))}
      </Group>
    </>
  );
}

export function WhatsNewPage() {
  return (
    <>
      {WHATS_NEW.map((release) => (
        <Group key={release.version} title={`Version ${release.version}`}>
          {release.items.map((item) => (
            <Body key={item} style={styles.bullet}>
              • {item}
            </Body>
          ))}
        </Group>
      ))}
    </>
  );
}

export function LicensesPage() {
  return (
    <Group footer="Each package's full license text ships with its source.">
      {LICENSES.map((l) => (
        <InfoRow key={l.name} label={l.name} value={l.license} />
      ))}
    </Group>
  );
}

export function DataSafetyPage() {
  return (
    <Group>
      {DATA_SAFETY.map((d) => (
        <View key={d.title} style={styles.safetyItem}>
          <SectionHeading>{d.title}</SectionHeading>
          <Body>{d.body}</Body>
        </View>
      ))}
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Developer (debug builds only — the entry is never rendered in production)
// ---------------------------------------------------------------------------
const FORCED: { id: EntitlementState | 'off'; label: string }[] = [
  { id: 'off', label: 'Real' },
  { id: 'free', label: 'Free' },
  { id: 'trial', label: 'Trial' },
  { id: 'trialEnded', label: 'Trial ended' },
  { id: 'subscribed', label: 'Subscribed' },
  { id: 'canceledActive', label: 'Canceled' },
  { id: 'grace', label: 'Grace' },
  { id: 'onHold', label: 'On hold' },
  { id: 'expired', label: 'Expired' },
  { id: 'lifetime', label: 'Lifetime' },
];

export function DeveloperPage({ go }: { go: Go }) {
  const { showDialog, showToast } = useUi();
  const forced = useAccountStore((s) => s.devForcedEntitlement);
  const setForced = useAccountStore((s) => s.setDevForcedEntitlement);
  const offline = useSettingsStore((s) => s.devSimulateOffline);
  const overrides = useSettingsStore((s) => s.devFeatureOverrides);
  const set = useSettingsStore((s) => s.set);
  const setDevFeature = useSettingsStore((s) => s.setDevFeature);

  if (!__DEV__) return null;

  const clearCaches = async () => {
    if (Platform.OS === 'web') {
      showToast({ message: 'Nothing to clear in the web preview.' });
      return;
    }
    try {
      const { Paths } = await import('expo-file-system');
      for (const item of Paths.cache.list()) item.delete();
      showToast({ message: 'Cache cleared.' });
    } catch {
      showToast({ message: "Couldn't clear the cache." });
    }
  };

  return (
    <>
      <Notice tone="warn">
        <Caption>Debug builds only. This page never appears in a release build.</Caption>
      </Notice>
      <Group title="Data">
        <NavRow
          label="Seed sample data"
          explain="Replaces every section's data with the built-in samples"
          onPress={() =>
            showDialog({
              title: 'Replace data with samples?',
              actions: [
                { label: 'Cancel', style: 'cancel' },
                { label: 'Replace', style: 'destructive', onPress: () => restoreSampleData() },
              ],
            })
          }
        />
        <NavRow label="Clear caches" onPress={() => void clearCaches()} />
      </Group>
      <Group title="Plan">
        <ChoiceRow
          label="Force plan state"
          explain="Overrides what Plan & usage and sync see"
          options={FORCED}
          value={forced ?? 'off'}
          onChange={(id) => setForced(id === 'off' ? undefined : id)}
        />
      </Group>
      <Group title="Network">
        <ToggleRow label="Simulate offline" explain="Account actions behave as if there's no connection" value={offline} onChange={(on) => set('devSimulateOffline', on)} />
      </Group>
      <Group title="Feature flags">
        {(Object.keys(FEATURES) as FeatureFlagId[]).map((flag) => (
          <ToggleRow
            key={flag}
            label={FEATURE_LABELS[flag]}
            explain={overrides[flag] === undefined ? `Default (${FEATURES[flag] ? 'on' : 'off'})` : 'Overridden'}
            value={overrides[flag] ?? FEATURES[flag]}
            onChange={(on) => setDevFeature(flag, on === FEATURES[flag] ? undefined : on)}
          />
        ))}
      </Group>
      <Group title="Diagnostics">
        <NavRow label="View logs" onPress={() => go('logs')} />
        <NavRow label="Send test notification" onPress={() => void sendTestNotification().then((ok) => showToast({ message: ok ? 'Sent.' : 'Not available here.' }))} />
      </Group>
    </>
  );
}

export function LogsPage() {
  const [lines, setLines] = useState(devLogLines());
  if (!__DEV__) return null;
  return (
    <Group>
      <NavRow
        label="Clear logs"
        onPress={() => {
          clearDevLog();
          setLines([]);
        }}
      />
      {lines.length === 0 ? (
        <Caption style={styles.para}>No warnings or errors yet.</Caption>
      ) : (
        lines.map((l, i) => (
          <View key={`${l.at}-${i}`} style={styles.logLine}>
            <Caption style={l.level === 'error' ? styles.logError : undefined}>
              {l.at.slice(11, 19)} {l.level.toUpperCase()}
            </Caption>
            <Caption style={styles.logText}>{l.message}</Caption>
          </View>
        ))
      )}
    </Group>
  );
}

const styles = themedStyles(() => ({
  para: { paddingVertical: spacing.sm },
  faq: { paddingVertical: spacing.sm, gap: 4, borderTopWidth: 1, borderTopColor: colors.line },
  faqQ: { fontFamily: fonts.bodyMedium },
  disclaimer: { textAlign: 'center', marginBottom: spacing.lg },
  resource: { paddingVertical: spacing.sm, gap: 2 },
  unverified: { color: colors.amber },
  credit: { paddingVertical: spacing.xs },
  bullet: { paddingVertical: 2 },
  safetyItem: { paddingVertical: spacing.sm, gap: spacing.xs },
  logLine: { paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.line },
  logError: { color: '#D97A70' },
  logText: { fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, color: colors.ink },
}));
