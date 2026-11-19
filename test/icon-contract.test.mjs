/* =====================================================================
   test: icon-contract — the static contract pinning the PWA-02 icon
   set (Phase 72, plan 72-02). Pins, at the PNG binary level, the
   install icon contract:

     - all five PNGs exist under public/ and are non-empty
     - exact IHDR dimensions (bytes 16–23: big-endian uint32
       width/height after the 8-byte PNG signature and the IHDR
       chunk header): 192×192 (icon-192, icon-maskable-192),
       512×512 (icon-512, icon-maskable-512), 180×180
       (apple-touch-icon)
     - apple-touch-icon opacity: IHDR color-type 2 (truecolor RGB,
       no alpha channel) and no tRNS chunk — iOS flattens
       transparency to black (Pitfall 3)
     - manifest cross-check: every public/manifest.webmanifest icon
       src resolves to a real file under public/, and every committed
       install PNG is referenced (by the manifest or by index.html's
       apple-touch-icon link)
     - public/icon-maskable.svg exists as the re-render source

   Pattern: test/manifest-contract.test.mjs (node:test + node:assert/strict).
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..');
const PNG = rel => fs.readFileSync(path.join(ROOT, rel));

/* PNG structural constants: 8-byte signature, then chunk = 4-byte
   length + 4-byte type + data; IHDR data starts with width/height
   as big-endian uint32s at bytes 16–23, color-type at byte 25. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function parsePNGHeader(buf) {
  assert.ok(buf.subarray(0, 8).equals(PNG_SIGNATURE), 'file must start with the 8-byte PNG signature');
  assert.equal(buf.readUInt32BE(8), 13, 'IHDR chunk data length must be 13');
  assert.equal(buf.toString('ascii', 12, 16), 'IHDR', 'first chunk must be IHDR');
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25],
    chunks: chunkTypes(buf),
  };
}

/* Walk the chunk table (types only) until IEND. */
function chunkTypes(buf) {
  const types = [];
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    types.push(buf.toString('ascii', offset + 4, offset + 8));
    offset += 12 + length; /* length + type + data + CRC */
    if (types[types.length - 1] === 'IEND') break;
  }
  return types;
}

const ICONS = {
  'public/icon-192.png': { width: 192, height: 192 },
  'public/icon-512.png': { width: 512, height: 512 },
  'public/icon-maskable-192.png': { width: 192, height: 192 },
  'public/icon-maskable-512.png': { width: 512, height: 512 },
  'public/apple-touch-icon.png': { width: 180, height: 180 },
};

describe('install icon set: existence and exact IHDR dimensions (SC-2)', () => {
  for (const [rel, { width, height }] of Object.entries(ICONS)) {
    test(`${rel} exists, is non-empty, and is exactly ${width}x${height} per IHDR bytes`, () => {
      const buf = PNG(rel);
      assert.ok(buf.length > 0, `${rel} must be non-empty`);
      const hdr = parsePNGHeader(buf);
      assert.equal(hdr.width, width, `${rel} IHDR width must be ${width}`);
      assert.equal(hdr.height, height, `${rel} IHDR height must be ${height}`);
    });
  }
});

describe('apple-touch-icon opacity (Pitfall 3 — iOS flattens transparency to black)', () => {
  test('IHDR color-type is 2 (truecolor RGB, no alpha channel) and no tRNS chunk', () => {
    const hdr = parsePNGHeader(PNG('public/apple-touch-icon.png'));
    assert.equal(hdr.colorType, 2, 'apple-touch-icon must be truecolor RGB (color-type 2, zero alpha)');
    assert.ok(!hdr.chunks.includes('tRNS'), 'apple-touch-icon must carry no tRNS transparency chunk');
  });
});

describe('any-purpose icon transparency (owner decision 2026-11-19)', () => {
  /* The purpose:"any" icons render the rounded-rect tile over TRANSPARENT corners —
     the launcher/taskbar color shows through, no baked-in white frame. The maskable
     variants and apple-touch-icon stay full-bleed opaque. */
  for (const rel of ['public/icon-192.png', 'public/icon-512.png']) {
    test(`${rel} carries an alpha channel (color-type 6, RGBA)`, () => {
      assert.equal(parsePNGHeader(PNG(rel)).colorType, 6, `${rel} must be RGBA (color-type 6) — corners transparent, never flattened to white`);
    });
  }
});

describe('manifest cross-check: icon srcs resolve to real committed files', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/manifest.webmanifest'), 'utf8'));

  test('every manifest icon src resolves to a real file under public/', () => {
    assert.ok(manifest.icons.length >= 4, 'manifest must declare its icon entries');
    for (const icon of manifest.icons) {
      const file = path.join(ROOT, 'public', icon.src.replace(/^\//, ''));
      assert.ok(fs.existsSync(file), `manifest icon src ${icon.src} must exist under public/`);
      assert.equal(path.extname(file), '.png', 'manifest icons must be PNG files (no SVG-in-manifest fallback)');
    }
  });

  test('every committed install PNG is referenced by the manifest or the apple-touch-icon head link', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    for (const rel of Object.keys(ICONS)) {
      const src = '/' + path.basename(rel);
      const referenced =
        manifest.icons.some(i => i.src === src) ||
        html.includes(`href="${src}"`);
      assert.ok(referenced, `${src} must be referenced by the manifest or index.html`);
    }
  });
});

describe('maskable re-render source (D-03/D-06)', () => {
  test('public/icon-maskable.svg exists and is non-empty', () => {
    const svg = fs.readFileSync(path.join(ROOT, 'public/icon-maskable.svg'), 'utf8');
    assert.ok(svg.length > 0, 'icon-maskable.svg must be non-empty');
    assert.ok(svg.includes('<svg'), 'icon-maskable.svg must be an SVG document');
  });
});
