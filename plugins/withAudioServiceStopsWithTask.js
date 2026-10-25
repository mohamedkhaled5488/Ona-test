// Swiping Ona away from recent apps stops its sound and removes the media
// notification.
//
// expo-audio plays in the background through a foreground service
// (AudioControlsService) that owns the media session and its notification.
// When Ona is swiped away its JS goes, and expo-audio stops the players, but
// the service stays, so the notification stayed behind (seen on the CI
// emulator, 2026-10-25). With android:stopWithTask="true" Android stops the
// service together with Ona's task: its onDestroy releases the media session
// and the notification goes with it. Its manifest step must run after
// expo-audio's, which adds the service: list it before expo-audio.
const { withAndroidManifest } = require('expo/config-plugins');

const SERVICE = 'expo.modules.audio.service.AudioControlsService';

function setStopWithTask(manifest) {
  const app = manifest.manifest.application?.[0];
  if (!app) return manifest;
  app.service = app.service ?? [];
  const service = app.service.find((s) => s.$?.['android:name'] === SERVICE);
  // Only ever changes expo-audio's own declaration: adding one here would
  // make expo-audio skip its own (foreground service type, intent filter).
  if (!service) throw new Error(`withAudioServiceStopsWithTask: ${SERVICE} isn't declared; list this plugin before expo-audio`);
  service.$['android:stopWithTask'] = 'true';
  return manifest;
}

module.exports = function withAudioServiceStopsWithTask(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = setStopWithTask(cfg.modResults);
    return cfg;
  });
};
module.exports.setStopWithTask = setStopWithTask;
module.exports.SERVICE = SERVICE;
