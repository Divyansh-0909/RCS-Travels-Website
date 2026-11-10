/**
 * Generates both stylesheets that carry the tokens:
 *
 *   frontend/src/theme.generated.css  the website's @theme block and :root vars
 *   driver-app/global.css             NativeWind's input, same :root vars
 *
 * The app gets the surface variables verbatim rather than as named colours so
 * that the class strings match the website exactly — bg-[var(--background-
 * primary)] is 164 usages on the site and now means the same thing in the app.
 *
 * Runs automatically via the frontend's predev/prebuild and the app's prestart.
 * Run it by hand after adding a token while a dev server is already up:
 *
 *   node shared/theme/build-css.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const tokens = require('./tokens.cjs');

const OUT = path.resolve(__dirname, '../../frontend/src/theme.generated.css');
const APP_OUT = path.resolve(__dirname, '../../driver-app/global.css');
const PALETTE_OUT = path.resolve(__dirname, '../../theme-exports/palette.final.js');

/** Generic families are keywords and must not be quoted; real names are. */
const GENERIC_FAMILIES = new Set([
  'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
]);

const familyStack = (stack) =>
  stack.map((f) => (GENERIC_FAMILIES.has(f) ? f : `"${f}"`)).join(', ');

const decl = (name, value) => `    ${name}: ${value};`;

/**
 * tokens.cjs stores sizes in px because the app needs px (NativeWind's inlineRem
 * is 14, so rem shrinks there). The website wants the opposite: a px font size in
 * @theme overrides Tailwind's rem default and stops honouring the reader's
 * browser font-size setting. Dividing by 16 here gives each platform the unit it
 * needs from one stored value. 16 is the CSS initial root size, not a token — if
 * the site ever sets its own html font-size, this constant follows it.
 */
const ROOT_PX = 16;
const rem = (px) => `${parseFloat(px) / ROOT_PX}rem`;

const themeBlock = () => {
  const lines = [];

  for (const [name, stack] of Object.entries(tokens.fontFamily)) {
    lines.push(decl(`--font-${name}`, familyStack(stack)));
  }

  for (const [name, value] of Object.entries(tokens.colors)) {
    lines.push(decl(`--color-${name}`, value));
  }

  // CSS motion tokens are emitted only for the website. Native consumers can
  // use the numeric shared values without adding CSS easing to NativeWind.
  for (const [name, { durationMs, easing }] of Object.entries(tokens.motion)) {
    lines.push(decl(`--duration-${name}`, `${durationMs}ms`));
    lines.push(decl(`--ease-${name}`, `cubic-bezier(${easing.join(', ')})`));
  }

  // Tailwind v4 spells a size's paired values as --text-<name>--<property>.
  // Size and line height convert to rem; letterSpacing is already relative (em).
  for (const [name, { size, lineHeight, letterSpacing }] of Object.entries(tokens.fontSize)) {
    lines.push(decl(`--text-${name}`, rem(size)));
    if (lineHeight) lines.push(decl(`--text-${name}--line-height`, rem(lineHeight)));
    if (letterSpacing) lines.push(decl(`--text-${name}--letter-spacing`, letterSpacing));
  }

  return `@theme {\n${lines.join('\n')}\n}`;
};

const rootBlock = () => {
  const lines = [
    ...Object.entries(tokens.surfaces).map(([name, value]) => decl(`--${name}`, value)),
    ...Object.entries(tokens.rideChrome).map(([name, value]) => decl(`--ride-${name.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}`, value)),
  ];
  return `:root {\n${lines.join('\n')}\n}`;
};

const schemeBlock = (scheme) => {
  const values = tokens.schemes[scheme];
  const dark = scheme === 'dark';
  const palette = tokens.approvedPalette;
  const names = { surfaceRaised: 'raised', borderUi: 'border' };
  const variables = Object.fromEntries(Object.entries(values).map(([key, value]) => [
    names[key] || key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), value,
  ]));
  Object.assign(variables, {
    primary: dark ? tokens.colors.primary : tokens.colors['primary-light'],
    'on-primary': '#FFFFFF',
    'tone-primary': palette[dark ? 'tone.0.dark' : 'brand.10'],
    'tone-teal': palette[dark ? 'tone.1.dark' : 'brand.11'],
    'tone-violet': palette[dark ? 'tone.2.dark' : 'brand.12'],
    'tone-sand': palette[dark ? 'tone.3.dark' : 'brand.13'],
    'status-success': palette[dark ? 'status.success.dark' : 'status.success'],
    'status-danger': tokens.colors[dark ? 'negative-light' : 'negative'],
    'status-warning': palette[dark ? 'status.warning.dark' : 'status.warning'],
    'status-info': tokens.colors[dark ? 'info-light' : 'info'],
    'input-border': dark ? 'rgba(255,255,255,0.3)' : values.borderUi,
    'input-placeholder': dark ? 'rgba(255,255,255,0.42)' : values.inkMuted,
  });
  for (const role of ['border', 'input-border', 'input-background', 'lookup-background', 'focus-border', 'disabled-background', 'disabled-border']) {
    variables[`responsibility-${role}`] = palette[`responsibility-review.${role}.${scheme}`];
  }
  // A scoped panel can follow the account theme inside a legacy marketing page.
  return `:root[data-theme="${scheme}"],\n[data-theme-scope="${scheme}"] {\n    color-scheme: ${scheme};\n${Object.entries(variables).map(([key, value]) => decl(`--${key}`, value)).join('\n')}\n}`;
};

const BANNER = [
  '/* AUTOGENERATED by shared/theme/build-css.cjs — do not edit.',
  '   Change the values in shared/theme/tokens.cjs instead. */',
].join('\n');

const css = [
  BANNER,
  '',
  themeBlock(),
  '',
  '/* Theme colors (dark is the default) */',
  rootBlock(),
  '',
  schemeBlock('light'),
  '',
  schemeBlock('dark'),
  '',
].join('\n');

// NativeWind reads :root out of this file into its runtime variable store, so
// var() in an arbitrary value resolves the same way it does in the browser.
const appCss = [
  BANNER,
  '',
  '@tailwind base;',
  '@tailwind components;',
  '@tailwind utilities;',
  '',
  '/* Theme colors (dark is the default) */',
  rootBlock(),
  '',
].join('\n');

fs.writeFileSync(OUT, css);
fs.writeFileSync(APP_OUT, appCss);
fs.writeFileSync(PALETTE_OUT, `/* Generated from shared/theme/final-palette.json. */\nwindow.rcsApprovedPalette = ${JSON.stringify(tokens.approvedPalette, null, 2)};\n`);
console.log(`theme -> ${path.relative(process.cwd(), OUT)}`);
console.log(`theme -> ${path.relative(process.cwd(), APP_OUT)}`);
