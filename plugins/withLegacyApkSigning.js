// Signs Android APKs with the old v1 (JAR) scheme as well as v2.
//
// Android 7+ only needs v2, so Gradle drops v1 when minSdk >= 24. Some
// Huawei (EMUI 9/10) package installers still reject v2-only APKs with a bare
// "App not installed" — this keeps sideloaded test builds installable there.
// Play Store builds are unaffected (Google re-signs app bundles anyway).
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// ona: legacy v1 apk signing';

module.exports = function withLegacyApkSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `
${MARKER}
android {
    signingConfigs.all { signingConfig ->
        signingConfig.enableV1Signing = true
        signingConfig.enableV2Signing = true
    }
}
`;
    }
    return cfg;
  });
};
