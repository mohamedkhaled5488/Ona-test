// Swiping Ona away stops its sound and removes the media notification: the
// expo-audio playback service stops with Ona's task (plugins/
// withAudioServiceStopsWithTask.js). IDs: docs/test-cases/integration.md (SLEEP-SWIPE-*)
const { setStopWithTask, SERVICE } = require('../../../plugins/withAudioServiceStopsWithTask.js') as {
  setStopWithTask: (m: object) => { manifest: { application: { service: { $: Record<string, string> }[] }[] } };
  SERVICE: string;
};
const resolveConfig = require('../../../app.config.js') as (a: { config: object }) => { plugins: (string | [string, object])[] };
const fs = require('fs') as { readFileSync: (p: string, e: string) => string };

const expoAudioService = () => ({ $: { 'android:name': SERVICE, 'android:exported': 'false', 'android:foregroundServiceType': 'mediaPlayback' }, 'intent-filter': [{ action: [{ $: { 'android:name': 'androidx.media3.session.MediaSessionService' } }] }] });

test('SLEEP-SWIPE-001 the playback service stops with the task, and keeps everything expo-audio declared', () => {
  const m = setStopWithTask({ manifest: { application: [{ service: [expoAudioService()] }] } });
  expect(m.manifest.application[0].service).toEqual([{ ...expoAudioService(), $: { ...expoAudioService().$, 'android:stopWithTask': 'true' } }]);
});

test("SLEEP-SWIPE-002 it never declares the service itself (expo-audio would then skip its own)", () => {
  expect(() => setStopWithTask({ manifest: { application: [{ service: [] }] } })).toThrow(/list this plugin before expo-audio/);
});

test('SLEEP-SWIPE-003 it is listed before expo-audio, so its manifest step runs after expo-audio\'s', () => {
  const app = JSON.parse(fs.readFileSync(`${process.cwd()}/app.json`, 'utf8')).expo;
  const names = resolveConfig({ config: app }).plugins.map((p) => (typeof p === 'string' ? p : p[0]));
  expect(names.indexOf('./plugins/withAudioServiceStopsWithTask')).toBeGreaterThanOrEqual(0);
  expect(names.indexOf('./plugins/withAudioServiceStopsWithTask')).toBeLessThan(names.indexOf('expo-audio'));
});
