# Phase 36 — UI Review (Server Notification i18n)

**Audited:** 2026-11-04
**Baseline:** abstract 6-pillar standards (no UI-SPEC.md exists)
**Screenshots:** not captured (no dev server on :3000 or :5173 — code-only audit)
**Interaction captures:** off (workflow.ui_interaction_capture is false)
**Scope note:** This phase's UI surface is the localized inbox render (src/pages/inbox.js) and server-rendered email templates (mailer.js `buildNotifMessage`). Most visual surfaces are pre-existing; the phase's real UI risk is copy, fallback behavior, and row-shape consistency.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | All new copy keyed and FR typography-compliant; but fallback frame (mailer.js:436-444) and data-missing literals (`'Someone'`, `'a task'`, `'Projects Studio'`, mailer.js:407-409) are English-only — a FR recipient can receive English degradation text |
| 2. Visuals | 3/4 | Keyed reminder rows render as one all-muted span while structured reminder rows (inbox.js:69) keep the bold-title + muted-label hierarchy — same notification type, two different visual weights |
| 3. Color | 4/4 | No new colors introduced; accent confined to unread dot, semantic amber/red icons; email hex palette is the fixed pre-existing template |
| 4. Typography | 3/4 | Email body has a clean 16/14/13px hierarchy; inbox rows carry pre-existing inline px sizes (13/12.5/11.5) — no regression, no scale discipline added |
| 5. Spacing | 3/4 | Keyed branch adds zero new spacing (good); page remains the pre-existing inline-px + `var(--gutter)` hybrid |
| 6. Experience Design | 4/4 | Exemplary state coverage: unknown-key → snippet fallback (never blank/never raw key), tFor render try/catch → English degradation, locale clamping, client purity pins on key/vars |

**Overall: 20/24**

---

## Top 3 Priority Fixes

