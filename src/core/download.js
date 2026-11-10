/* =====================================================================
   DOWNLOAD — Phase 54 (54-01, D-54-2, R1, R9)
   The one client download path for the export slice: POST, read bytes as
   a Blob, derive the filename from the server's Content-Disposition and
   hand it to the browser. Success NEVER calls res.text() — the payload
   is binary CSV.
   ===================================================================== */
import { t, tErr } from './i18n.js';

/* Parse the server's Content-Disposition. The RFC 5987 filename* UTF-8 form
   is matched FIRST (case-insensitive) — it is the only form that carries
   non-ASCII names — decodeURIComponent it, then fall back to the plain
   quoted/unquoted filename form, then the word export. */
export function filenameFrom(contentDisposition) {
  const header = String(contentDisposition || '');
  const star = header.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;\s]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* a malformed RFC 5987 value falls through to the plain form */
    }
  }
  const plain = header.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;\s]+)/i);
  const name = plain ? plain[1] || plain[2] : '';
  return name || 'export';
}

/* Hand a Blob to the browser's save dialog: temporary object URL, anchor
   click, removal, and a DEFERRED revoke (revoking synchronously can cancel
   the navigation in some engines). */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* async download(path, body): the export route contract. Returns the same
   { ok, status, error } shape the rest of api.js speaks. */
export async function download(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: t('err.serverUnreachable') };
  }
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON error body */
    }
    return { ok: false, status: res.status, error: data?.code ? tErr(data.code, data, data?.error) : data?.error };
  }
  return { ok: true, status: res.status, blob: await res.blob(), filename: filenameFrom(res.headers.get('Content-Disposition')) };
}
