---
phase: 36-server-notification-i18n
reviewed: 2026-11-04T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/core/i18n.js
  - mailer.js
  - server.js
  - src/pages/inbox.js
  - scripts/i18n-scan.mjs
findings:
  critical: 1
  warning: 2
  info: 4
  total: 7
status: issues_found
---

# Phase 36: Code Review Report

**Reviewed:** 2026-11-04
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 36 lands `tFor()` (pure locale-parameterized lookup core), per-recipient localized notification emails (FR catalogue boot-registered in server.js, `msg.locale` threaded into `buildNotifMessage`), keyed reminder rows (`{key, vars}` snapshot + EN snippet dual store) with a localized inbox render, and a server-family/parity build gate in `i18n-scan.mjs`.

The core threat-register mitigations verify as implemented: HTML escaping happens AFTER `tFor` interpolation in both the mailer (`escapeHtml(sentence)` at mailer.js:467) and the inbox keyed branch (`esc(t(n.key, n.vars))` at inbox.js:61); the Subject header is newline-stripped via `text()` before `encodeWord` (header-injection safe); the unknown-locale clamp never throws (`tFor` clamps to base, mailer.js:406 double-clamps, server.js:1244 clamps to exact `'fr'`); the Intl plural failure path degrades to one/other (i18n.js:172-181).

However, the inbox hardening is incomplete: the adjacent **structured-branch render injects the raw, client-controlled key string into HTML unescaped** when the catalogue lookup fails — `t()` returns the key itself on miss, and that fragment is never passed through `esc()`. This is exactly the threat class ("client-supplied key treated as untrusted") the phase claims to have closed, one branch over from the hardened one.

## Critical Issues

### CR-01: Client-controlled `n.type` injected into HTML unescaped via t() key-fallback (XSS)

**File:** `src/pages/inbox.js:72-73`
**Issue:** The structured-branch fragment is rendered without escaping:

```js
const fragment = n.type === 'update' && n.status ? t('notif.update', { status: t(`task.status.${n.status}`) }) : t(`notif.${n.type}`);
return `${who} <span class="muted">${fragment}</span> ${tgt ? ... }`;
```

`t()` (via `tFor`, i18n.js:203-205) returns **the key itself** when the catalogue lookup misses. `n.type` is a client-controllable field: `mergeClientDoc`'s `mergeList` (server.js:1043) accepts client-supplied notif rows unmodified (only hidden-project filtering applies), so a workspace member can PUT a row with `n.type: '<img src=x onerror=...>'`. The lookup `notif.<payload>` misses, `t()` returns the raw string, and it lands in `innerHTML` unescaped — stored XSS against every member who opens the inbox (the doc is shared workspace-wide). The phase hardened the NEW `n.key`/`n.vars` path (both esc-wrapped) but left this adjacent untrusted flow open; it sits directly inside the phase's declared threat register ("client-supplied key/vars treated as untrusted in the inbox").
**Fix:** Escape the fragment (and the interpolated status), or return `''` on a failed lookup:

```js
const statusKey = t(`task.status.${n.status ?? ''}`);
const fragment = n.type === 'update' && n.status
  ? esc(t('notif.update', { status: esc(statusKey) }))
  : esc(t(`notif.${n.type}`));
```

Simpler and safer: validate `n.type` against a whitelist (`['mention','assign','comment','update','due_reminder','past_due']`) before composing the key, falling back to `esc(n.snippet || '')`.

## Warnings

### WR-01: `has(n.key)` gate accepts any catalogue key, not just the reminder namespace

**File:** `src/pages/inbox.js:59-62` (and `:89`)
**Issue:** The keyed branch trusts any client-supplied key that resolves anywhere in the EN/base catalogue. A tampered row with `n.key: 'nav.route.inbox'` (or any of the ~1674 keys) renders an unrelated catalogue sentence in another member's inbox list and preview. Escaped, so no injection — but the render is user-forgeable content, and the phase contract ("server-pass reminder rows carry a machine key") is not enforced at the only consumer.
**Fix:** Bound the gate to the phase namespace: `has(n.key) && String(n.key).startsWith('notif.reminder.') ? t(n.key, n.vars) : n.snippet || ''` — or check against an explicit key set `{dayBefore, morningOf, pastDue}`.

