import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readLocale(file) {
  return JSON.parse(readFileSync(join(root, 'src', 'locales', file), 'utf8'));
}

test('en.json settings.pw.done states other sessions were signed out', () => {
  const done = readLocale('en.json')['settings.pw.done'];
  assert.ok(done.includes('signed out'), `honest phrase missing: ${done}`);
  assert.ok(!done.includes('stay signed in'), `falsified claim present: ${done}`);
});

test('fr.json settings.pw.done states other sessions were disconnected', () => {
  const done = readLocale('fr.json')['settings.pw.done'];
  assert.ok(done.includes('déconnectées'), `honest phrase missing: ${done}`);
  assert.ok(!done.includes('restent connectées'), `falsified claim present: ${done}`);
});

test('both locale catalogues parse as valid JSON', () => {
  assert.ok(typeof readLocale('en.json') === 'object');
  assert.ok(typeof readLocale('fr.json') === 'object');
});
