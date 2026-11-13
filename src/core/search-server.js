/* ---------- SERVER SEARCH CLIENT (Phase 58, D-01/D-03) ----------
   The client half of the hybrid search: a thin, entry-chunk-safe fetch
   over GET /api/workspaces/:slug/search (plan 58-01's route). Pure-core
   conventions like searchall.js — no page imports, no DOM access, so it
   stays in the entry chunk next to the palette (DELIV-02: no new lazy
   chunk). No debounce lives here — callers own it via
   createDebouncedSearch below.

   Discretion (plan): ANY failure — demo mode, offline, abort, non-JSON,
   non-2xx — degrades silently to `{ tasks: [] }`. The palette and the
   /search page never surface a search error. */

import { api, call } from './api.js';

/* The one client entry point to the server search route. The signal argument is an
   optional AbortSignal — a newer keystroke aborts the in-flight request
   (D-02). Never throws. */
export async function searchTasksServer(q, signal) {
  /* D-03: demo/offline mode is byte-identical to today — no fetch, no
     route call, local-only results. Also no workspace loaded → nothing
     to scope the query to. */
  if (!api.enabled) return { tasks: [] };
  const slug = api.workspace?.slug;
  if (!slug) return { tasks: [] };
  try {
    const qs = new URLSearchParams({ q: String(q || '').trim() });
    const r = await call('GET', `/api/workspaces/${encodeURIComponent(slug)}/search?${qs}`, undefined, { signal });
    if (!r.ok || !Array.isArray(r.data?.tasks)) return { tasks: [] };
    return { tasks: r.data.tasks };
  } catch {
    return { tasks: [] }; // silent degrade: abort / network / parse — never an error surface
  }
}

/* Dedupe rule (D-01): local results keep their position; server-only
   tasks (invisible to the local document) are appended after. Shared by
   the palette tasks group and the /search page rows. Operates on ids —
   both sides carry one. Pure. */
export function serverOnlyTasks(localTasks, serverTasks) {
  const seen = new Set(localTasks.map(t => t.id));
  return serverTasks.filter(st => !seen.has(st.id));
}

/* The debounced dispatcher the palette input handler drives (D-02):
   each dispatch clears the prior timer and aborts the prior controller
   SYNCHRONOUSLY, so typing past a slow query never lets the stale
   response win. `run(q, signal, isCurrent)` fires after `delay` ms —
   `isCurrent()` is false as soon as a newer dispatch supersedes this
   one, and the caller discards the stale response. Lives in core (not
   in the palette overlay) so the abort semantics are unit-testable from
   plain node --test; the palette just wires it. */
export function createDebouncedSearch(run, delay = 250) {
  let timer = null;
  let ctrl = null;
  let seq = 0;
  const dispatch = q => {
    if (timer) clearTimeout(timer);
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    const mine = ctrl;
    const mySeq = ++seq;
    timer = setTimeout(() => {
      if (mySeq === seq) run(q, mine.signal, () => mySeq === seq);
    }, delay);
  };
  dispatch.signal = () => ctrl?.signal;
  return dispatch;
}