1. **Keyed vs structured reminder row hierarchy mismatch** — `notifText` (src/pages/inbox.js:61) renders keyed rows as a single `<span class="muted">` sentence, while the structured reminder branch (inbox.js:69) renders `<b>title</b> <span class="muted">label</span>`. A FR-viewer sees a muted-only row where an EN-viewer (or any pre-upgrade row) sees a bold title — inconsistent scannability for the same notification type. **Fix:** in the keyed branch, render the title with weight 600 inside or beside the sentence (e.g. bold the `{title}` substring via a vars-driven split, or keep the bold-title + muted-remainder split with the catalogue's remainder key).
2. **Keyed-row row/preview duplication** — for keyed rows, `inboxItem` renders the *same* localized sentence twice: once as the row text (inbox.js:88 via `notifText`) and again as the snippet preview (inbox.js:89, `t(n.key, n.vars)`). Every other row shape shows a *different* sentence + preview pair. **Fix:** render the stored `n.snippet` (English snapshot, `fmtComment(n.snippet)`) in the preview for keyed rows, or gate the preview to the complement (e.g. workspace/time context), so the preview adds information.
3. **English-only degradation copy in the email path** — the SC-5 catch frame (mailer.js:436-444) and the data-missing literals `'Someone'`/`'a task'`/`'Projects Studio'` (mailer.js:407-409) always produce English. A FR recipient with a render failure or missing actor/task data gets an English email body with a French greeting mismatch risk. **Fix:** render the fallback frame through `tFor(locale, 'notif.email.*fallback*')` keys (add ~6 keys to both catalogues), and key the actor/task/workspace placeholders.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- **Strong:** 23 notif.* keys, byte-identical EN↔FR sets, verified via parity script during audit. FR values follow the D-05 typography contract throughout: U+2019 apostrophes ("aujourd'hui", "l'attendiez"), U+00A0 before `:` ("Rappel : {title}", "Ouvrez la tâche :"), U+00A0-padded guillemets (« {title} »). EN body.sentence uses typographic quotes per the catalogue lint.
- **Unknown-key fallback copy is sound:** `has(n.key) ? t(n.key, n.vars) : n.snippet || ''` (inbox.js:60) — never blank, never the raw key string; pinned by tests per 36-03.
- **WARNING — English-only degradation copy:** mailer.js:436-444 catch frame ("Hi,", "Open the task:", "You receive this because…") and mailer.js:407-409 (`'Someone'`, `'a task'`, `'Projects Studio'`) are un-localized. For a FR recipient this yields mixed-language email on degraded paths. Documented as SC-5, but it is still user-visible copy.
- **Minor:** FR verb agreement embeds gender in the verb ("vous a assignée" assumes feminine task antecedent by composition) — pre-existing convention per 36-01 notes, but the email sentence `{actor} {verb} "{title}"` reads slightly awkwardly for the assign verb in both locales.

### Pillar 2: Visuals (3/4)
- **WARNING — hierarchy inconsistency between reminder row shapes:** keyed branch (inbox.js:59-62, one muted span, decision documented in 36-03 to avoid title duplication) vs structured reminder branch (inbox.js:68-69, bold title + muted label) vs legacy prose branch (inbox.js:50-52, bold title variants). Three shapes coexist for reminder-family rows; the keyed shape is the only one with no bold anchor, weakening scannability in a dense list. Legacy byte-identical rendering is a correct constraint (SC-3), so the fix belongs in the keyed branch only.
- **Pass:** icon semantics intact — keyed system-actor rows get the clock/amber icon (inbox.js:75-79), past_due gets triangle-alert/red; unread dot (6px accent) and per-type icons render for all shapes; icon-only buttons (`markAllRead`, `toggleRead`) all carry aria-label + data-tip (inbox.js:34, 92).
- **Email (mailer.js:460-476):** sentence is the focal point at 16px, snippet is a quoted blockquote with left rule, CTA is a solid dark button — clear hierarchy. `<html lang="${locale}">` correctly switches with recipient locale.

### Pillar 3: Color (4/4)
- Zero new color values in the phase diff. Client rows use tokens only (`var(--accent)`, `var(--amber)`, `var(--red)`, `var(--surface-2)`, `var(--text-3)`, `var(--divider)`).
- mailer.js email body uses hardcoded hex (`#f6f5f2`, `#26241f`, `#e7e3da`, `#6b665c`) but this is the fixed pre-existing email template (email clients can't resolve CSS variables) and is unchanged in palette by this phase — not flagged.
- Accent usage: unread dot only — well within the 10%-accent budget.

### Pillar 4: Typography (3/4)
- Email: 16px sentence / 14px snippet / 13px footer — consistent 1.55 line-height, weight 600 reserved for the CTA. Clean.
- Inbox rows: 13px body / 12.5px preview / 11.5px meta — the `.5px` steps are a pre-existing pattern, not introduced here; no change.
- One inconsistency carried into the keyed branch: the muted sentence renders at the same 13px as bold rows with no weight differentiation, compounding the Pillar 2 finding.

### Pillar 5: Spacing (3/4)
- The keyed branch and email i18n changes introduce **zero** new spacing values — pure content swap. Good discipline.
- Pre-existing pattern stands: inbox rows use inline px paddings (12px, 24px 28px, margins 2px/5px/10px) rather than the declared scale; unchanged and out of phase scope, noted for the record.

### Pillar 6: Experience Design (4/4)
- **Loading/error/empty:** email render is wrapped in one try/catch degrading to prior English literals (mailer.js:433-445) — fan-out can never die on a catalogue problem; `tFor` clamps unknown/NULL/malformed locales (`fr-FR` → EN) and degrades on `Intl.PluralRules` failure; empty preview guarded by `|| ''`.
- **Fallback correctness:** unknown client-supplied key falls back to stored snippet prose (never blank, never the raw key) — pinned statically and at runtime (client purity: caller key/vars never copied into rows).
- **Destructive/edge:** no destructive actions added; markAllRead/toggleRead unchanged; `inboxPreview` non-task branch falls back `n.text || t(...) || n.type` — never blank.
- **Residual minor:** `inboxPreview` (inbox.js:99) does not use the keyed branch — for a keyed row it reconstructs the label from `notif.dueReminder`-style keys instead of `t(n.key, n.vars)`, so the preview panel shows the generic label rather than the title-bearing sentence. Low impact (snippet still shows), but it's a second render path that Phase 37 should unify.

---

## Registry Safety
Not applicable — no `components.json` (shadcn not initialized); zero packages installed this phase (zero-dependency invariant held).

## Files Audited
- src/pages/inbox.js (notifText keyed branch, inboxItem preview gate, pageInbox)
- mailer.js (buildNotifMessage, lines 392-509 — frame render, fallback frame, text/HTML bodies)
- src/locales/en.json, src/locales/fr.json (notif.* namespace — 23 keys, parity verified)
- .planning/phases/36-server-notification-i18n/36-01…36-04-SUMMARY.md
