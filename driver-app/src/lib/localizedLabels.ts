import { normalizeLocale, translate } from '../../../shared/i18n/index.js';
import en from '../../../shared/i18n/locales/en/driverLabels.json';
import hi from '../../../shared/i18n/locales/hi/driverLabels.json';
import hiLatn from '../../../shared/i18n/locales/hi-Latn/driverLabels.json';
import docsEn from '../../../shared/i18n/locales/en/driverDocuments.json';
import docsHi from '../../../shared/i18n/locales/hi/driverDocuments.json';
import docsLatn from '../../../shared/i18n/locales/hi-Latn/driverDocuments.json';

const catalogs: Record<string, any> = { en, hi, 'hi-Latn': hiLatn };
const documentCatalogs: Record<string, any> = { en: docsEn, hi: docsHi, 'hi-Latn': docsLatn };
export const driverDocumentLabel = (locale: string | null | undefined, type: string) => (documentCatalogs[normalizeLocale(locale)].documents as Record<string, string>)[type] || (docsEn.documents as Record<string, string>)[type] || type;
export const driverDocumentField = (locale: string | null | undefined, type: string) => (documentCatalogs[normalizeLocale(locale)].fields as Record<string, string[]>)[type] || (docsEn.fields as Record<string, string[]>)[type];
let currentLocale = 'en';
export const getDriverLabelLocale = () => currentLocale;
export const setDriverLabelLocale = (locale?: string | null) => { currentLocale = normalizeLocale(locale); };
export const driverLocaleCatalog = (locale?: string | null) => catalogs[normalizeLocale(locale ?? currentLocale)];
export const driverMonths = (locale?: string | null): string[] => driverLocaleCatalog(locale).time.months;
export const driverLabel = (locale: string | null | undefined, key: string, vars: Record<string, unknown> = {}) => {
  const code = normalizeLocale(locale ?? currentLocale);
  return translate(catalogs[code], key, vars, translate(en, key));
};
