# Shared localization

The canonical locale codes are `en`, `hi`, and `hi-Latn`. Import JSON directly
from `shared/i18n/locales/<locale>/<namespace>.json`; this works in both Vite
and Metro without a generated bundle. The shared namespace is `common` and
each app owns its own `website` or `driver` namespace.
The `legal` namespace contains complete terms, privacy, refunds, and grievance documents under `documents`, with localized page chrome under `ui`.

```js
import { createTranslator, normalizeLocale } from '../../shared/i18n/index.js';
import common from '../../shared/i18n/locales/en/common.json';

const locale = normalizeLocale(storedLanguage);
const t = createTranslator({ en: { common }, [locale]: { common } }, locale);
t('common.language.select');
```

Persist the canonical code returned by `normalizeLocale`; it accepts legacy
values (`English`, `Hindi`, `Hinglish`) and browser tags. `createTranslator`
falls back to English for a missing key. Use `{{name}}` placeholders for
interpolation. `validateCatalogs(resources)` returns missing-key and
interpolation mismatches for CI.

Run `node --test shared/i18n/*.test.mjs shared/i18n/test.mjs` for shared translator, catalog placeholder, and legal-document integrity checks.

Run `node shared/i18n/source-audit.mjs frontend/src --json` (or `driver-app/src`) for a syntax-aware review queue. This audit does not prove complete coverage: dynamic labels, validation messages, and API errors also require review. Keep backend enum values and customer-entered content unchanged; translate at display boundaries.

The website exposes its language control only in Settings. Driver onboarding presents the three reading prompts before authentication. Both apps persist the selected locale and bundle Noto Sans Devanagari alongside PP Mori.
