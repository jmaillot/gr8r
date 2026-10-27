// QR rendering (TFA-02 groundwork) — thin wrapper around the vendored
// qrcode-generator@2.0.4 encoder (D-15). The vendored file in ./vendor/ is
// the ONLY QR path: hand-rolled matrices are forbidden (Pitfall 19 — a
// hand-written QR scans in no real camera). Never npm-install the package:
// the runtime stays zero-dependency (D-12, test/dependencies.test.mjs).
//
// D-16 rendering params: typeNumber 0 (auto-size), EC level 'M', quiet
// zone 4 via cellSize 4 / margin 4; final display size (~132 px) is set
// by CSS in the settings 2FA card (16-03).
import qrcode from './vendor/qrcode.js';

export function renderQrSvg(otpauthUri) {
  const qr = qrcode(0, 'M');
  qr.addData(otpauthUri);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: false });
}
