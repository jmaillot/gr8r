/* =====================================================================
   scripts: fr-parity — the namespace-scoped gate for the translation
   batches of phase 7.

   The phase's full en→fr completeness test (test/catalogue.test.mjs) is
   RED by design until the last batch lands. This script is the batch
   device: it takes namespace names as argv — the same dotted prefixes the
   catalogue keys use — and exits non-zero naming every key of those
   namespaces that lacks a non-empty French value. Exit 0 and no output
   when the listed namespaces are complete, so a batch plan can gate each
   of its tasks on exactly the namespaces it fills.

   The contract namespace is the documented exception to completeness:
   contract.englishOnly exists only in English and contract.frenchOnly only
   in French, so the contract.* keys are exempt here as in the full test.

   Plain Node, no dependency. Only node:fs and node:path.
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOCALES_DIR = path.join(ROOT, 'src', 'locales');
const CONTRACT = 'contract.';

const readJson = name => JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, name), 'utf8'));

const en = readJson('en.json');
const fr = readJson('fr.json');

/* A key is complete when fr holds a non-empty string, or a plural object
   carrying non-empty one and other members. */
function complete(key) {
  const value = fr[key];
  if (typeof value === 'string') return value !== '';
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return ['one', 'other'].every(category => Object.hasOwn(value, category) && value[category] !== '');
  }
  return false;
}

const namespaces = process.argv.slice(2).filter(arg => arg && !arg.startsWith('-'));
if (namespaces.length === 0) {
  console.error('usage: node scripts/fr-parity.mjs <namespace> [namespace ...]   e.g. page a11y');
  process.exit(2);
}

const missing = [];
for (const namespace of namespaces) {
  const prefix = namespace.endsWith('.') ? namespace : `${namespace}.`;
  for (const key of Object.keys(en).filter(k => k.startsWith(prefix))) {
    if (key.startsWith(CONTRACT)) continue;
    if (!complete(key)) missing.push(key);
  }
}

if (missing.length > 0) {
  console.error(`missing French values in ${namespaces.join(', ')} (${missing.length}):`);
  for (const key of missing) console.error(`  ${key}`);
  process.exit(1);
}
