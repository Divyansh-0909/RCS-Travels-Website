// jsxImportSource routes JSX through NativeWind's runtime, which is what makes
// className work on React Native components. babel-preset-expo still supplies
// everything else, including the Reanimated worklets plugin.
module.exports = function (api) {
    api.cache(true);
    return {
        presets: [
            ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
            'nativewind/babel',
        ],
    };
};
