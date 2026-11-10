/**
 * Semantic colours for native APIs. Tailwind consumes the same names through
 * CSS variables (see tailwind.config.js); use this object when a component
 * accepts a `color` or `backgroundColor` prop instead of a class name.
 */
export type ThemeScheme = 'light' | 'dark';

export type ThemeColors = {
  canvas: string;
  immersive: string;
  surface: string;
  surfaceMuted: string;
  surfaceRaised: string;
  ink: string;
  inkMuted: string;
  borderUi: string;
  inputBackground: string;
  strong: string;
  onStrong: string;
  /** Primary-colored actions keep their own white foreground in both schemes. */
  onPrimary: '#FFFFFF';
  /** Brand blue stays constant in both schemes. */
  primary: '#243AFB';
  primaryLight: '#7A94FF';
  negative: '#B91C1C';
  positive: '#166534';
  warning: '#92400E';
  mapLand: string;
  mapRoute: '#7A94FF';
};

const invariant = {
  onPrimary: '#FFFFFF',
  primary: '#243AFB',
  primaryLight: '#7A94FF',
  negative: '#B91C1C',
  positive: '#166534',
  warning: '#92400E',
  mapRoute: '#7A94FF',
} as const;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { schemes } = require('../../../shared/theme/tokens.cjs') as {
  schemes: Record<ThemeScheme, Pick<ThemeColors,
    'canvas' | 'immersive' | 'surface' | 'surfaceMuted' | 'surfaceRaised' |
    'ink' | 'inkMuted' | 'borderUi' | 'strong' | 'onStrong' | 'inputBackground'
  >>;
};

export const themeColors: Record<ThemeScheme, ThemeColors> = {
  light: {
    ...invariant,
    ...schemes.light,
    mapLand: '#B9B9BF',
  },
  dark: {
    ...invariant,
    ...schemes.dark,
    mapLand: '#2E2E38',
  },
};

export const semanticVariableNames = [
  'canvas',
  'immersive',
  'surface',
  'surface-muted',
  'surface-raised',
  'ink',
  'ink-muted',
  'border-ui',
  'strong',
  'on-strong',
  'on-primary',
] as const;
