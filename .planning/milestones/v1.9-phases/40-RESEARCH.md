# Phase 40: Digest Subject & Task Lines - Research

**Researched:** 2026-11-05
**Domain:** Mailer rendering (RFC 2047 subject encoding, SMTP header safety) + server-side project-name resolution inside the existing digest loop
**Confidence:** HIGH (all claims verified against in-repo source this session; no external packages involved)

## User Constraints (from CONTEXT.md)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Subject = bracket prefix `[Acme] Daily digest: 3 task(s)`.
- **D-02:** New i18n key `notif.digest.subjectWs` with `{ws}` and `{count}` params, EN+FR via `tFor`. Existing `notif.digest.subject` NOT deleted — it stays as the SC-5 English-literal try/catch fallback in `buildDigestMessage`.
- **D-03:** Key added to `src/locales/en.json` and `src/locales/fr.json`; `npm run i18n:scan` must stay green.
- **D-04:** Task line reads `Project Name — Task Name` (em dash). Text part plain; HTML part renders the whole string as ONE `<a>` link to the task (task URL unchanged).
- **D-05:** Project name resolved SERVER-side in the existing per-recipient task loop (after `memberCanReadProject`/SCOPE-04 checks) and passed to the mailer as `{key, title, project}`. Mailer stays a pure renderer — it never sees project IDs.
- **D-06:** No project name in the message ⇒ line silently degrades to task-title-only. No "Unknown project"/"Private project" placeholder (a marker confirms existence = leak).
- **D-07:** Separator is plain `"—"`. Em dash inside a project name creates accepted cosmetic ambiguity — no escaping, no alternative separator.
- **D-08:** Harden shared `encodeWord` (mailer.js:52) — strip CR, LF and C0 control chars BEFORE the encode decision. One tested builder for all four Subject call sites (digest, notification, security alert, invitation).
- **D-09:** Hostile-name unit tests pin: CRLF injection (`name\r\nBcc: …`), emoji, FR accents, 200+ char names — exactly one well-formed Subject header, no mojibake, no second header line.
- **D-10:** Out of scope: `formatAddress` hardening. Subject path only.
- **D-11:** Workspace name capped at 64 chars in the Subject.
- **D-12:** Project and task names in task lines capped independently (~80 chars, shared cap) before joining.
- **D-13:** Truncation is a mailer-side `truncate(name, cap)` helper at render time; server keeps passing full names.
- **D-14:** Truncated names get a single `…` (U+2026) appended.

### the agent's Discretion
- Exact task-line cap value (~80) if tests show a better number.
- Where `truncate` lives in mailer.js (near `escapeHtml`/`encodeWord` is natural).
- Exact FR wording of `notif.digest.subjectWs` following existing catalogue style.
- Whether the workspace-name strip happens at the call site or inside `tFor` interpolation — but `encodeWord` must sanitize regardless (defense in depth).

### Deferred Ideas (OUT OF SCOPE)
- From-header (`formatAddress`) CRLF hardening — a workspace name with control chars still flows into From via the digest; hardening follow-up candidate only.
- Nothing else — no migrations, no new endpoints, no From changes, no claim-key changes.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUBJ-01 | One digest per workspace, workspace name in subject; claim key byte-identical | Claim key is `${ws.id}:${r.user_id}:digest:${localDate}` at server.js:1576 — this phase must not touch the claim/transaction block (lines 1572-1579). Existing `digest.test.mjs` subjects match `/Daily digest/` so a `[WS] ` prefix keeps them green unmodified. |
| SUBJ-02 | Task line "Project Name — Task Name", degrades without leak via the single visibility funnel | Server loop already runs SCOPE-04 + `memberCanReadProject` per (recipient, task) at server.js:1561-1562; project name resolution lands exactly there; mailer renders `project ? \`${project} — ${title}\` : title`. |
| SUBJ-03 | CRLF-stripped, RFC 2047-encoded, one tested builder | `encodeWord` (mailer.js:52-66) is the single funnel; harden it (D-08), add hostile-name tests; all four Subject call sites go through it. |
</phase_requirements>

## Summary

This phase is a mailer-side change with one server-side addition. Everything anchors in three files: `mailer.js` (`encodeWord` hardening, new `truncate` helper, `buildDigestMessage` subject key + task-line rendering), `server.js` (project-name resolution inside the existing digest loop at the point where visibility is already proven), and the two locale JSON files (one new `notif.digest.*` key pair). No migrations, no endpoints, no new packages — the "zero runtime dependencies" invariant is trivially preserved.

