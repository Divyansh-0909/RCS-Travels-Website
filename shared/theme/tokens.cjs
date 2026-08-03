/**
 * Single source of truth for the design tokens, shared by the website
 * (Tailwind v4, CSS-first) and the driver app (NativeWind 4 / Tailwind v3,
 * JS-config). Neither Tailwind reads this file directly:
 *
 *   website    -> shared/theme/build-css.cjs generates frontend/src/theme.generated.css
 *   driver app -> driver-app/tailwind.config.js requires this file
 *
 * Rules for anything added here, so both platforms can consume it:
 *   - Colours stay hex/rgb/hsl. React Native cannot parse oklch() or color-mix().
 *   - Sizes stay in px. rem is 16 on the web but 14 in NativeWind (its
 *     inlineRem default), so rem values silently shrink ~12% in the app.
 *   - Line heights stay absolute px. RN's lineHeight is in points, so a
 *     unitless 1.5 does not mean what it means in CSS.
 *
 * CommonJS on purpose: Expo's tailwind.config.js is CJS, and .cjs stays
 * requirable from the frontend package even though it is "type": "module".
 */

/**
 * Named brand colours. Emitted as --color-* in the web @theme block, which is
 * what makes the utility classes (bg-primary, text-negative, ...) exist, and
 * spread into theme.extend.colors for the app so the same classes exist there.
 */
const colors = {
  'white-muted': '#AEAEAE',
  primary: '#243AFB',
  'primary-dark': '#1212B4',
  'primary-light': '#7A94FF',
  negative: '#B91C1C',
  'negative-dark': '#7A0F0F',
  'negative-light': '#E86A6A',
};

/**
 * Surface and text variables, consumed raw as var(--background-primary) and
 * friends rather than through utility classes. Dark is the default theme.
 * These are emitted verbatim into :root, so the ~600 existing var() call
 * sites on the website keep resolving unchanged.
 */
const surfaces = {
  'background-muted': '#1d1d27',
  'background-primary': '#121220',
  background: '#0B0B14',
  foreground: '#ffffff',
  'foreground-muted': '#f3f3f3',

  text: '#ffffff',
  'text-muted': '#AEAEAE',
  'text-foreground': '#000000',
  'text-muted-foreground': '#AEAEAE',
};

/**
 * Font stacks, web only. The browser walks the list and falls back; the app has
 * no fallback chain and no font matching, so it uses fontCuts instead.
 */
const fontFamily = {
  sans: ['PP Mori', 'Poppins', 'sans-serif'],
};

/**
 * One family name per PP Mori file, app only. The web can ask for "PP Mori" at
 * weight 600 and let the browser pick the face; React Native has no such
 * matching, so every cut has to be its own family.
 *
 * These are the *chosen* names, not names read out of the font files — all six
 * .otf files report the same internal family ("PP Mori") and differ only by
 * subfamily. Loading them through expo-font's useFonts makes the key below the
 * family name on iOS, Android and web alike, which the expo-font config plugin
 * would not: it takes the family from the filename on Android but from the file
 * on iOS, so iOS would collapse all six into one.
 *
 * driver-app/src/theme/fonts.ts holds the matching require() map — the paths
 * have to be literals for Metro, so the two lists are kept in step by hand.
 */
const fontCuts = {
  extralight: 'PPMori-Extralight',
  'extralight-italic': 'PPMori-ExtralightItalic',
  regular: 'PPMori-Regular',
  'regular-italic': 'PPMori-RegularItalic',
  semibold: 'PPMori-SemiBold',
  'semibold-italic': 'PPMori-SemiBoldItalic',
};

/**
 * Type scale. Sizes are px here because that is what the app needs — NativeWind's
 * inlineRem is 14, so a rem value silently renders ~12% smaller than the same
 * value on the web. build-css.cjs divides by 16 on the way out so the website
 * still gets rem and keeps honouring the reader's browser font size; the app
 * config takes these px verbatim.
 *
 * xs..4xl deliberately hold Tailwind's own default values. The website was
 * already rendering at them implicitly, so naming them here changes nothing on
 * the site and only stops the app shrinking.
 *
 * letterSpacing is web-only: RN takes points, not em, so the app config drops
 * it rather than applying it at the wrong scale.
 */
const fontSize = {
  xs: { size: '12px', lineHeight: '16px' },
  sm: { size: '14px', lineHeight: '20px' },
  base: { size: '16px', lineHeight: '24px' },
  lg: { size: '18px', lineHeight: '28px' },
  xl: { size: '20px', lineHeight: '28px' },
  '2xl': { size: '24px', lineHeight: '32px', letterSpacing: '-0.01em' },
  '3xl': { size: '30px', lineHeight: '36px', letterSpacing: '-0.02em' },
  '4xl': { size: '36px', lineHeight: '40px', letterSpacing: '-0.02em' },

  /**
   * Driver-app additions. Neither name exists in Tailwind's default scale, so
   * the website is untouched by them.
   *
   * fare  — the figure a driver decides a job on, at the one size where PP Mori
   *         Extralight reads as a display cut rather than thin body text.
   * plate — registration numbers and deposits: wide-tracked so a string of
   *         digits reads as data instead of prose. Never use it for a payout;
   *         money in and money out must not share a treatment.
   */
  fare: { size: '44px', lineHeight: '46px', letterSpacing: '-0.03em' },
  plate: { size: '22px', lineHeight: '26px', letterSpacing: '0.08em' },
};

module.exports = { colors, surfaces, fontFamily, fontCuts, fontSize };
