// SEARCH-01 (Phase 34): tokenized hidden-name matcher for recent searches.
//
// D-13 — match on word/token boundaries after normalization instead of a raw
// substring `includes`: a term that shares a FULL token with a hidden project
// name is dropped, while a substring-only collision inside a longer token
// ("Sara Corp" vs hidden "Sarah") survives. No leak, no false positive.
//
// D-14 — normalization is NFC + `toLowerCase` on BOTH sides, then a code-point
// token comparison. Diacritics are NEVER stripped ("Café" must not match
// "cafe"), and full Unicode casefold via Intl is deliberately out (D-14 locks
// the normalization; ß / dotted-I are accepted limitations, not bugs to fix).
//
// Pure and importable — server.js stays export-free (D-16 test seam).

/* Normalize + tokenize a value: NFC, lowercase, split on any run of
   characters that is not a letter or a number (Unicode-aware). */
export function tokenize(value) {
  if (typeof value !== 'string') return [];
  return value
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/* A free-text term that shares at least one full token with a hidden name.
   Non-string terms never match (kept); an empty hidden list never matches.
   A hidden name that tokenizes to nothing (symbols/punctuation only, e.g.
   "###" or "!!!") can never share a token, so it falls back to a substring
   check — the pre-34-03 behavior — for that name only. */
export function referencesHidden(term, hiddenTerms) {
  if (typeof term !== 'string') return false;
  const tokens = new Set(tokenize(term));
  if (tokens.size === 0) return false;
  for (const name of Array.isArray(hiddenTerms) ? hiddenTerms : []) {
    const nameTokens = tokenize(name);
    if (nameTokens.length === 0) {
      // Tokenless name: substring fallback so symbol-only hidden names keep
      // the same protection they had under the pre-tokenized matcher.
      const norm = String(name ?? '').normalize('NFC').toLowerCase().trim();
      if (norm && term.normalize('NFC').toLowerCase().includes(norm)) return true;
      continue;
    }
    for (const token of nameTokens) {
      if (tokens.has(token)) return true;
    }
  }
  return false;
}