The claim key `${ws.id}:${r.user_id}:digest:${localDate}` [VERIFIED: server.js:1576] lives in the transaction block at server.js:1572-1579; the phase must not touch that block, which is the entire SUBJ-01 no-double-send guarantee. The existing test decoder (`test/digest.test.mjs:160-168`) decodes RFC 2047 words and existing assertions match `/Daily digest/` [VERIFIED: test/digest.test.mjs:248,408,434,521] — a `[WS] ` bracket prefix therefore keeps the whole existing digest suite green unmodified.

**Primary recommendation:** Harden `encodeWord` first (Task 1, with hostile-name tests), then the server-side `{key, title, project}` mapping, then the mailer render + locale keys, keeping the claim block untouched.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Workspace-name subject rendering (`[WS] …`) | Mailer (server-rendered email) | — | Mailer is the pure renderer (D-05); server passes `ws.name` already |
| Project-name resolution per recipient | API/Backend (server.js digest loop) | — | Visibility funnel (`memberCanReadProject` + SCOPE-04) only exists server-side |
| RFC 2047 encoding + CRLF stripping | Mailer (`encodeWord`) | — | Single tested builder for all four Subject call sites (D-08) |
| Name truncation (64/80 caps) | Mailer (`truncate` helper) | — | Presentation concern (D-13); server passes full names |
| EN+FR catalogue for `subjectWs` | Locale JSON + i18n-scan gate | — | `notif.*` family bounded + EN↔FR parity gate in scripts/i18n-scan.mjs |

## Standard Stack

