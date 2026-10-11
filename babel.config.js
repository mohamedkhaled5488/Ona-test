// Needed starting with this change: react-native-reanimated 4's worklets
// transform (used by Victory Native XL's gesture-driven pan/zoom) has to be
// registered as a babel plugin, which means the project needs an explicit
// babel config for the first time. Must stay last in the plugins array
// per Reanimated's own setup docs.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
