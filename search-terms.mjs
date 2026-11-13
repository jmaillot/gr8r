/* =====================================================================
   SEARCH TERMS (Phase 58, D-13/D-15) — server-side query sanitization.
   Zero-dependency module: server.js and db-adapter.mjs cannot import
   src/core/utils.js (browser module — it imports i18n.js, which touches
   DOM). foldForSearch is therefore duplicated here VERBATIM from
   src/core/utils.js:22-34 and pinned byte-identical by
   test/search-terms-drift.test.mjs — the established
   duplicate-with-drift-pin pattern (same discipline as the PERMS
   ladder / test/perm-drift.test.mjs).

   searchTerms(q) is the ONLY path from raw user input to the FTS
   match layer (D-13): fold once, split on every non-[a-z0-9]
   character, drop empty and sub-2-char tokens. No FTS5 operator
   character (quotes, *, :, NEAR parens) can survive — the returned
   tokens are pure [a-z0-9]+ and the adapter is the only site that
   appends the prefix '*' (D-13: only `tok*`-suffixed whitelist tokens
   ever reach MATCH). Queries folding shorter than 2 characters
   return [] (D-15: minimum server query length).
   ===================================================================== */

/* Verbatim copy of src/core/utils.js foldForSearch (lower + NFD strip,
   with the original-index map the client highlight uses — the map is
   kept so the two copies stay line-identical for the drift pin). */
export function foldForSearch(s) {
  const src = String(s ?? '').toLowerCase();
  let text = '';
  const map = [];
  for (let i = 0; i < src.length; i++) {
    const folded = src[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const c of folded) {
      text += c;
      map.push(i);
    }
  }
  return { text, map };
}

/* D-13/D-15: raw query in, whitelisted [a-z0-9]+ token list out.
   Empty list ⇒ the caller answers an empty result — never a match
   expression built from raw input. */
export function searchTerms(q) {
  const folded = foldForSearch(String(q ?? '')).text;
  if (folded.trim().length < 2) return []; // D-15
  return folded
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2);
}
