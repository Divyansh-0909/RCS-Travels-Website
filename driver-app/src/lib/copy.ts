import en from '../../../shared/i18n/locales/en/driverCopy.json';
import hi from '../../../shared/i18n/locales/hi/driverCopy.json';
import latn from '../../../shared/i18n/locales/hi-Latn/driverCopy.json';
import { getDriverLabelLocale } from './localizedLabels';

const catalogs: Record<string, Record<string, string>> = {en, hi, 'hi-Latn': latn};
/** Only explicitly marked interface copy enters this lookup. Rider names,
 * addresses, document numbers, and other supplied data remain untouched.
 */
export function driverCopy<T>(source: T, variables: Record<string, unknown> = {}): T {
  if (typeof source !== 'string') return source;
  const key = source.replace(/\s+/g, ' ').trim();
  const text = catalogs[getDriverLabelLocale()]?.[key] || source;
  return text.replace(/{{\s*(\w+)\s*}}/g, (match, name: string) => variables[name] == null ? match : String(variables[name])) as T;
}
