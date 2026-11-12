import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { lucideIconNames, lucideIconMarkup } from './scripts/icons.mjs';

/* The base locale. It is the catalogue every other one falls back to (D-08), so it ships in
   EVERY build: a build without it would leave the interface without a language. */
const BASE_LOCALE = 'en';

/* The build's locale set, read from the environment at config load time. The default ships every
   locale; LOCALES=en is the English-only build. No build script may change the default. */
const BUILD_LOCALES = new Set([
  BASE_LOCALE,
  ...(process.env.LOCALES || 'en,fr')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
]);

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

/* The e2e server's staleness guard (DELIV-01, D-04) compares the build-time sha256 of
   .vite/manifest.json against a recomputation at boot. mtime is never trusted (D-04): git
   checkout and touch both rewrite mtimes without touching content. The stamp is written in
   closeBundle, after Vite has emitted the manifest (6.4.4 order), into the build's own
   outDir (resolved from config, so --outDir harness builds stamp their own output — never
   a stale dist/). A missing manifest writes NO stamp and warns loudly at build time — a
   silent hash-less stamp would mask the mismatch until e2e instead of surfacing here. */
function buildStamp() {
  let outDir = null;
  return {
    name: 'build-stamp',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const manifestPath = path.join(outDir, '.vite', 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        this.warn('build-stamp: .vite/manifest.json not found in the build outDir — no stamp written');
        return;
      }
      const hash = createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
      fs.writeFileSync(
        path.join(path.dirname(manifestPath), 'build-stamp.json'),
        JSON.stringify({ algorithm: 'sha256', file: '.vite/manifest.json', hash }, null, 2) + '\n',
      );
    },
  };
}

export default defineConfig({
  build: { manifest: true },
  plugins: [lucideSubset(), localeSubset(), buildStamp()],
  server: {
    port: 5173,
    /* `npm start` serves the API on 8080. Without it, /api fails and the app stays
       in its built-in local-demo mode, so `npm run dev` alone still works. */
    proxy: { '/api': process.env.API_ORIGIN || 'http://localhost:8080' },
  },
});
