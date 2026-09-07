/** Shared, dependency-free localization primitives for the website and driver app.
 *
 * Platform adapters should import locale JSON directly (Metro and Vite both
 * understand JSON), then use `translate` for common copy and their namespace.
 */

export const LOCALES = Object.freeze(['en', 'hi', 'hi-Latn']);
export const DEFAULT_LOCALE = 'en';

const aliases = new Map([
  ['en', 'en'], ['en-us', 'en'], ['english', 'en'], ['इंग्लिश', 'en'],
  ['hi', 'hi'], ['hi-in', 'hi'], ['hindi', 'hi'], ['हिंदी', 'hi'],
  ['hi-latn', 'hi-Latn'], ['hinglish', 'hi-Latn'], ['hindi (roman)', 'hi-Latn'],
  ['hindi-roman', 'hi-Latn'], ['हिंग्लिश', 'hi-Latn'],
]);

/** Convert old settings values and browser language tags to a supported code. */
export function normalizeLocale(value, fallback = DEFAULT_LOCALE) {
  if (typeof value !== 'string') return fallback;
  const raw = value.trim();
  if (!raw) return fallback;
  return aliases.get(raw.toLowerCase()) || aliases.get(raw) ||
    (LOCALES.includes(raw) ? raw : fallback);
}

/** Resolve a dotted key and replace i18next-style {{variable}} placeholders. */
export function translate(catalogs, key, variables = {}, fallback) {
  const parts = String(key).split('.');
  let value = catalogs;
  for (const part of parts) value = value && value[part];
  if (typeof value !== 'string') value = fallback ?? key;
  return value.replace(/{{\s*([\w.-]+)\s*}}/g, (match, name) => {
    const replacement = variables[name];
    return replacement === undefined || replacement === null ? match : String(replacement);
  });
}

/** Build a locale-aware translator; missing translated strings use English. */
export function createTranslator(resources, locale) {
  const code = normalizeLocale(locale);
  const active = { ...(resources.en || {}), ...(resources[code] || {}) };
  return (key, variables = {}) => translate(active, key, variables, translate(resources.en, key));
}

/** Check that translated catalogs have every key in the English source. */
export function validateCatalogs(resources, namespaces = Object.keys(resources.en || {}), options = {}) {
  const errors = [];
  const allowSame = new Set(options.allowSame || ['English', 'Hinglish', 'Hindi', 'हिंदी', 'Default', 'OTP', 'RCS', 'UPI', 'CanRead this? Tap here', 'Ye padh sakte hain? Yahan dabayein', 'Yeh padh sakte hain? Yahan dabayein', 'यह पढ़ सकते हैं? यहाँ दबाएँ']);
  const flatten = (object, prefix = '') => Object.entries(object || {}).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' ? flatten(value, path) : [path];
  });
  for (const namespace of namespaces) {
    const source = flatten(resources.en?.[namespace]);
    const sourceValues = resources.en?.[namespace] || {};
    for (const locale of LOCALES.filter(code => code !== 'en')) {
      const targetValues = resources[locale]?.[namespace];
      const target = new Set(flatten(targetValues));
      for (const key of source) {
        const read = (object) => key.split('.').reduce((value, part) => value?.[part], object);
        const value = read(targetValues);
        if (!target.has(key)) errors.push(`${locale}/${namespace}:${key}:missing`);
        else if (typeof value !== 'string' || !value.trim()) errors.push(`${locale}/${namespace}:${key}:empty`);
        else if (locale !== 'en' && value === read(sourceValues) && !allowSame.has(value)) errors.push(`${locale}/${namespace}:${key}:untranslated`);
      }
      for (const key of flatten(targetValues)) if (!source.includes(key)) errors.push(`${locale}/${namespace}:${key}:extra`);
      const placeholders = (value) => [...String(value || '').matchAll(/{{\s*([\w.-]+)\s*}}/g)].map(m => m[1]).sort().join('|');
      for (const key of source) {
        const read = (object) => key.split('.').reduce((value, part) => value?.[part], object);
        if (target.has(key) && placeholders(read(sourceValues)) !== placeholders(read(targetValues))) {
          errors.push(`${locale}/${namespace}:${key}:interpolation`);
        }
      }
    }
  }
  return errors;
}

export const LANGUAGE_OPTIONS = Object.freeze([
  { code: 'en', label: 'English', prompt: 'CanRead this? Tap here' },
  { code: 'hi-Latn', label: 'Hinglish', prompt: 'Ye padh sakte hain? Yahan dabayein' },
  { code: 'hi', label: 'हिंदी', prompt: 'यह पढ़ सकते हैं? यहाँ दबाएँ' },
]);
