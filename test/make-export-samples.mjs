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
import assert from 'node:assert/strict';

import { buildWorkbook } from '../export/xlsx.js';
import { buildMspdi } from '../export/mspdi.js';
import { toCsv } from '../src/export/csv.js';
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
   checklist inspects (Notes in Project, the Tasks sheet thread column).
   Subtasks on (69-02, D-69-5): the owner's UAT needs the 3-level tree —
   DEFAULT_OPTIONS.subtasks is false, so it must be enabled explicitly or
   the samples silently flatten (the generator self-check would then fail). */
const opts = { descriptions: true, comments: true, subtasks: true };

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const locale of ['en', 'fr']) {
  const model = buildExportModel(makeDoc(), 'p_alpha', { scope: 'all', options: opts }, deps(locale));
  if (!model) throw new Error('the fixture project vanished — check test/fixtures/export-fixtures.mjs');

  /* 69-02 self-check: a silently flat sample set would waste the owner's
     UAT session, so the generator fails loudly (exit non-zero) unless the
     model actually carries the 3-level tree (a 3-segment dotted key) and
     the MSPDI serializes OutlineLevel 2 for the nested level. */
  assert.ok(
    model.rows.some(r => /\.\d+\.\d+$/.test(r.key)),
    `no 3-segment dotted key in the ${locale} model rows — the 3-level tree flattened`,
  );

  /* The workbook writer is async (cooperative yields); it fails loudly
     here rather than writing an empty file. */
  const workbook = await buildWorkbook(model);
  const xlsxPath = path.join(OUT_DIR, `project-${locale}.xlsx`);
  fs.writeFileSync(xlsxPath, workbook);

  const xml = buildMspdi(model);
  assert.ok(
    xml.includes('<OutlineLevel>2</OutlineLevel>'),
    `no OutlineLevel 2 in the ${locale} MSPDI — the nested level is missing from the XML`,
  );
  const xmlPath = path.join(OUT_DIR, `project-${locale}.xml`);
  fs.writeFileSync(xmlPath, xml, 'utf8');

  /* 69-02 (D-69-5, research open question 2): the CSV rides the same
     model through the zero-dep toCsv writer (src/export/csv.js). */
  const csvPath = path.join(OUT_DIR, `project-${locale}.csv`);
  fs.writeFileSync(csvPath, toCsv(model), 'utf8');

  for (const p of [xlsxPath, xmlPath, csvPath]) {
    const size = fs.statSync(p).size;
    if (size === 0) throw new Error(`empty sample written: ${p}`);
    console.log(`${p} (${size} bytes)`);
  }
}
