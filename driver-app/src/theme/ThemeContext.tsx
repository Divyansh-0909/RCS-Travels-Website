import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { vars } from 'nativewind';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme, View, type ViewStyle } from 'react-native';
import { themeColors, type ThemeColors, type ThemeScheme } from './colors';

export type ThemePreference = 'system' | ThemeScheme;

type ThemeContextValue = {
  preference: ThemePreference;
  scheme: ThemeScheme;
  colors: ThemeColors;
  ready: boolean;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const THEME_PREFERENCE_KEY = 'rcs.driver.theme-preference';
const ThemeContext = createContext<ThemeContextValue | null>(null);

const isPreference = (value: string | null): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

const themeVariables = (colors: ThemeColors) => ({
  '--canvas': colors.canvas,
  '--immersive': colors.immersive,
  '--surface': colors.surface,
  '--surface-muted': colors.surfaceMuted,
  '--surface-raised': colors.surfaceRaised,
  '--ink': colors.ink,
  '--ink-muted': colors.inkMuted,
  '--border-ui': colors.borderUi,
  '--strong': colors.strong,
  '--on-strong': colors.onStrong,
  '--primary': colors.primary,
  // Compatibility aliases make existing NativeWind var() calls theme-aware
  // while components migrate to the concise semantic class vocabulary.
  '--background': colors.immersive,
  '--background-muted': colors.surfaceMuted,
  '--background-panel': colors.surfaceRaised,
  '--background-primary': colors.strong,
  '--foreground': colors.surface,
  '--foreground-muted': colors.surfaceMuted,
  '--text': colors.ink,
  '--text-muted': colors.inkMuted,
  '--text-foreground': colors.ink,
  '--text-muted-foreground': colors.inkMuted,
});

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const systemScheme = useColorScheme();
  const [preference, setCurrentPreference] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);
  const scheme: ThemeScheme = preference === 'system'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : preference;
  const colors = themeColors[scheme];

  useEffect(() => {
    AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((saved) => {
        if (isPreference(saved)) setCurrentPreference(saved);
      })
      // A missing or temporarily unavailable store must never block a captain.
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    // This owns the area outside the React tree (including transition frames).
    SystemUI.setBackgroundColorAsync(colors.canvas).catch(() => undefined);
  }, [colors.canvas]);

  const setPreference = useCallback(async (next: ThemePreference) => {
    setCurrentPreference(next);
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ preference, scheme, colors, ready, setPreference }),
    [colors, preference, ready, scheme, setPreference],
  );
  const rootVariables = useMemo(
    () => vars(themeVariables(colors)) as unknown as ViewStyle,
    [colors],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View className="flex-1 bg-canvas" style={rootVariables}>{children}</View>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
};