### WR-02: Non-reminder email Subject composed in code, outside the catalogue — FR subjects are English-shaped

**File:** `mailer.js:427` (`subject: ... : \`${actor} ${verb} ${taskTitle}\``)
**Issue:** Reminders got a catalogue subject (`notif.email.subject.reminder`), but mention/assign/comment/update subjects are still string-concatenated in the EN word order with FR catalogue verbs spliced in. A FR recipient gets e.g. `Jean vous a assignée Refactor auth` — the FR verb values ("vous a assignée", "a commentée") are feminine-agreed for « tâche » and read as ungrammatical when followed directly by a bare title with no « » quotes and no noun. The phase's goal ("per-recipient localized email sending") is only half-met for the subject line, and the i18n-scan gate cannot see the gap because the composed string is not a notif.* literal.
**Fix:** Add a catalogue subject key for the action family, e.g. `notif.email.subject.action`: EN `"{actor} {verb} {title}"` / FR `"{actor} {verb} « {title} »"`, and render it with `tFor(locale, 'notif.email.subject.action', { actor, verb, title: taskTitle })` in the non-reminder branch. (Related, same root: the reminder sentence uses actor `"Rappels"` with a singular-verb catalogue value — "Rappels vous a envoyé un rappel…" — consider a dedicated reminder sentence key.)

## Info

### IN-01: Fallback verb table in the SC-5 catch omits reminder kinds

**File:** `mailer.js:436`
**Issue:** The degrade-to-English table maps only mention/assign/comment; a reminder falling into the catch renders `Someone updated "title"` and ignores the reminder subject shape. Acceptable degradation, but the fallback for `due_reminder`/`past_due` could cheaply match the pre-36 behavior.
**Fix:** Add `due_reminder: 'sent you a reminder about', past_due: 'sent you a reminder about'` (or reuse the reminder literals) to the fallback map.

### IN-02: Hardcoded French fallback 'Un membre' in the localized email path

**File:** `server.js:1268`
**Issue:** Non-reminder actor fallback is the French literal `'Un membre'`, now embedded in an otherwise fully localized frame — an EN recipient can receive a FR byline fragment. Pre-existing and explicitly declared out of scope in the 36-02 summary, but it is now the last non-catalogue string in the email build path.
**Fix:** Route through a catalogue key (`notif.email.byMember`) or the EN literal, when scope allows.

### IN-03: i18n-scan gate blind spot — ternary keys check only the first branch

**File:** `scripts/i18n-scan.mjs:1208-1228`
**Issue:** `scanServerNotifKeys` takes the FIRST string at depth 0 of a t/tFor call. For `tFor(locale, cond ? 'notif.a' : 'notif.b')`, only `notif.a` is resolution-checked; `notif.b` is invisible to the gate. No such call site exists today, but the gate's contract ("every t/tFor notif.* literal in server.js/mailer.js") is narrower than documented.
**Fix:** Collect ALL depth-0 string literals in the call and check each, or explicitly document/emit on multi-string calls.

### IN-04: Second HTML-escape table in mailer.js can drift from the canonical one

**File:** `mailer.js:75-77` vs `src/core/i18n.js:138-140`
**Issue:** `escapeHtml` in mailer.js is a byte-identical copy of `escHtml` in i18n.js (which comments itself as "the one escaping table"). Two tables that must never diverge is exactly the pattern i18n.js:135-137 warns against. `escHtml` is a pure leaf export the server already imports (`tFor` from the same module).
**Fix:** `import { escHtml } from './src/core/i18n.js'` and delete the local copy. (Also noted: `scripts/i18n-scan.mjs:1412` — `categories[category || 0]` contains a dead `|| 0`; the expression is correct but confusing.)

---

_Reviewed: 2026-11-04_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
