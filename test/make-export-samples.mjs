/* =====================================================================
   EXPORT SAMPLE GENERATOR — Phase 54 (54-05)
   =====================================================================
   Standalone script (outside the node --test glob): builds one model
   per language and writes the four sample files the HUMAN checkpoints
   need — project-en.xlsx / project-fr.xlsx (54-04 workbook) and
   project-en.xml / project-fr.xml (54-05 MSPDI) — under the gitignored
   test-results/export-samples directory.

   It boots NO server and installs NOTHING: fixture factories plus the
   pure writers only. Run: node test/make-export-samples.mjs
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';

import { buildWorkbook } from '../export/xlsx.js';
import { buildMspdi } from '../export/mspdi.js';
import { buildExportModel } from '../src/export/model.js';
import { tFor } from '../src/core/i18n.js';
import { makeDoc } from './fixtures/export-fixtures.mjs';

const OUT_DIR = path.resolve(import.meta.dirname, '..', 'test-results', 'export-samples');

const deps = locale => ({
  translate: (k, v) => tFor(locale, k, v),
  labelName: id => tFor(locale, 'task.label.' + id),
  /* Fixed export date: deterministic samples for a repeatable human check. */
  now: new Date('2026-03-20T12:00:00'),
});

/* Descriptions and comments on: the samples show every surface the human
   checklist inspects (Notes in Project, the Tasks sheet thread column). */
const opts = { descriptions: true, comments: true };

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const locale of ['en', 'fr']) {
  const model = buildExportModel(makeDoc(), 'p_alpha', { scope: 'all', options: opts }, deps(locale));
  if (!model) throw new Error('the fixture project vanished — check test/fixtures/export-fixtures.mjs');

  /* The workbook writer is async (cooperative yields); it fails loudly
     here rather than writing an empty file. */
  const workbook = await buildWorkbook(model);
  const xlsxPath = path.join(OUT_DIR, `project-${locale}.xlsx`);
  fs.writeFileSync(xlsxPath, workbook);

  const xml = buildMspdi(model);
  const xmlPath = path.join(OUT_DIR, `project-${locale}.xml`);
  fs.writeFileSync(xmlPath, xml, 'utf8');

  for (const p of [xlsxPath, xmlPath]) {
    const size = fs.statSync(p).size;
    if (size === 0) throw new Error(`empty sample written: ${p}`);
    console.log(`${p} (${size} bytes)`);
  }
}
