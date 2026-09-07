const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// i18n resources are shared with the customer surface. Metro otherwise confines
// its dependency graph to driver-app and rejects JSON imported from ../shared.
config.watchFolders = [path.resolve(__dirname, '../shared')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};
config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((extension) => extension !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
};

// inlineRem defaults to 14 here, matching React Native's default font size,
// while the browser uses 16. Pinning it to 16 keeps any rem-based value equal
// to what the website renders. The shared tokens are in px, so this only
// matters for Tailwind's own defaults.
module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
