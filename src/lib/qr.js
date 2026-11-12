// QR rendering (TFA-02 groundwork) — thin wrapper around the vendored
// qrcode-generator@2.0.4 encoder (D-15). The vendored file in ./vendor/ is
// the ONLY QR path: hand-rolled matrices are forbidden (Pitfall 19 — a
// hand-written QR scans in no real camera). Never npm-install the package:
// the runtime stays zero-dependency (D-12, test/dependencies.test.mjs).
//
// D-16 rendering params: typeNumber 0 (auto-size), EC level 'M', quiet
// zone 4 via cellSize 4 / margin 4; final display size (~132 px) is set
// by CSS in the settings 2FA card (16-03).

/* DELIV-02: the vendored encoder ships as a lazy chunk via dynamic import
   (Vite 6 auto-splits every import() — no manualChunks config). The promise
   is cached so repeated clicks never re-fetch, and cleared on rejection so
   a transient chunk-load failure cannot wedge the 2FA flow (D-03/T-56-01):
   the next click retries the import. No idle preloading anywhere. */
let modPromise = null;

function loadQrcode() {
  if (!modPromise) {
    modPromise = import('./vendor/qrcode.js').catch(err => {
      modPromise = null; // retry-reset: next call re-attempts the import
      throw err;
    });
  }
  return modPromise;
}

export async function renderQrSvg(otpauthUri) {
  const qrcode = (await loadQrcode()).default;
  const qr = qrcode(0, 'M');
  qr.addData(otpauthUri);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: false });
}
