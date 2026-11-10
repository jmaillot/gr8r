/* =====================================================================
   CSV WRITER — Phase 54 (54-01)
   =====================================================================
   Semicolon-separated CSV (owner request, 2026-11-10 — Excel's FR
   locale opens ; natively) with a UTF-8 BOM and formula-injection
   neutralisation (R12, T-54-03). Reads model.columns for the header
   and model.rows for the body; it imports nothing so it runs in the
   browser and in Node.
   ===================================================================== */

const BOM = '\uFEFF';
/* Any value starting with a formula character gets a leading apostrophe so
   Excel / LibreOffice / Sheets never evaluate it (T-54-03). */
const RISKY = /^[=+\-@]/;
const SEP = ';';
/* Quote a value that carries the separator, a quote or a newline. */
const QUOTABLE = /[";\r\n,]/;

function cell(v) {
  let s = v == null ? '' : String(v); // null/undefined become empty fields, never "undefined"
  if (RISKY.test(s)) s = "'" + s;
  return QUOTABLE.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(model) {
  const lines = [(model.columns || []).map(c => cell(c.label)).join(SEP)];
  for (const row of model.rows || []) {
    lines.push((model.columns || []).map(c => cell(row[c.key])).join(SEP));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}
