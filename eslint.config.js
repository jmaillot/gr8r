import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'playwright-report/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    /* e2e specs are Node at the module level (the Playwright import and the
       fixture plumbing) and browser inside the test bodies, so they carry
       both environments' globals. */
    files: ['vite.config.js', 'eslint.config.js', 'server.js', 'mailer.js', 'totp.js', 'scripts/**/*.mjs', 'test/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    /* Vendored third-party dist source (D-15): linted as Node but its
       packaging quirks (unused vars) are upstream's, not ours. */
    files: ['src/lib/vendor/**/*.js'],
    rules: { 'no-unused-vars': 'off' },
  },
  {
    files: ['e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
