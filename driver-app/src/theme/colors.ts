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
  /** Deliberately invariant: it is the reliable high-contrast action surface. */
  strong: '#121220';
  onStrong: '#ffffff';
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
  strong: '#121220',
  onStrong: '#ffffff',
  primary: '#243AFB',
  primaryLight: '#7A94FF',
  negative: '#B91C1C',
  positive: '#166534',
  warning: '#92400E',
  mapRoute: '#7A94FF',
} as const;

export const themeColors: Record<ThemeScheme, ThemeColors> = {
  light: {
    ...invariant,
    canvas: '#F3F3F3',
    immersive: '#F3F3F3',
    surface: '#FFFFFF',
    surfaceMuted: '#E8E8EC',
    surfaceRaised: '#FFFFFF',
    ink: '#121220',
    inkMuted: '#4B5563',
    borderUi: '#D8D8DE',
    mapLand: '#B9B9BF',
  },
  dark: {
    ...invariant,
    canvas: '#1D1D27',
    immersive: '#121220',
    surface: '#272634',
    surfaceMuted: '#262636',
    surfaceRaised: '#323240',
    ink: '#FFFFFF',
    inkMuted: '#C7C7CF',
    borderUi: '#454552',
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
] as const;
