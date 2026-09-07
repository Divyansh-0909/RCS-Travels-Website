import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslator, LANGUAGE_OPTIONS, normalizeLocale, validateCatalogs } from './index.js';
import en from './locales/en/common.json' with { type: 'json' };
import hi from './locales/hi/common.json' with { type: 'json' };
import latn from './locales/hi-Latn/common.json' with { type: 'json' };

test('normalizes legacy language settings', () => {
  assert.equal(normalizeLocale('English'), 'en');
  assert.equal(normalizeLocale('Hindi'), 'hi');
  assert.equal(normalizeLocale('Hinglish'), 'hi-Latn');
  assert.equal(normalizeLocale('hi-IN'), 'hi');
});

test('selector copy is exact and ordered', () => {
  assert.deepEqual(LANGUAGE_OPTIONS.map(option => option.prompt), [
    'CanRead this? Tap here', 'Ye padh sakte hain? Yahan dabayein', 'यह पढ़ सकते हैं? यहाँ दबाएँ',
  ]);
});

test('catalogs contain common keys and interpolation is preserved', () => {
  assert.deepEqual(validateCatalogs({ en: { common: en }, hi: { common: hi }, 'hi-Latn': { common: latn } }), []);
  const t = createTranslator({ en: { common: en }, hi: { common: hi } }, 'hi');
  assert.equal(t('common.actions.continue'), 'जारी रखें');
  assert.equal(t('common.actions.greeting', { name: 'Raju' }), 'नमस्ते, Raju');
  assert.equal(t('common.unknown'), 'common.unknown');
});

test('validator reports malformed, copied, extra, and interpolation keys', () => {
  const source = { greeting: 'Hello {{name}}', keep: 'Keep' };
  const errors = validateCatalogs({ en: { common: source }, hi: { common: { greeting: 'नमस्ते', keep: 'Keep', extra: 'अतिरिक्त' } }, 'hi-Latn': { common: {} } });
  assert.ok(errors.includes('hi/common:keep:untranslated'));
  assert.ok(errors.includes('hi/common:extra:extra'));
  assert.ok(errors.includes('hi/common:greeting:interpolation'));
  assert.ok(errors.includes('hi-Latn/common:greeting:missing'));
});
