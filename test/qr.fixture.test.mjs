// D-17 QR fixture test — proves the vendored encoder renders a real,
// deterministic QR SVG from an otpauth URI (T-16-06: no hand-rolled matrix).
// DELIV-02: renderQrSvg is async (the vendored encoder loads from a lazy
// chunk via cached dynamic import), so every assertion awaits it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderQrSvg } from '../src/lib/qr.js';

// D-54 URI shape built by totp.js buildOtpauthUri (server-side, 16-02)
const OTPAUTH = 'otpauth://totp/Projects Studio:user%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Projects Studio&algorithm=SHA1&digits=6&period=30';

test('renderQrSvg returns a full inline <svg> string', async () => {
  const svg = await renderQrSvg(OTPAUTH);
  assert.equal(typeof svg, 'string');
  assert.ok(svg.startsWith('<svg'), 'output must start with <svg');
  assert.ok(svg.trimEnd().endsWith('</svg>'), 'output must end with </svg>');
});

test('renderQrSvg draws a real module matrix (not an empty frame)', async () => {
  const svg = await renderQrSvg(OTPAUTH);
  // a real QR of a ~100-char URI has hundreds of modules; the vendored
  // encoder packs them into one <path> as M…z move-draw segments
  const cells = (svg.match(/M\d+,\d+/g) || []).length;
  assert.ok(cells > 50, `expected a substantial module matrix, got ${cells} drawn cells`);
});

test('renderQrSvg viewBox has equal width and height', async () => {
  const svg = await renderQrSvg(OTPAUTH);
  const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(m, `no viewBox found in: ${svg.slice(0, 200)}`);
  assert.equal(m[1], m[2], `viewBox not square: ${m[1]} x ${m[2]}`);
});

test('renderQrSvg is deterministic for the same URI', async () => {
  assert.equal(await renderQrSvg(OTPAUTH), await renderQrSvg(OTPAUTH));
});

test('renderQrSvg encodes the hostile-email D-54 URI without throwing', async () => {
  const { buildOtpauthUri } = await import('../totp.js');
  const uri = buildOtpauthUri('a:b?c&d e@x.com', 'SECRETABC');
  const svg = await renderQrSvg(uri);
  assert.ok(svg.startsWith('<svg'));
});

test('renderQrSvg output differs for different payloads', async () => {
  const a = await renderQrSvg(OTPAUTH);
  const b = await renderQrSvg(OTPAUTH.replace('user%40example.com', 'other%40example.com'));
  assert.notEqual(a, b);
});
