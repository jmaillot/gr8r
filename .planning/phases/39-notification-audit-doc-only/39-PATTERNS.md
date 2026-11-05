# Phase 39: Notification Audit (doc-only) - Pattern Map

**Mapped:** 2026-11-05
**Files analyzed:** 2 (1 created, 1 modified)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `docs/notification-audit.md` | doc (documentation) | transform (source code → cited markdown tables) | `docs/ProjectPermissions.md` | exact |
| `.planning/STATE.md` (edit — "Recent Decisions" line per D-05) | planning-state | append | `.planning/STATE.md` existing "Recent Decisions" entries (e.g. 37-03 precedent) | exact |

## Pattern Assignments

### `docs/notification-audit.md` (doc, transform: code → cited markdown)

**Analog:** `docs/ProjectPermissions.md` (git-tracked — verified via `git ls-files docs/`)

This is the strongest and only necessary analog: a durable repo doc whose entire method is "documented from the real code, with `file:line` citations for every claim, distinguishing what the UI shows from what actually applies." That is exactly D-02/D-03's shape applied to notification prefs instead of permissions.

**Header pattern** (ProjectPermissions.md, lines 1-2):
```markdown
# Permissions — Projets

> Documenté à partir du code réel (server.js + src/). Références `fichier:ligne` pour vérification.
```
Copy for the audit: a one-line epigraph declaring the doc's evidentiary method ("documented from the post-Phase-38 code; every row cites `file:line` for re-verification"). Language is planner's discretion — ProjectPermissions.md is French; the audit may follow repo doc convention (French) or English; state the choice in PLAN.md.

**Core pattern — narrative + citation-bearing table per topic** (ProjectPermissions.md, section 2, lines 8-18):
```markdown
## 2. Les niveaux d'autorisation par personne

Le modal permet d'ajouter des personnes au projet avec un niveau de permission :

| Label UI | Valeur stockée | Sens voulu |
|----------|----------------|------------|
| Peut voir | `Can view` | Lecture seule |
...

**⚠️ Point crucial — application réelle :** le serveur **préserve** `p.perms` (server.js:1007, 1671, 839) mais **ne le lit jamais pour autoriser quoi que ce soit**.
```

Two things to copy:
1. **Section-per-topic structure** (D-02's per-type sections): `## N. <topic>` sections, each with a short narrative paragraph followed by a table — not one flat matrix.
2. **The "toggle exists ≠ behavior exists" rhetorical move**: ProjectPermissions.md's centerpiece is the finding that UI-visible permission levels are *never read server-side*, stated with citations (server.js:1007, 1671, 839). The audit's dead-key findings (`mention_ws`, `assign_*` keys, `push_*` keys — RESEARCH backbone §5) are the same class of finding and should use the same presentation: bold callout + the exact citation lines proving the absence, phrased as dated absence-of-evidence ("no reader found; grep 2026-11-05") per RESEARCH Pitfall 3 / Assumption A1.

**Table style** (ProjectPermissions.md, section 2): pipe tables with backticked code identifiers in cells, plain-language value column. Copy for per-type audit tables; columns per RESEARCH Pattern 1: Channel | Pref key | Current default | Storage state | Live? (consumed by) | Trim recommendation | Status | Source.

**Citation style** (ProjectPermissions.md throughout): inline `(file.js:line)` or `(file.js:1124-1141)` in prose and a trailing Source column in tables — never footnotes, never a bibliography section. D-03 requires per-row citations, so the trailing-column variant is mandatory for table rows; the inline-prose variant applies to narrative paragraphs.

**Key sections that have NO analog in the repo** (use RESEARCH.md patterns instead):
- The RFC 8058 decision section (RESEARCH.md "Pattern 3" gives the recommended prose shape verbatim — use it, including the DKIM split: plain `List-Unsubscribe` now / one-click deferred to a DKIM milestone).
- The status-column owner gate (RESEARCH.md "Pattern 2"): `proposed` / `validated` / `rejected` cell + `validated-by: <owner>, <date>` line once ruled. No repo doc has a machine-readable gate column — this is new (D-05), and RESEARCH's anti-pattern note applies: the doc column IS the gate, no JSON sidecar, no test pin.

**Factual content source:** RESEARCH.md "Verified Fact Backbone" §1-§7 is the row content (16-key whitelist server.js:1124-1141; 11-key defaults server.js:1143-1155; NOTIF_EMAIL_KIND server.js:1175-1181; emission table; consumption/trim map; digest send path; storage/read path). Executor must re-open each cited line before writing the row (RESEARCH Pitfall 1) — do not transcribe line numbers blind.

---

### `.planning/STATE.md` — "Recent Decisions" line (planning-state, append)

**Analog:** existing "Recent Decisions" entries in `.planning/STATE.md` — the Phase 37 precedent (STATE.md 37-03, the `push_due` retirement ruling) is the cited in-context example (39-CONTEXT integration points; RESEARCH open question 2).

Pattern: one line per ruling, `phase-ID`-prefixed, stating the decision and its source. This phase writes nothing there yet — D-05 says validated rows *get* a line when the owner rules. At execution time the only STATE.md touch is the D-05 mirror of the doc's existence/decision if the plan requires it; verify the current STATE.md section header before editing (`grep -n "Recent Decisions" .planning/STATE.md`).

## Shared Patterns

### Citation discipline (D-03)
**Source:** `docs/ProjectPermissions.md` epigraph + inline `(file:line)` style; RESEARCH.md backbone quotes
**Apply to:** every table row and narrative claim in `docs/notification-audit.md`
```markdown
| Email | email_comment | false (NOTIF_PREF_DEFAULTS, server.js:1146) | per-user row, strict === false gate (server.js:1235) | live — comment emails | keep (only false default) | proposed | server.js:1175-1181, :1235 |
```

### Absence-of-reader phrasing
**Source:** ProjectPermissions.md "ne le lit jamais" callout pattern + RESEARCH Pitfall 3 / A1
**Apply to:** all dead-key rows (`push_mention`/`push_assign`/`push_comment`, `mention_ws`, `assign_self`/`assign_status`/`assign_over`)
```markdown
**⚠️ Aucune lecture trouvée :** `mention_ws` — toggle présent (src/pages/settings.js:373) mais aucun lecteur trouvé (grep src/ + server.js, 2026-11-05).
```
Never assert a proven negative; date the grep.

### Scope guard (doc-only)
**Source:** RESEARCH Pitfall 6 / AUDIT-02
**Apply to:** the whole phase — verification is `git diff --name-only <base>` showing only `docs/notification-audit.md` (+ STATE.md line). Zero code changes, zero tests, zero packages.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| RFC 8058 decision section (within `docs/notification-audit.md`) | doc (decision record) | — | No repo doc records an external-spec trade-off decision; use RESEARCH.md "Pattern 3" prose shape verbatim |
| Status column / owner gate | doc convention | — | New mechanism (D-05); no repo precedent for a machine-readable validation column |

## Metadata

**Analog search scope:** `docs/`, `.planning/STATE.md`
**Files scanned:** 4 docs globbed, 1 read in depth (ProjectPermissions.md), all analogs verified git-tracked via `git ls-files`
**Pattern extraction date:** 2026-11-05
