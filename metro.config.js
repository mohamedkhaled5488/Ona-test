const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Needed for @shopify/react-native-skia's web backend (CanvasKit), which
// loads a real canvaskit.wasm binary at runtime — without this, Metro's dev
// server serves it as HTML (its default 404 page) instead of the actual
// wasm bytes, since 'wasm' isn't a recognized asset type by default.
config.resolver.assetExts.push('wasm');

module.exports = config;
