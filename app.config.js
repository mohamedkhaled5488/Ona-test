// Extends app.json with settings that come from the environment.
//
// Google sign-in (@react-native-google-signin/google-signin): its config
// plugin requires an iOS URL scheme (the reversed iOS client ID). Ona ships
// on Android first, so until an iOS client exists a clearly fake placeholder
// is used; it only affects the iOS Info.plist. Set GOOGLE_IOS_URL_SCHEME
// before any iOS build — see docs/google-signin-setup.md.
const IOS_URL_SCHEME = process.env.GOOGLE_IOS_URL_SCHEME || 'com.googleusercontent.apps.ios-client-not-set-up-yet';

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ['@react-native-google-signin/google-signin', { iosUrlScheme: IOS_URL_SCHEME }],
    // Huawei's installer can reject v2-only APKs; see the plugin for details.
    './plugins/withLegacyApkSigning',
  ],
});
