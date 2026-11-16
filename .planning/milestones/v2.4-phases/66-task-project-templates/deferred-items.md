# Phase 66 — Deferred Items (out-of-scope discoveries)

## 1. Entry chunk already over the 500 kB gate at phase start (pre-existing)

- **Found during:** 66-02 task 2 full-suite verification
- **Evidence:** with HEAD (b45d711) sources — `src/main.js` and `src/locales/en.json` reverted —
  `node --test test/build-chunk-size.test.mjs` measures the entry `index-*.js` at
  **500,075 bytes > 500,000**. The gate was already red BEFORE any 66-02 change
  (66-01 touched only server.js/mcp.js/tests plus a client-unimported core module, so the
  entry chunk was unchanged by phase 66 until 66-02).
- **66-02's own contribution:** +409 bytes (4 catalogue keys ≈ +317 B riding the bundled
  EN catalogue + the lazy prewarm import line ≈ +92 B) → current entry 500,484 B. The
  template actions module and the builder are NOT in the entry — both ride the dynamic
  `import('./actions/templates.js')` lazy chunk (D-13, the 65-03 subtask-move remedy).
- **Why not fixed here:** shaving the entry requires removing/moving bytes from unrelated
  entry-chunk modules — out of 66-02's scope (executor scope boundary; AGENTS.md forbids
  opportunistic repair).
- **Suggested resolution:** 66-03 (the lazy-UI plan, which owns the chunk budget) or a
  dedicated quick task should move ~600+ bytes out of the entry (candidate: another
  statically-imported module switched to a prewarmed lazy chunk) and re-run the gate.
- **RESOLVED (66-03):** the two heaviest statically-imported modal renderers moved to lazy
  chunks — assigneePickModal → `src/features/assignee-pick.js`, filePreviewModal →
  `src/features/file-preview.js` (loaded before openModal via the S.ui.apMod / S.ui.fpMod
  caches; lazyStub renders while a chunk loads). Entry chunk measured under the 500,000-byte
  gate; `node --test test/build-chunk-size.test.mjs` green (1615/1615 unit tests, 0 fail).
  status: acknowledged
