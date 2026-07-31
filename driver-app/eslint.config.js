// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Build output and generated files. eslint-config-expo already carries the
    // rules themselves (TypeScript, react, react-hooks, import, expo) — add
    // project rules here only in a config object that also declares the plugin
    // they belong to, since flat config resolves rules per object.
    ignores: ["dist/*", ".expo/*", "web-build/*", "expo-env.d.ts"],
  },
]);
