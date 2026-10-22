import { defineConfig } from 'vite';
import { lucideIconNames, lucideIconMarkup } from './scripts/icons.mjs';

/* The build's locale set, read from the environment at config load time. The default ships every
   locale; LOCALES=en is the English-only build. No build script may change the default. */
const BUILD_LOCALES = new Set(
  (process.env.LOCALES || 'en,fr')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
);

/* `virtual:icons` exports only the Lucide icons the source actually names, as inline SVG markup,
   so the bundle carries ~170 icons instead of the full set. The scan is the shared one in
   scripts/icons.mjs, so the build plugin and the test suite can never diverge — and the scan
   lives outside src/, so it can never read itself and add an icon to the bundle. */
function lucideSubset() {
  const id = 'virtual:icons',
    resolved = '\0' + id;
  return {
    name: 'lucide-subset',
    resolveId: s => (s === id ? resolved : null),
    load(s) {
      if (s !== resolved) return null;
      const out = {};
      for (const name of lucideIconNames('src')) out[name] = lucideIconMarkup(name);
      return `export const ICONS = ${JSON.stringify(out)};`;
    },
  };
}

/* A locale outside the build's locale set resolves to an empty module, so its strings never reach
   the bundle: the English-only build still resolves the French import (the glob in
   src/core/i18n.js still matches it) but the module it resolves to carries no French byte. The
   contract is about bytes, not about file names: the French chunk may survive as a near-empty
   stub, and that is expected. */
function localeSubset() {
  const EMPTY = '\0virtual:locale-empty:';
  return {
    name: 'locale-subset',
    enforce: 'pre',
    resolveId(source) {
      const m = /(?:^|\/)locales\/([A-Za-z0-9_-]+)\.json$/.exec(source);
      if (!m) return null;
      if (BUILD_LOCALES.has(m[1])) return null;
      return EMPTY + m[1];
    },
    load(id) {
      if (!id.startsWith(EMPTY)) return null;
      return 'export default {};';
    },
  };
}

export default defineConfig({
  plugins: [lucideSubset(), localeSubset()],
  server: {
    port: 5173,
    /* `npm start` serves the API on 8080. Without it, /api fails and the app stays
       in its built-in local-demo mode, so `npm run dev` alone still works. */
    proxy: { '/api': process.env.API_ORIGIN || 'http://localhost:8080' },
  },
});
