# Phase 41: Unsubscribe Tokens & List-Unsubscribe Headers - Pattern Map

**Mapped:** 2026-11-05
**Files analyzed:** 7 (5 modified, 1 likely new test file, 1 doc)
**Analogs found:** 7 / 7 (all in-repo, all git-tracked — verified via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (token helper + derivation, near keyring block ~L124-137) | utility (crypto) | transform | `server.js` L432-437 (`encryptTotpSecret` derivation) + L158-163 (`timingSafeHex`) | exact (same file, same key scope) |
| `server.js` (digest send site ~L1582-1592) | service call site | event-driven | `server.js` L1582-1592 itself — extend, don't rewrite | exact |
| `mailer.js` `buildDigestMessage` (headers array + footer frames) | service (renderer) | request-response | `mailer.js` L554-666 itself — extend only | exact |
| `mailer.js` (new exported token/URL helpers, per D-11) | utility | transform | `mailer.js` L52-112 (`encodeWord`/`truncate`/`escapeHtml` pure helpers) + L843-846 export block | exact (Phase 40 named-export pattern) |
| `src/locales/en.json` + `src/locales/fr.json` | config (i18n) | static | existing `notif.digest.*` blocks (en:1687-1691, fr:1687-1691) | exact |
| `test/unsubscribe-token.test.mjs` (new, Wave 0) | test | transform | `test/digest.test.mjs` header/harness (L1-40) — for integration part; pure unit style per Phase 40 | role-match |
| `test/digest.test.mjs` (extend) | test | event-driven | itself — new tests follow existing `trigger`/`waitFor`/decode helpers | exact |
| `DEPLOY.md` §14 (~L802+) | doc | static | itself — new subsection under "### Key generation & injection"-style structure | exact |

## Pattern Assignments

### `server.js` — key derivation helper (utility, transform)

**Analog:** `server.js` L114-137 (keyring boot block) + L432-437 (sha256-over-MASTER_KEY precedent)

The derivation precedent — NEVER raw MASTER_KEY, always a fresh sha256 digest per purpose (L432-437):

```js
function encryptTotpSecret(secretB32, version = 'v1') {
  if (!MASTER_KEY) return null;                 // fail-open-null when key absent — same shape for unsubscribe
  try {
    const digest = crypto.createHash('sha256').update(MASTER_KEY);
    const key = digest.digest();
    ...
```

Domain-separation precedent — `keyIdFor` (L124) is "first 8 hex of ONE sha256 call":

```js
const keyIdFor = material => crypto.createHash('sha256').update(material).digest('hex').slice(0, 8);
```

**Copy for Phase 41:** derive the unsubscribe HMAC key as `sha256(MASTER_KEY ‖ purpose-tag)` — chain two `.update()` calls on ONE createHash (matches both precedents). The `if (!MASTER_KEY) return null;` early-return shape (L433) is the model for "no key → no token → no headers".

### `server.js` — timing-safe compare precedent (utility)

**Analog:** `server.js` L157-163 (`timingSafeHex`) and L414 (length-guard form)

```js
/* Timing-safe compare over two fixed-length sha256 hex digests. */
function timingSafeHex(aHex, bHex) {
  const a = Buffer.from(String(aHex), 'hex');
  const b = Buffer.from(String(bHex), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

**Copy for Phase 41:** the length-guard-then-`timingSafeEqual` two-line form at L414 is what the token-freeze tests must pin (Phase 42 inherits it):
```js
return got.length === want.length && crypto.timingSafeEqual(got, want);
```

### `server.js` — digest send site (event-driven)

**Analog:** `server.js` L1581-1592 (verbatim current shape — only ADD fields)

```js
/* Post-commit fire-and-forget — NEVER inside the transaction. */
if (MAILER.enabled) {
  MAILER.sendDigest({
    to: r.email,
    locale: r.locale === 'fr' ? 'fr' : 'en',
    workspace: ws.name || 'Projects Studio',
    wsSlug: ws.slug,
    appUrl: APP_URL,
    dueToday: dueToday.map(t => ({ key: t.key, title: t.title || 'a task', project: projects.get(t?.project)?.name || '' })),
    overdue: overdue.map(t => ({ key: t.key, title: t.title || 'a task', project: projects.get(t?.project)?.name || '' })),
  }).catch(err => logWarn(`digest email → ${r.email}: ${err.message}`));
}
```

**Rules:** ADD `unsubscribeUrl` only — never reorder/remove existing fields (Pitfall 6: byte-identical claim key at L1576 `${ws.id}:${r.user_id}:digest:${localDate}` untouched, SC-5). Fire-and-forget `.catch(logWarn)` discipline stays.

**ID format (resolves Research Open Question 1 / A1):** `server.js` L394: `const uid = () => crypto.randomUUID();` — internal IDs are 36-char fixed-length UUIDs. Delimiter-free framing `0x01 ‖ wsId ‖ userId` IS unambiguous (fixed width). Pin that fixed width in the freeze tests; still note the alternative (length-prefix) is safe in both worlds if the planner prefers belt-and-braces.

### `mailer.js` — headers array in `buildDigestMessage` (service, request-response)

**Analog:** `mailer.js` L633-645 (current headers array — insert the two conditional headers after `Subject`)

```js
const boundary = `projects_${crypto.randomBytes(12).toString('hex')}`;
const headers = [
  `From: ${formatAddress(config.fromName || workspace, config.from)}`,
  `To: <${to}>`,
  ...(config.replyTo ? [`Reply-To: <${config.replyTo}>`] : []),
  `Subject: ${encodeWord(subject)}`,
  `Date: ${new Date().toUTCString()}`,
  ...
];
```

**Copy for Phase 41:** the conditional-spread idiom `...(cond ? [ ... ] : [])` is already used for `Reply-To` (L637) — reuse it for the two unsubscribe headers. Insert between `Subject:` (L638) and `Date:` (L639).

**Gate inputs already in scope:** `msg.appUrl` normalized at L561 (`const appUrl = text(msg.appUrl).replace(/\/+$/, '');`). The HTTPS gate reads the pre-built `msg.unsubscribeUrl` (mailer stays key-free — pure-renderer rule, comment block L546-553).

### `mailer.js` — footer frames (both text + HTML parts)

**Analog:** `mailer.js` L568-586 (frame via `tFor` + SC-5 fallback) and L602 (text join) / L625 (HTML footer paragraph)

Frame pattern (L568-585) — add the new localized key to BOTH frame objects:

```js
try {
  frame = {
    greeting: tFor(locale, 'notif.email.greeting'),
    ...
    footer: tFor(locale, 'notif.digest.footer'),
    // NEW: unsubscribe: tFor(locale, 'notif.digest.unsubscribe'),
  };
} catch {
  /* SC-5 boundary guard: any render failure degrades to English literals. */
  frame = { ..., footer: "You receive this because..." /* + English unsub literal */ };
}
```

Text part join (L602) — link goes INLINE after `footer`:

```js
const textBody = [greeting, '', ...section(dueLabel, dueToday), ...section(overdueLabel, overdue), '', footer].join('\r\n');
```

HTML footer paragraph (L625) — escapeHtml AFTER interpolation:

```html
<p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:#6b665c">${escapeHtml(footer)}</p>
```

**Copy:** the anchor-href discipline from the task lines (L608): `href="${escapeHtml(taskUrl(t))}"` — the unsubscribe settings link must be `escapeHtml`'d in the HTML part, plain in the text part.

### `mailer.js` — pure-helper export pattern (D-11)

**Analog:** `mailer.js` L843-846

```js
/* SUBJ-03 (Phase 40): exported for unit tests — the send API shape above is
   unchanged; buildDigestMessage joins them so the SC-5 digest fallback is
   unit-testable without a live SMTP round-trip. */
export { encodeWord, truncate, buildDigestMessage };
```

**Copy for Phase 41:** add `makeUnsubscribeToken` / `unsubscribeUrl` (key passed as argument — test-pinnable without touching MASTER_KEY scope) to this export line with a matching comment. Helper bodies follow the surrounding file style: `function name(...) {}` + phase-tagged block comment above (see `encodeWord` L52-57, `truncate` L103-106).

Reference pure-helper style (L52-57, 103-106): small, string-in/string-out, `text()` normalization first, zero side effects, JSDoc-style phase comment (`/* Phase 40 (SUBJ-03)... */` → use `/* Phase 41 (UNSUB-01)... */`).

### `src/locales/en.json` / `src/locales/fr.json` — i18n key

**Analog:** existing `notif.digest.*` block (en.json L1687-1691, fr.json L1687-1691):

```json
"notif.digest.subject": "Daily digest: {count} task(s)",
"notif.digest.subjectWs": "[{ws}] Daily digest: {count} task(s)",
"notif.digest.dueToday": "Due today",
"notif.digest.overdue": "Overdue",
"notif.digest.footer": "You receive this daily digest because of your notification settings. If you weren't expecting it, you can ignore this email.",
```

FR counterparts (fr.json L1687-1691) follow the same order with French punctuation (`: ` with NBSP style, curly apostrophes `'`). **Add `notif.digest.unsubscribe` directly after `notif.digest.footer` in BOTH files, same task.** `npm run i18n:scan` scans server keys too — uncatalogued string = red gate (Pitfall 5).

### `test/unsubscribe-token.test.mjs` (new) + `test/digest.test.mjs` (extend) — tests

**Analog (integration harness):** `test/digest.test.mjs` L1-40 header + L207-231 fixtures

Test style: `node:test` + `node:assert/strict`, phase-tagged file header comment, harness helpers, real server via `startServer` from `./helpers/server.mjs`:

```js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startServer, withDb, signup, client } from './helpers/server.mjs';
...
before(async () => {
  smtp = fakeSmtp();
  await smtp.listen();
  server = await startServer({
    dataDir: tempDir,
    env: {
      MASTER_KEY: 'projects-digest-key',
      REMINDER_TEST_TOKEN: TOKEN,
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp.port()),
      SMTP_REQUIRE_TLS: 'false',
      MAIL_FROM: 'noreply@test.local',
      APP_URL: 'http://app.test',   // ← current fixture is http → headers OMITTED; https variant needed for positive tests
    },
  });
});
```

**Copy:** the pure-unit token-freeze tests import the exported helpers directly from `mailer.js` (key passed as argument — no server boot needed, mirrors the Phase 40 named-export rationale in the L843-846 comment). Integration header tests reuse this exact fixture block with an https `APP_URL` variant; header-negative tests (missing URL, `http://` URL) reuse the existing fixture as-is — today's tests pass unmodified automatically (Research Pitfall 1 note).

### `DEPLOY.md` §14 — docs

**Analog:** DEPLOY.md L802-827 ("## 14. Key custody & rotation" + "### Key generation & injection")

Structure to copy: H3 subsections under §14, operator-facing second person ("you"), explicit commands in ```sh blocks, named env vars in backticks, honest failure semantics ("losing the key loses every 2FA secret"). **Add one H3 subsection covering:** (a) DKIM caveat — RFC 8058 §4: one-click is honored on DKIM-authenticated mail; signing stays at the instance's SMTP relay; (b) rotation semantics — rotating MASTER_KEY invalidates previously emailed unsubscribe tokens (no migration, no table). Per D-07: NO env knob, do not document one.

## Shared Patterns

### Mailer is a pure renderer (key-free)
**Source:** `mailer.js` L546-553 comment block + Phase 40 rule
**Apply to:** all mailer.js changes
> "The app base arrives as msg.appUrl — the mailer module itself has no APP_URL"
Same for MASTER_KEY: the token/URL must arrive pre-built in `msg` from server.js; the mailer only gates on URL shape (`msg.unsubscribeUrl` exists AND `startsWith('https://')`).

### Fail-open-honest degradation
**Source:** `server.js` L433 (`if (!MASTER_KEY) return null;`), `mailer.js` L576-585 (SC-5 English-literal fallback)
**Apply to:** token helper (no key → no URL) and mailer frames (missing key → English literal fallback line in the catch frame)

### Conditional-spread list building
**Source:** `mailer.js` L637 (`...(config.replyTo ? [...] : [])`)
**Apply to:** the two List-Unsubscribe headers in the headers array

### escapeHtml AFTER interpolation
**Source:** `mailer.js` L99-101 + L608, L625
**Apply to:** the HTML footer link (href and label)

### Fire-and-forget email with logWarn catch
**Source:** `server.js` L1581-1592
**Apply to:** the send site — existing pattern; do not change failure discipline when adding the URL field

### Phase-tagged comments on every change
**Source:** throughout (`/* Phase 40 (SUBJ-02)... */`, `/* D-14... */`)
**Apply to:** every modified block — use `Phase 41 (UNSUB-01/UNSUB-03)` + D-numbers (D-05, D-09, D-10, D-11)

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| *(none)* | — | — | All seven files map to strong in-file or sibling-file analogs. The token helper is new code but its two ingredients (sha256 derivation L432-437, timingSafeEqual L158-163) exist verbatim in-repo. |

## Metadata

**Analog search scope:** `mailer.js`, `server.js`, `test/digest.test.mjs`, `src/locales/en.json`, `src/locales/fr.json`, `DEPLOY.md`
**Files scanned:** 6 (all analogs git-tracked — verified `git ls-files`)
**Pattern extraction date:** 2026-11-05