No external packages — zero-runtime-dependency project. Everything is Node stdlib (`Buffer`, `crypto`, `node:test`).

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Node `node --test` | node v24.21.0 [VERIFIED: `node --version`] | Hostile-name unit tests + full suite | Existing runner (`npm test` = `node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json]) |
| `Buffer.byteLength` | stdlib | UTF-8 byte-safe chunking in `encodeWord` | Already in use [VERIFIED: mailer.js:58] |
| `scripts/i18n-scan.mjs` | in-repo | Catalogue + `notif.*` EN↔FR parity gate | Established gate [VERIFIED: scripts/i18n-scan.mjs:1230,1238-1250,1503-1519] |

**Version verification:** N/A — no packages installed this phase. Package Legitimacy Audit: none needed (no installs).

## Architecture Patterns

### System Architecture Diagram

```
reminder pass (server.js, per-workspace, hour >= 9)
        │
        ├─ claim insert-or-ignore `${ws.id}:${user_id}:digest:${localDate}`   ← UNTOUCHED (SUBJ-01)
        │
        ├─ per-recipient task loop
        │     assignee gate → remindable → SCOPE-04 (inScopeProject + projectScope)
        │     → memberCanReadProject                       ← single visibility funnel
        │     │
        │     └─ push {key, title, project: projects.get(t.project)?.name}    ← NEW (SUBJ-02)
        │
        └─ post-commit fire-and-forget
              MAILER.sendDigest({to, locale, workspace, wsSlug, appUrl,
                                 dueToday, overdue})                  ← +project per item
                    │
                    └─ buildDigestMessage
                          ├─ tFor 'notif.digest.subjectWs' {ws, count}  ← NEW subject (D-01/D-02)
                          ├─ truncate(ws, 64) / truncate(name, ~80)     ← NEW helper (D-11..14)
                          ├─ task line: project ? `${project} — ${title}` : title
                          └─ Subject: encodeWord(subject)               ← HARDENED (D-08, SUBJ-03)
```

### Recommended Change Structure

```
mailer.js
├── encodeWord (line ~52)      # HARDEN: strip C0+DEL before encode decision
├── escapeHtml (line ~75)      # unchanged, reused
├── truncate  (new, near ~75)  # cap + single '…' suffix
└── buildDigestMessage (~525)  # subjectWs key, task-line join, caps
server.js
└── digest loop (~1583-1590)   # add project to mapped items ONLY; claim block 1572-1579 untouched
src/locales/{en,fr}.json
└── notif.digest.subjectWs (~line 1687 block)
test/
└── new hostile-name + task-line tests (digest.test.mjs or new subject-encode test file)
```

### Pattern 1: encodeWord hardening (SUBJ-03 core)

Current code [VERIFIED: mailer.js:32-66, verbatim]:

```js
function text(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function encodeWord(value) {
  const input = text(value);
  if (!/[^\x20-\x7E]/.test(input)) return input;
  // … 30-byte chunk base64, joined with ' '
  return chunks.map(chunk => `=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`).join(' ');
}
```

Key facts for the hardening task:
- `text()` already removes CR/LF, so a CRLF-in-name attack cannot currently break the Subject line — but D-08 requires stripping ALL C0 (`\x00-\x1F`) and DEL (`\x7F`) BEFORE the encode decision, so e.g. a tab-containing ASCII name stays clean ASCII (no encoding) and no control char ever survives either path.
- The encode decision is `/[^\x20-\x7E]/` — pure printable-ASCII input returns unencoded; anything else is base64-encoded. This already prevents mojibake for FR accents.
- **Pitfall discovered:** the chunks are joined with `' '` on a SINGLE header line. A 200-emoji-char name (800 UTF-8 bytes) produces ~27 encoded-words ≈ 1300 chars on one Subject line — over the RFC 5322 998-octet line limit. [ASSUMED: some relays reject/mangle over-long header lines.] If the hostile-name 200+ test exposes this, join encoded-words with `'\r\n '` (RFC 2047 §6.2 legal folding) instead of `' '` — BUT check the test decoder first: `test/digest.test.mjs:164-166` joins encoded words with `''` after regex-matching each word, and `raw.match(/^Subject: (.*)$/m)` won't span folded lines, so folding changes what `decode()` returns. Existing digest tests must pass unmodified — verify the decoder regex still matches before adopting folding, or keep single-line joining and accept the long line if `dotStuff`/SMTP path tolerates it (the socket write path joins headers with `\r\n` directly [VERIFIED: mailer.js:592-609]).

### Pattern 2: server-side project resolution (SUBJ-02)

The task loop already has everything needed [VERIFIED: server.js:1545-1568]:

```js
const project = projects.get(t?.project);
if (!remindable(t, project)) continue;
// … inScopeProject / memberCanReadProject checks (lines 1561-1562) …
if (localDate === t.due) dueToday.push(t);
```

The change is purely at the send mapping [VERIFIED: server.js:1589-1590]:

```js
dueToday: dueToday.map(t => ({ key: t.key, title: t.title || 'a task' })),
```

becomes (shape only — implementer writes exact code):

```js
dueToday: dueToday.map(t => ({
  key: t.key,
  title: t.title || 'a task',
  project: projects.get(t?.project)?.name || '',
})),
```

Because the SCOPE-04 + `memberCanReadProject` checks at lines 1561-1562 already ran for THIS recipient before the task is pushed, a name reaching the mailer is pre-cleared — the mailer can never leak (D-05). `project` falsy ⇒ line degrades to title-only (D-06). Note: an invisible project never reaches this point at all, so the `|| ''` is defense for "project row absent from the doc snapshot", not a second visibility path.

`memberCanReadProject` signature [VERIFIED: server.js:719-727]: `(p, wsId, memberId, liveTeams = null)` — the loop calls it with the assignee's membership id; do NOT re-resolve names through any other path.

### Pattern 3: task-line rendering (D-04/D-07/D-13)

Text part: `- Project — Task\r\n  <url>` (fits the existing `section()` shape at mailer.js:559).
HTML part: ONE `<a>` per line, escape AFTER interpolation (T-36-01 rule, same as current line 566):

```js
const label = t.project ? `${t.project} — ${t.title}` : t.title;  // after truncate caps
`<li><a href="${escapeHtml(taskUrl(t))}">${escapeHtml(label)}</a></li>`
```

Em dash joins the TRUNCATED names (D-12 caps apply independently to project and task before joining).

### Pattern 4: subject through tFor (D-01/D-02/D-03)

- Existing fallback frame keeps `notif.digest.subject` as the English literal [VERIFIED: mailer.js:542-555].
- New: inside the try frame, `subject: \`[${truncate(wsName, 64)}] ${tFor(locale, 'notif.digest.subjectWs', { ws: truncate(wsName, 64), count })}\`` — or put the bracket in the catalogue value; either satisfies D-01/D-02 (discretion). The `{ws}` param inside the catalogue keeps FR word order free.
- Catalogue additions at the `notif.digest.*` block (~line 1687 both files):
  - EN: `"notif.digest.subjectWs": "[{ws}] Daily digest: {count} task(s)"` (style per existing key)
  - FR: `"notif.digest.subjectWs": "[{ws}] Résumé quotidien : {count} tâche(s)"` (exact FR wording is agent's discretion)
- i18n-scan gates: the notif.* family is bounded to literal `notif.*` call sites [VERIFIED: scripts/i18n-scan.mjs:1230] and EN↔FR key sets must be identical both directions [VERIFIED: scripts/i18n-scan.mjs:1238-1250,1519] — a key present in both JSONs with a literal `tFor(locale, 'notif.digest.subjectWs', …)` call keeps the gate green.

### Anti-Patterns to Avoid
- **Resolving project names in the mailer:** mailer never sees project IDs (D-05); a second lookup path is the CR-01-class leak vector.
- **"Private project"/"Unknown project" placeholders:** confirm-existence leak (D-06).
- **Truncating server-side:** truncation is presentation (D-13).
- **Touching the claim block or `formatAddress`:** SUBJ-01 byte-identity and D-10 scope freeze.
- **Applying `escapeHtml` to the text part:** text/plain is not HTML; escape only the HTML part, after interpolation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RFC 2047 encoding | A new subject encoder | Existing `encodeWord` (mailer.js:52) | Already chunk-safe, UTF-8, byte-length aware; only needs the C0 strip |
| Header-line safety | Per-call-site sanitizing | Harden `encodeWord` once | Four Subject call sites share it (D-08: one tested builder) |
| HTML escaping | Manual entity maps | Existing `escapeHtml` (mailer.js:75) | Established T-36-01 ordering |
| SMTP integration tests | A mock SMTP client | Existing harness in `test/digest.test.mjs` (raw-socket server + `decode()` helper, lines ~120-176) | Reuse the exact decoder so byte-identity is provable |
| i18n parity | Manual checks | `npm run i18n:scan` | The gate is already wired |

**Key insight:** every primitive needed already exists in mailer.js — this phase is a hardening + a render change, not infrastructure.

## Common Pitfalls

### Pitfall 1: Encoded-word folding vs the test decoder
**What goes wrong:** joining 200+-char hostile names' encoded words with `'\r\n '` makes `decode()` (test/digest.test.mjs:165 `^Subject: (.*)$` with `m` flag) capture only the first folded segment, so existing/decoded assertions may misreport.
**Why:** `(.*)$` does not span the folded continuation line.
**How to avoid:** run the existing digest suite after any `encodeWord` join change; if folding is adopted, adjust only NEW hostile tests' expectations, never existing ones — and verify the existing decoder still yields the expected strings. If folding breaks the decoder, single-line joining (current behavior) is acceptable; SMTP DATA path tolerates long lines via the raw socket write.
**Warning signs:** a hostile-name test that decodes to a truncated subject.

### Pitfall 2: Over-long Subject line (998-octet RFC 5322 limit)
**What goes wrong:** 200 emoji chars ⇒ ~800 bytes ⇒ ~1100+ base64 chars on one line; some relays refuse or split the line mid-encoded-word (mojibake). [ASSUMED — relay behavior not verifiable locally]
**How to avoid:** D-09's 200+ char test must assert the full name decodes intact end-to-end; decide folding vs not based on that test (see Pitfall 1).

### Pitfall 3: Tab / DEL surviving the ASCII fast path
**What goes wrong:** stripping only `\r\n` leaves `\t`, `\x0B`, `\x7F` etc.; a "pure ASCII" name containing them still triggers the encode path (they're outside `\x20-\x7E`) — safe-ish, but D-08 mandates the strip happens BEFORE the encode decision so an ASCII name with a tab renders unencoded and clean.
**How to avoid:** one regex strip of `[\x00-\x1F\x7F]` applied before the `/[^\x20-\x7E]/` test. Note this makes the encode decision see post-sanitized input — that ordering IS the spec (D-08).

### Pitfall 4: `text()`'s `.trim()` changing names
**What goes wrong:** `encodeWord` routes through `text()`, which trims and collapses CR/LF runs to a space — names with leading/trailing spaces or internal newlines silently normalize. This is existing, accepted behavior; do not "fix" it this phase (D-08 scope is the strip, not redefining `text`).
**Warning signs:** a hostile test asserting exact preservation of interior newlines.

### Pitfall 5: Forgetting `project` on BOTH arrays
**What goes wrong:** adding `project` to `dueToday` but not `overdue` (or vice versa) at server.js:1589-1590 — overdue lines silently degrade everywhere.
**How to avoid:** one mapping helper for both arrays; test asserts a task in EACH section.

### Pitfall 6: i18n-scan family strictness
**What goes wrong:** key added to en.json but not fr.json (or FR wording changed to drop the `{ws}`/`{count}` params inconsistently) — scan fails at the parity gate or the param check.
**How to avoid:** add both keys in one task; run `npm run i18n:scan` in the task's verification.

### Pitfall 7: Workspace name fallback in the subject
**What goes wrong:** `workspace: ws.name || 'Projects Studio'` [VERIFIED: server.js:1586] means the fallback name flows into the subject; a truly empty ws.name yields the literal "Projects Studio" — acceptable and pre-existing; just don't add a second fallback inside the mailer (D-06 analog: no invented placeholder).

## Runtime State Inventory

Not a rename/refactor/migration phase, but the no-double-send guarantee is runtime state — explicitly checked:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `reminders_sent` claim key `${ws.id}:${r.user_id}:digest:${localDate}` [VERIFIED: server.js:1576] | None — key stays byte-identical; claim block untouched |
| Live service config | None — SMTP config read at boot, unchanged | None |
| OS-registered state | None | None |
| Secrets/env vars | None touched | None |
| Build artifacts | None | None |

## Code Examples

### Hostile-name test skeleton (D-09)

```js
// test/subject-encode.test.mjs (new file) or inside an existing hardening test
import { encodeWord } from '../mailer.js'; // if not exported, test through buildDigestMessage payloads

assert.ok(!encodeWord('name\r\nBcc: victim@x').includes('\r\nBcc'), 'no CRLF injection');
const w = encodeWord('Résumé');                 // FR accent → base64 words
assert.ok(w.startsWith('=?UTF-8?B?'), 'FR accents encoded');
const hostile = encodeWord('A'.repeat(200) + '😀'.repeat(200));
assert.ok(!/[\x00-\x1F]/.test(hostile), 'no C0 survives');
// exactly one Subject header through the full builder:
// count occurrences of /^Subject: /m in the raw SMTP payload === 1
```

Note: `encodeWord` is currently module-private [VERIFIED: mailer.js:52 — not exported]. Either export it for unit tests (preferred; the file already exports builder functions via its send API — check the module's export shape at mailer.js:816-848) or test through `buildDigestMessage` payloads captured by the test SMTP harness. Exporting for tests is the lower-friction option but confirm it doesn't expand the public surface in an unexpected way.

### Truncate helper (D-11..D-14)

```js
function truncate(name, cap) {
  const s = text(name); // reuse the same CRLF-stripping text() for consistency
  return s.length > cap ? s.slice(0, cap) + '…' : s;
}
```

Byte-length vs char-length: `slice` is char-based; an emoji-heavy 64-char name is longer in bytes but the Subject is RFC 2047-encoded so char caps are the right UX measure. `…` appended only when truncation occurred (D-14).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No workspace context in subject | `[WS]` bracket prefix via `subjectWs` key | This phase | Two same-morning digests distinguishable |
| Task title only | `Project — Task` single-link line | This phase | Instant parent-project scan |
| `encodeWord` strips CR/LF via `text()` only | Explicit C0+DEL strip before encode decision | This phase | SUBJ-03 pinned by tests |

**Deprecated/outdated:** nothing removed — `notif.digest.subject` key deliberately retained as fallback (D-02).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Some SMTP relays refuse/mangle Subject lines > 998 octets | Pitfall 2 | 200+-char emoji-name test may pass locally but trip a relay in production; mitigation is folding (Pitfall 1) — decide from the test run |
| A2 | Exporting `encodeWord` for unit tests is acceptable surface growth | Code Examples | Minor style/convention friction; alternative is testing through builder payloads |
| A3 | `projects` map values carry a `name` field usable directly | Pattern 2 | Trivial; verify with one grep during implementation (map built from doc snapshot earlier in the pass) |

## Open Questions

1. **Encoded-word folding vs single-line join for hostile names**
   - What we know: current join is single-line `' '`; folding is RFC 2047-legal but the existing test decoder only reads the first Subject line segment.
   - What's unclear: whether any target relay actually enforces 998 octets.
   - Recommendation: implement single-line join first; run the 200+ char hostile test end-to-end through the builder; only add folding if line length is genuinely problematic, and re-verify the existing digest suite (byte-identity rule) either way.

2. **Bracket in the key vs at the call site**
   - What we know: D-01/D-02 allow either; catalogue `{ws}` param keeps FR free.
   - Recommendation: put `[` `]` inside the catalogue values (`"[{ws}] …"`) so the FR translator owns the whole visual, and truncate `ws` once before passing.

## Environment Availability

No external dependencies. Node v24.21.0 [VERIFIED: `node --version`]; `npm run i18n:scan` wired [VERIFIED: package.json]. No probe failures.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` (Node built-in), concurrency 2 |
| Config file | none — glob `test/*.test.mjs` via package.json script |
| Quick run command | `node --test test/digest.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUBJ-01 | Two workspaces ⇒ two digests, each subject names its ws; claim key unchanged; existing tests pass unmodified | integration (existing suite must stay green) + new two-ws assertion | `node --test test/digest.test.mjs` | ✅ exists; new case ❌ Wave 0 |
| SUBJ-02 | Task line `Project — Task` in text + one `<a>` in HTML; degrade on absent project | integration (SMTP harness payloads, text+html decode) | `node --test test/digest.test.mjs` | ❌ Wave 0 |
| SUBJ-03 | CRLF/emoji/accents/200+ hostile names ⇒ one well-formed Subject, no mojibake | unit (`encodeWord`) + integration (raw payload single `^Subject:` match) | `node --test test/subject-encode.test.mjs` (or named host) | ❌ Wave 0 |
| SC-4 | `npm run i18n:scan` green with `notif.digest.subjectWs` EN+FR | gate | `npm run i18n:scan` | ✅ gate exists |
| SC-5 | English-literal fallback still renders when catalogue render throws | unit/integration | included in digest suite | ❌ Wave 0 (small) |

### Sampling Rate
- **Per task commit:** `node --test test/digest.test.mjs` (+ the new hostile test file)
- **Per wave merge:** `npm test` (full suite; includes `i18n-scan.test.mjs`)
- **Phase gate:** full suite green + `npm run i18n:scan` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/subject-encode.test.mjs` (or equivalent) — hostile-name unit tests for SUBJ-03 (D-09 pins CRLF, emoji, FR accents, 200+ chars)
- [ ] Two-workspace subject test + `Project — Task` line tests (text & HTML) — SUBJ-01/02
- [ ] Whether `encodeWord` needs exporting for unit tests — decide at Wave 0 (A2)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | **yes (core)** | User-controlled ws/project/task names sanitized in `encodeWord` (C0 strip) before header emission; `escapeHtml` after interpolation for HTML part |
| V4 Access Control | **yes (core)** | Project names only via the existing `memberCanReadProject` + SCOPE-04 funnel (server.js:1561-1562); mailer renders pre-cleared names only (D-05/D-06); no existence markers |
| V6 Cryptography | no | No crypto changes this phase |
| V2/V3 Auth/Session | no | No route or session surface touched |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SMTP header injection via `\r\n` in user names (Subject spoofing, injected `Bcc:`) | Tampering | D-08: strip `[\x00-\x1F\x7F]` in `encodeWord` before encode decision; hostile tests pin `name\r\nBcc: …` |
| Information disclosure — private project name leak to recipient | Information Disclosure | Single visibility funnel; silent degrade to title-only; no placeholders (D-06); test asserts an invisible project's name never appears in text or HTML part |
| HTML injection in digest body via task/project names | Tampering | `escapeHtml` after interpolation (existing T-36-01 rule, mailer.js:566 pattern) |
| Mojibake in FR subjects | (quality/security-adjacent) | RFC 2047 base64 path for non-ASCII (existing `encodeWord` behavior) — pinned by accent test |

## Sources

### Primary (HIGH confidence)
- In-repo `mailer.js` lines 32-99, 513-619 (`text`, `encodeWord`, `formatAddress`, `escapeHtml`, `buildDigestMessage`) — read this session
- In-repo `server.js` lines 710-732 (`memberCanReadProject`), 1495-1601 (reminder pass, digest loop, claim block) — read this session
- In-repo `test/digest.test.mjs` lines 140-179 (SMTP harness, `decode()`), subject assertions 248-521 — read this session
- In-repo `src/locales/{en,fr}.json` `notif.digest.*` blocks (~1687) — verified via grep
- In-repo `scripts/i18n-scan.mjs` notif-family + parity gates — verified via grep
- `package.json` test/i18n scripts; `node --version` = v24.21.0 — verified via shell

### Secondary (MEDIUM confidence)
- RFC 2047 §6.2 / RFC 5322 line-length limits — training knowledge applied to the folding question [ASSUMED where marked A1]

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; all anchors read in source
- Architecture: HIGH — change points pinned to exact line ranges verified this session
- Pitfalls: MEDIUM-HIGH — folding/998-octet question is genuinely open (A1), all others source-verified

**Research date:** 2026-11-05
**Valid until:** 2026-12-05 (stable — in-repo change, no external surface)
