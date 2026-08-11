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

        // Overridden rather than extended, for the reason fontSize gives below:
        // Tailwind's own scale is em, and RN reads letterSpacing as points, so
        // its tracking-wide would set 0.025pt — nothing at all — instead of
        // 0.025em. These are points.
        //
        // Points do not scale with the font, so one value cannot serve the whole
        // type scale: `slight` is tuned for body text and is the default AppText
        // applies. Display type still has to compute its tracking from its size.
        letterSpacing: {
            none: '0px',
            slight: '0.3px',
            wide: '0.6px',
        },

        extend: {
            colors: tokens.colors,

            // v3 ships 35 spacing steps and thins out fast above 12 — 14, 16, then
            // fours to 64. An off-scale class is not a smaller value, it is no
            // class: Tailwind emits nothing and NativeWind drops it without a
            // warning, so pt-38 reads at a glance like padding that silently
            // vanished. v4 computes these on demand; this fills the gaps so the
            // same class names work here.
            //
            // Extended rather than overridden, unlike fontWeight and letterSpacing
            // above. Those had to be blanked because two generators competed for
            // one namespace; nothing else emits p-*/m-*/top-*, so adding to this
            // scale cannot collide — it only ever fills in missing steps.
            spacing: Object.fromEntries(
                Array.from({ length: 97 }, (_, step) => [step, `${step * 0.25}rem`]),
            ),

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
            // — only three of its cuts exist as .woff2. RN has no such
            // matching, so each name maps to a cut explicitly.
            //
            // font-bold is the exception to that parity. The app also ships
            // Black, which the site does not have, so font-bold renders Black
            // here and SemiBold there. It buys a weight step the site cannot
            // make — font-semibold and font-bold are one face on the web — at
            // the cost of the two platforms disagreeing on that one class.
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
                bold: [tokens.fontCuts.black],
                // The website's italic utility sets font-style, which RN will
                // not honour against a custom family. These are the real faces.
                'light-italic': [tokens.fontCuts['extralight-italic']],
                'normal-italic': [tokens.fontCuts['regular-italic']],
                'semibold-italic': [tokens.fontCuts['semibold-italic']],
                'bold-italic': [tokens.fontCuts['black-italic']],
            },
        },
    },
    plugins: [],
};
