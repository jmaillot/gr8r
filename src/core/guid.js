/* =====================================================================
   102-01 CLIENT GUID CANONICALIZATION (D-08, MAPUI-02) — verbatim port
   of groups.js:27-55. groups.js is a server-root module deliberately
   OUTSIDE src/ so Vite never bundles it (header groups.js:5-7) — this
   port is the sanctioned path; no src/ file may import groups.js.
   Acceptance contract: {braced}, no-hyphen and uppercase inputs
   canonicalize identically to the server implementation, so the client
   pre-check and the server funnel (guidRefusal → canonicalizeGuid)
   never diverge. Garbage/null/undefined → ''.
   ===================================================================== */
const GUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const canonicalizeGuid = raw => {
  const s = String(raw ?? '')
    .trim()
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .toLowerCase();
  if (GUID_SHAPE.test(s)) return s;
  if (/^[0-9a-f]{32}$/.test(s)) {
    const hyphenated = `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
    if (GUID_SHAPE.test(hyphenated)) return hyphenated;
  }
  return '';
};
