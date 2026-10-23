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
    files: ['vite.config.js', 'eslint.config.js', 'server.js', 'mailer.js', 'scripts/**/*.mjs', 'test/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
