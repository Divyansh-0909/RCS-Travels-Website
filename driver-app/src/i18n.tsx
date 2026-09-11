import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createTranslator, DEFAULT_LOCALE, normalizeLocale } from '../../shared/i18n/index.js';
import commonEn from '../../shared/i18n/locales/en/common.json';
import commonHi from '../../shared/i18n/locales/hi/common.json';
import commonHinglish from '../../shared/i18n/locales/hi-Latn/common.json';
import driverEn from '../../shared/i18n/locales/en/driver.json';
import driverHi from '../../shared/i18n/locales/hi/driver.json';
import driverHinglish from '../../shared/i18n/locales/hi-Latn/driver.json';
import type { DriverLanguage } from './types/language';
import { setDriverLabelLocale } from './lib/localizedLabels';

const LANGUAGE_KEY = 'rcs.driver.language';

type Translate = (key: string, variables?: Record<string, string | number>) => string;
type LanguageContextValue = {
  language: DriverLanguage;
  ready: boolean;
  setLanguage: (language: DriverLanguage) => Promise<void>;
  t: Translate;
};

const resources = {
  en: { common: commonEn, driver: driverEn },
  hi: { common: commonHi, driver: driverHi },
  'hi-Latn': { common: commonHinglish, driver: driverHinglish },
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setCurrentLanguage] = useState<DriverLanguage>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY)
      .then((saved) => {
        const restored = normalizeLocale(saved) as DriverLanguage;
        setDriverLabelLocale(restored);
        setCurrentLanguage(restored);
      })
      // A language preference must never stop a captain entering the app when
      // device storage is temporarily unavailable.
      .catch(() => setCurrentLanguage(DEFAULT_LOCALE))
      .finally(() => setReady(true));
  }, []);

  const setLanguage = useCallback(async (next: DriverLanguage) => {
    const normalised = normalizeLocale(next) as DriverLanguage;
    // Update imperative metadata before React renders the selected language.
    setDriverLabelLocale(normalised);
    setCurrentLanguage(normalised);
    // Keep the in-session choice usable even when device storage is unavailable.
    await AsyncStorage.setItem(LANGUAGE_KEY, normalised).catch(() => undefined);
  }, []);

  const t = useMemo(() => createTranslator(resources, language), [language]);
  const value = useMemo(() => ({ language, ready, setLanguage, t }), [language, ready, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
};
