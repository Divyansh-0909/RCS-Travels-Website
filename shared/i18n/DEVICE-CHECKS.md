# Localization device checks

These checks need an installed captain app and a test account. No real ride or payment is needed for the onboarding checks.

1. Open the initial onboarding screen. Try each entry button separately. Both should open the language selector before the login or signup fields.
2. Choose English, Hinglish, and Hindi in separate attempts. Check the exact reading prompts, then continue to the next form. The form should use your choice.
3. Close and reopen the app. Confirm the selected language remains active. Repeat after changing language in account Settings.
4. With Hindi selected, open the keyboard on name, phone, and OTP fields. Check that instructions, errors, and the main button remain readable and reachable. Repeat with the phone's larger text setting.
5. On a test account, inspect document uploads, account settings, and ride screens. Check Hindi vowel marks, wrapped button labels, bottom sheets, Android Back/iOS swipe-back, and the live native map.

If something fails, record the screen, language, phone model, and a screenshot. Authentication and live native map behavior cannot be verified by the isolated browser component preview.

## Checks already completed locally

- Website Settings: all three language selections, persistence after refresh, and no homepage language control.
- Website mobile/desktop screenshots: Settings, booking selection/loading, account, Help, and legal pages. No horizontal overflow in the inspected states.
- Captain selector: actual component, language provider, and bundled fonts rendered at 320px and 390px; all selections persisted and wrapped without horizontal overflow.
- All eight localization catalogs: matching keys and interpolation placeholders; legal paragraph and draft-marker integrity.
- Website production build and existing checkout test; captain TypeScript check and lint (five unrelated existing warnings).

The browser-only map fallback prevents the native map library from crashing web previews. The complete captain browser app still cannot initialize its configured authentication on localhost. Production authentication has not been bypassed or changed.
