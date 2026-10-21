/* Build-time helper: turn the browser seed module into seed.json for the server.
   The seed module imports core/utils.js, which touches `document` and `navigator`
   at module scope; the two stubs below are all it needs outside a browser. */
globalThis.document = { querySelectorAll: () => [] };
if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform: 'Linux', userAgent: 'node' },
    configurable: true,
  });
}

const { seed } = await import('../src/data/seed.js');
process.stdout.write(JSON.stringify({ data: seed() }));
