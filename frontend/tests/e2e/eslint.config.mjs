import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
export default [{
  files: ['src/pages/ResponsibilityCase.jsx', 'src/components/CancelledBookingPanel.jsx',
    'src/lib/responsibilityCaseLoad.js', 'src/lib/cancelledAdvanceSummary.js', 'src/lib/responsibilityInspection.js',
    'src/components/ResponsibilityReviewForm.jsx', 'src/lib/responsibilityReviewAction.js'],
  languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
  plugins: { react, 'react-hooks': hooks },
  settings: { react: { version: 'detect' } },
  rules: { ...js.configs.recommended.rules, ...hooks.configs.recommended.rules,
    'react/jsx-uses-vars': 'error', complexity: ['error', 21] },
}];
