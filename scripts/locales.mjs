/* The shared locale scan.
   It lives outside src/ so the lucideSubset() walk in vite.config.js never reads it: the
   build config, the i18n scan gate and the test suite share one implementation, and nothing
   here can add a locale to the bundle. Only the name map crosses into src/ — it lives in
   core/locale-names.js as pure data, so the browser registry and the node-side consumers
   share one source of truth. */
import fs from 'node:fs';
import path from 'node:path';
import { LOCALE_NAME_MAP } from '../src/core/locale-names.js';

/* The locale codes present in src/locales: one .json file per locale, sorted.
   Dropping a xx.json file in the directory is the whole act of adding a locale. */
export function localeCodes(srcDir = 'src') {
  const dir = path.join(path.resolve(srcDir), 'locales');
  return fs
    .readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => name.slice(0, -'.json'.length))
    .sort();
}

/* A copy of the shared name map: the native names of the known locales. */
export function localeNames() {
  return { ...LOCALE_NAME_MAP };
}
