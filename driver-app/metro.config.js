const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// inlineRem defaults to 14 here, matching React Native's default font size,
// while the browser uses 16. Pinning it to 16 keeps any rem-based value equal
// to what the website renders. The shared tokens are in px, so this only
// matters for Tailwind's own defaults.
module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
