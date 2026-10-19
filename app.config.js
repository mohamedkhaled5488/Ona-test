// Extends app.json with settings that come from the environment.
//
// Google sign-in (@react-native-google-signin/google-signin) is Android-only
// for now: on iPhone, Ona offers email and Sign in with Apple. Its config
// plugin only adds the iOS URL scheme (Android needs no plugin without
// Firebase), so it isn't applied. To offer Google on iOS later, add
// ['@react-native-google-signin/google-signin', { iosUrlScheme }] back with
// the real reversed iOS client ID — see docs/google-signin-setup.md.

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    // Huawei's installer can reject v2-only APKs; see the plugin for details.
    './plugins/withLegacyApkSigning',
  ],
});
