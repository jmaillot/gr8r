# Phase 40: Digest Subject & Task Lines - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Mailer-side upgrade of the Phase 38 daily digest: the Subject names the workspace (`[WS] …`), each task line reads "Project Name — Task Name", and the shared RFC 2047 subject encoder is hardened against CRLF header injection (SUBJ-01..03). No migrations, no new endpoints, no From-header changes, no digest-window or claim-key changes — the `${ws.id}:${user_id}:digest:${localDate}` key stays byte-identical.

</domain>

<decisions>
## Implementation Decisions

### Subject format
- **D-01:** Workspace name appears as a bracket prefix: `[Acme] Daily digest: 3 task(s)` — the bracket keeps the name visually distinct from the localized count sentence.
- **D-02:** New i18n key `notif.digest.subjectWs` with `{ws}` and `{count}` params, EN+FR via `tFor`. The existing `notif.digest.subject` key is NOT deleted — it stays as the SC-5 English-literal try/catch fallback path in `buildDigestMessage`.
- **D-03:** `notif.digest.subjectWs` is added to `src/locales/en.json` and `src/locales/fr.json`; `npm run i18n:scan` must stay green.

### Task line shape
- **D-04:** Task line reads `Project Name — Task Name` (em dash). Text part renders it plain; the HTML part renders the whole string as one `<a>` link to the task (link target = task URL, unchanged).
- **D-05:** The project name is resolved SERVER-side in the existing per-recipient task loop (server.js digest section, after the `memberCanReadProject`/SCOPE-04 checks already run) and passed to the mailer as `{key, title, project}`. The mailer stays a pure renderer — it never sees project IDs and can never leak a name that wasn't already visibility-cleared.
- **D-06:** When no project name is present in the message (unknown project, private/invisible project), the line silently degrades to task-title-only — no "Unknown project" placeholder, no "Private project" marker (a marker would confirm existence = leak).
- **D-07:** The em dash separator is plain `"—"`. A project name that itself contains an em dash creates cosmetic ambiguity (`A—B — Task`); accepted, no escaping or alternative separator.

### Subject builder hardening (SUBJ-03)
- **D-08:** Harden the shared `encodeWord` (mailer.js:52) — strip CR, LF and C0 control characters BEFORE the encode decision. This is "one tested builder" for all four Subject call sites (digest, notification, security alert, invitation).
- **D-09:** Hostile-name unit tests pin: CRLF injection (`name\r\nBcc: …`), emoji, FR accents, 200+ char names — exactly one well-formed Subject header, no mojibake, no second header line.
- **D-10:** Out of scope: From-header name hardening (`formatAddress`). Subject path only — do not touch `formatAddress` behavior this phase.

### Truncation
- **D-11:** Workspace name capped at 64 chars in the Subject.
- **D-12:** Project and task names in task lines capped independently (~80 chars, shared cap) before joining with the em dash.
- **D-13:** Truncation is a mailer-side `truncate(name, cap)` helper applied at render time; the server keeps passing full names. Truncation is a presentation concern.
- **D-14:** Truncated names get a single `…` (U+2026) appended.

### the agent's Discretion
- Exact cap value for task-line names (~80) if tests show a better number.
- Where the `truncate` helper lives in mailer.js (near `escapeHtml`/`encodeWord` is natural).
- Exact FR wording of `notif.digest.subjectWs` following existing catalogue style.
- Whether the workspace-name strip happens once at the call site or inside `tFor` interpolation — but `encodeWord` must sanitize regardless (defense in depth is fine).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` § SUBJ — SUBJ-01/02/03 definitions (claim-key byte-identity, memberCanReadProject funnel, one tested builder)
- `.planning/ROADMAP.md` § Phase 40 — success criteria 1-4 (all four are test-pinned obligations)

### Implementation anchors (source of truth in code)
- `mailer.js` — `buildDigestMessage` (line ~525), `encodeWord` (line ~52), `escapeHtml` (line ~75), `formatAddress` (line ~69 — read-only this phase)
- `server.js` — digest loop in the reminder pass (lines ~1510-1585): claim insert, per-recipient task filter, `MAILER.sendDigest` call — the project-name resolution lands here
- `server.js` — `memberCanReadProject` (line ~719) / `hiddenFor` (line ~805): the single visibility funnel
- `src/locales/en.json` / `src/locales/fr.json` — `notif.digest.*` keys (~line 1687)
- `scripts/i18n-scan.mjs` — the scan that must stay green (server `notif.*` keys included)
- `test/digest.test.mjs` — existing digest tests that must pass unmodified (claim-key byte-identity)

No external ADRs/specs — requirements fully captured in decisions above and the roadmap phase details.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `encodeWord` (mailer.js:52): already RFC 2047 base64-encodes with 30-byte chunk folding — the hardening target, not a rewrite.
- `escapeHtml` (mailer.js:75): applied AFTER interpolation (T-36-01 rule) — task lines follow the same order.
- SC-5 pattern: `tFor` in a try/catch with English-literal fallback frame — extend, don't reinvent.
- `remindable`/SCOPE-04 filtering already ran per-recipient before `sendDigest` — project names resolved there are pre-cleared.

### Established Patterns
- One visibility pipeline (D-06): never add a digest-specific filter or a second name lookup path.
- Post-commit fire-and-forget sends; the mailer never touches the DB.
- escapeHtml/encodeWord applied AFTER interpolation; FR subjects carry accents → always through `encodeWord` (Pitfall 7).
- Ledger honesty (D-12): an empty digest sends nothing — subject changes don't affect that path.

### Integration Points
- `server.js` `MAILER.sendDigest({...})` call site: add `project` per task item.
- `mailer.js` `buildDigestMessage`: new subject key + task-line rendering + truncate helper.
- Locale JSON files: new `notif.digest.subjectWs` key pair.

</code_context>

<specifics>
## Specific Ideas

- Subject visual: bracket prefix `[Acme] Daily digest: 3 task(s)` — user picked it over em-dash and colon variants for inbox-scan clarity.
- Task-line em dash must match SUBJ-02's literal wording (`"Project Name — Task Name"`).
- Accept em-dash ambiguity inside names rather than inventing a rarer separator.

</specifics>

<deferred>
## Deferred Ideas

- From-header (`formatAddress`) CRLF hardening — deliberately excluded from Phase 40 (D-10); a workspace name with control chars still flows into the From header via the digest. Candidate for a hardening follow-up if ever raised.
- None otherwise — discussion stayed within phase scope.

</deferred>

---

*Phase: 40-Digest Subject & Task Lines*
*Context gathered: 2026-11-05*
