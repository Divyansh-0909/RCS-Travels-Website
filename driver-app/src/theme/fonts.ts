import type { FontSource } from 'expo-font';

export const fontAssets: Record<string, FontSource> = {
  'PPMori-Extralight': require('../../assets/fonts/PPMori-Extralight.otf'),
  'PPMori-ExtralightItalic': require('../../assets/fonts/PPMori-ExtralightItalic.otf'),
  'PPMori-Regular': require('../../assets/fonts/PPMori-Regular.otf'),
  'PPMori-RegularItalic': require('../../assets/fonts/PPMori-RegularItalic.otf'),
  'PPMori-SemiBold': require('../../assets/fonts/PPMori-SemiBold.otf'),
  'PPMori-SemiBoldItalic': require('../../assets/fonts/PPMori-SemiBoldItalic.otf'),
  'PPMori-Black': require('../../assets/fonts/PPMori-Black.otf'),
  'PPMori-BlackItalic': require('../../assets/fonts/PPMori-BlackItalic.otf'),
};

export const fonts = {
  light: 'PPMori-Extralight',
  lightItalic: 'PPMori-ExtralightItalic',
  normal: 'PPMori-Regular',
  italic: 'PPMori-RegularItalic',
  semibold: 'PPMori-SemiBold',
  semiboldItalic: 'PPMori-SemiBoldItalic',
  black: 'PPMori-Black',
  blackItalic: 'PPMori-BlackItalic',
} as const;
