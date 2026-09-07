import i18n, { normalizeLanguage } from './i18n';
import hi from '../../shared/i18n/locales/hi/websiteCopy.json';
import latn from '../../shared/i18n/locales/hi-Latn/websiteCopy.json';
const catalogs = { hi, 'hi-Latn': latn };
/** Explicit UI copy only. Dynamic values are inserted after translation. */
export function websiteCopy(source, variables = {}) {
  if (typeof source !== 'string') return source;
  const locale = normalizeLanguage(i18n.language);
  const key = source.replace(/\s+/g, ' ').trim();
  const manual = i18n.getResource(locale, 'website', 'manual');
  const auto = i18n.getResource(locale, 'website', 'auto');
  const text = catalogs[locale]?.[key] || manual?.[key] || auto?.[key] || source;
  return text.replace(/{{\s*(\w+)\s*}}/g, (match, name) => variables[name] == null ? match : String(variables[name]));
}
