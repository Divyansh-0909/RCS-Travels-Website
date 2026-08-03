const tokens = require('../shared/theme/tokens.cjs');

// Node reads this at config time, not Metro at bundle time, so requiring
// across the package boundary needs no watchFolders entry.

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/**/*.{js,jsx,ts,tsx}'],
    presets: [require('nativewind/preset')],
    theme: {
        // Blanked deliberately, and the font families below depend on it.
        //
        // React Native resolves a weight against the family it was given, and
        // these families are single cuts — a weight utility on top of one sets
        // a value Android ignores and iOS may fake. Emptying the scale frees
        // the whole font-* namespace for families, which is what lets the
        // class names match the website's.
        //
        // Restoring a weight scale here would silently collide: Tailwind
        // generates font-* from this and from fontFamily both, and which rule
        // wins comes down to core plugin order rather than anything you wrote.
        fontWeight: {},
        extend: {
            colors: tokens.colors,

            // Tailwind v3 takes a size as [size, { lineHeight }]; tokens.cjs stores
            // the object form the v4 generator reads, so the shapes are converted
            // here rather than duplicated there.
            //
            // letterSpacing is dropped on purpose. The token values are em, and RN
            // reads letterSpacing as points — passing 0.08em through would set
            // 0.08pt, which is not "slightly wide", it is nothing. A real tracked
            // style in the app has to compute points from the size by hand.
            fontSize: Object.fromEntries(
                Object.entries(tokens.fontSize).map(([name, { size, lineHeight }]) => [
                    name, [size, { lineHeight }],
                ]),
            ),

            // One family per file. The browser picks a face out of "PP Mori"
            // by weight, so the website's font-medium quietly renders Regular
            // and its font-bold renders SemiBold — only three cuts exist. RN
            // has no such matching, so each name maps to a cut explicitly and
            // the same class renders the same glyphs on both platforms.
            //
            // Order here is presentational only. Tailwind emits utilities
            // alphabetically, so two of these on one element resolve by name
            // rather than by anything below — never rely on it; drop one.
            fontFamily: {
                sans: [tokens.fontCuts.regular],
                extralight: [tokens.fontCuts.extralight],
                light: [tokens.fontCuts.extralight],
                normal: [tokens.fontCuts.regular],
                medium: [tokens.fontCuts.regular],
                semibold: [tokens.fontCuts.semibold],
                bold: [tokens.fontCuts.semibold],
                // The website's italic utility sets font-style, which RN will
                // not honour against a custom family. These are the real faces.
                'light-italic': [tokens.fontCuts['extralight-italic']],
                'normal-italic': [tokens.fontCuts['regular-italic']],
                'semibold-italic': [tokens.fontCuts['semibold-italic']],
            },
        },
    },
    plugins: [],
};
