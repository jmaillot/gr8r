# Feature Research

**Domain:** Notification email features for a self-hosted PM app — per-workspace digest emails + RFC 8058 one-click unsubscribe
**Researched:** 2026-11-05
**Confidence:** HIGH (RFC 8058 primary text verified; Gmail/Yahoo sender requirements cross-checked across multiple 2024–2026 sources)

## Scope Note

Existing: opt-in daily digest at 09:00 workspace time (due-today + overdue, deep links, exactly-once ledger claim, reminder-email suppression for digest users), per-recipient locale via `tFor` (EN/FR), plain `mailto:` List-Unsubscribe proposed in docs/notification-audit.md. This research covers ONLY the two new features: SUBJ (workspace-named subject, one digest per workspace) and UNSUB (RFC 8058 one-click).

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Workspace name in digest subject | A user in 3 workspaces gets 3 emails at 09:00; identical subjects ("Your daily digest") are indistinguishable and train the user to ignore them. Gmail also groups threads by subject — same subject collides into one thread. | LOW | Subject already localized via `tFor`; add `{workspace}` interpolation. The digest send loop already iterates per (workspace, user) pair — the subject just needs the workspace name passed in. |
| "Project — Task" task lines | In a workspace with many projects, a bare task name is ambiguous ("Update docs" in which project?). Every mainstream PM (Linear, Asana, Jira, GitHub) prefixes the parent context in notification lines. | LOW | The digest builder already resolves project per task for deep links; concatenation only. Watch the separator choice: `—` (em dash) matches the app's FR house style; escape both names with the existing `esc()`-equivalent for HTML. |
| HTTPS unsubscribe URL in List-Unsubscribe | RFC 2369/8058: the HTTPS URI is what MUAs and receivers act on; mailto-only is the legacy path Gmail/Yahoo no longer credit as one-click. | LOW | Already proposed in docs/notification-audit.md; becomes real when the POST endpoint exists. |
| Unsubscribe takes effect immediately | Gmail/Yahoo require honoring one-click requests "within two days"; in practice users expect the next digest to stop. Since digests are daily and gated by a pref read at send time, clearing the pref satisfies this trivially. | LOW | No ledger change needed — the send claim happens at send time, and the pref is read in the same pass. |
| Unsubscribe must work while logged out | The POST comes from Gmail's infrastructure, not the user's browser. No session, no cookies (RFC 8058 §3.1: "MUST NOT include cookies, HTTP authorization, or any other context information"). | LOW | Token in URL path; anonymous route outside the session middleware. Mirrors the existing logged-out file navigation pattern (?next= handling) but simpler — no redirect at all (see anti-pattern below). |
| List-Id header identifying the digest | RFC 2919. Lets Gmail/Outlook show "Digest — Workspace Name" as a list identity, groups mail, and lets users filter. GitLab does exactly this per project (List-Id = project path). | LOW | Static per workspace: `List-Id: <digest.<slug>.projects-studio>` (angle-bracketed, dots not spaces). New header on digest sends only. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| RFC 8058 full one-click POST endpoint | Gmail/Yahoo bulk-sender compliant (≥5k msgs/day rule, but the header pair is cheap insurance and Gmail already surfaces the "Unsubscribe" button when headers are present). Inbox-native unsubscribe button with no confirmation page. | MEDIUM | The real work: a new anonymous `POST /unsubscribe/:token` route, token model, DKIM consideration (see Pitfalls), and idempotent pref clear. No framework — hand-rolled route on `server.js`, consistent with the zero-dependency constraint. |
| Hard-to-forge opaque token per (workspace, user) | RFC 8058 §3.1/§6: the URI SHOULD carry an opaque identifier the server validates — deters forged-unsubscribe spam attacks against your users. | LOW | Single HMAC-signed value (workspaceId + userId + purpose tag) via the existing `node:crypto` keyring (MASTER_KEY) — no new table needed, tokens can be stateless and long-lived. Alternative: random token stored in a small table; stateless HMAC is more in keeping with the codebase. |
| Re-subscribe is a settings toggle, not a re-confirmation flow | Unsubscribe only flips the `email_digest` pref; the user turns it back on in notification settings. No "are you sure" page, no preference center. Matches self-hosted app norms. | LOW | Pref rows already exist per (workspace, user) from Phase 34. |
| Token tied to scope, not global | Unsubscribing from the digest for one workspace must not kill reminders in others. Token carries workspaceId so the POST clears exactly one pref. | LOW | Free with the HMAC payload design. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Confirmation/landing page after one-click POST | Habit from manual unsubscribe flows | RFC 8058 explicitly requires the POST to complete without user interaction; Gmail's junk-report-driven unsubscribe has no browser to show a page. Also: "the mail sender MUST NOT return an HTTPS redirect" — redirected POSTs break. | Return a bare `200` (optionally a minimal text/HTML body for the rare human GET); do the confirmation in the user-visible notification settings page instead. |
| One combined digest email across all workspaces | Fewer emails | Mixes workspaces in one message: can't name the workspace in the subject, can't offer per-workspace unsubscribe granularity (one-click unsubscribes the whole email, all workspaces), and breaks the List-Id identity. Industry norm (Linear, GitHub, GitLab) is per-workspace/per-project digests. | One email per workspace — already the milestone decision; this research confirms it's the standard. |
| Global "unsubscribe from everything" token | Simpler endpoint | One-click POST has no way to ask the user what they meant (RFC 8058: "one-click has no way to ask the user what address or from what list"); a global kill switch from a junk report is destructive and surprising. | Scope the token to the digest pref of one workspace. Other notification types keep their existing per-type prefs. |
| DKIM signing built from scratch | RFC 8058 §4 says messages MUST have DKIM covering the two headers | Hand-rolling DKIM is a milestone-sized job (canonicalization, key management, per-domain selector DNS) — and self-hosted instances send through user SMTP relays that commonly already DKIM-sign. Phase 39 already deferred this to "a DKIM milestone". | Ship the header pair + POST endpoint now (fully functional for compliant receivers that don't enforce the DKIM clause); document the DKIM caveat in DEPLOY.md. Revisit only if a provider enforces it. |
| Auto-resubscribe guard / re-opt-in emails | Fear of accidental unsubs | The token is HMAC-signed and scoped; accidental POSTs from anti-spam crawlers are exactly what List-Unsubscribe-Post exists to disambiguate (receivers only POST with user consent per §3.2). | Accept the unsub; the user re-enables in settings. |
| Unsubscribing from OTHER notification types via the same endpoint | Endpoint reuse | Mention/assign/comment emails are conversational — Gmail best practice and the Phase 39 audit treat them as transactional, not bulk; adding one-click there invites accidental mass-unsubscribes. | Endpoint is digest-only (`purpose` tag in the HMAC payload). |

## Expected Behavior — RFC 8058 Compliant Flow (verified against the RFC text)

1. **Headers on every digest email:**
   ```
   List-Unsubscribe: <https://app.example.com/unsubscribe/<opaque-token>>
   List-Unsubscribe-Post: List-Unsubscribe=One-Click
   List-Id: <digest.<ws-slug>.<app-host>>
   ```
   The List-Unsubscribe header MAY also keep the existing `mailto:` URI (RFC 8058 §3.1 allows mixed URIs; keep HTTPS first).
2. **Token contents:** opaque, hard-to-forge, self-contained — identifies workspace + user + purpose. No plaintext recipient address needed (though it's usually already in `To:`). HMAC over `(workspaceId, userId, "digest-unsub")` under MASTER_KEY is sufficient; stateless means no migration and no token table.
3. **Receiver behavior (Gmail):** shows an "Unsubscribe" button next to the sender; on click (or on junk report for compliant senders), POSTs to the URI with body `List-Unsubscribe=One-Click`, Content-Type `application/x-www-form-urlencoded` (or `multipart/form-data`). The request is anonymous: no cookies, no auth, no referrer context.
4. **Server behavior on POST:** parse the body pair (tolerantly — but don't require it beyond sanity), validate the HMAC token, clear `email_digest` in `notif_prefs` for that (workspace_id, user_id), return **200 with no redirect**. Must be idempotent (unsubscribing twice is a 200, not a 404/409) and no-oracle (invalid token → generic 404, consistent with the codebase's 404-matrix convention).
5. **Body parsing tolerance:** accept both `application/x-www-form-urlencoded` and `multipart/form-data` (RFC §3.2); the urlencoded path is a trivial parser — `raw-body` handling already exists from Phase 12.
6. **Effect:** next 09:00 digest pass for that workspace skips this user (pref read at send time — no scheduler change). Individual reminder emails were already suppressed for digest users; they do NOT come back (that suppression is keyed off the same pref, which now reads false — verify: Phase 38 ties suppression to `email_digest`; if the pref is off, reminders should resume per the REM logic — this is the *correct* behavior and must be stated in UAT expectations: unsubscribe from digest = reminders return, because reminders are the default channel).
7. **Re-subscribe:** flip the toggle in notification settings; next day's digest resumes. No email confirmation either direction.

## Expected Behavior — Multi-Workspace Digest Split

- **Norm: one email per workspace.** Each workspace is a tenant with its own slug, name, and membership; its digest is scoped to its own tasks and carries its own List-Id and unsubscribe token. Consequences that fall out naturally:
  - Subject: `[<Workspace Name>] <localized digest subject>` or `"<Workspace Name> — <digest subject>"` — pick one, localize via a new `tFor` key with `{workspace}` slot.
  - Per-workspace opt-out: user can digest off workspace B but keep A.
  - N workspaces ⇒ up to N emails at 09:00; this is accepted industry behavior (GitHub sends per-org notification digests; GitLab per-project List-Ids).
- **The existing send loop already iterates (workspace, user)** — the change is surface-level: subject interpolation, per-workspace List-Id/token headers, project-qualified task lines. No scheduler or ledger restructure.
- **Empty digest = no email** (already the case) — important when a user is in several workspaces; they don't get N "nothing today" emails.

## Feature Dependencies

```
[SUBJ: workspace-named subject + Project—Task lines]
    └──requires──> existing digest send loop (Phase 38) + tFor catalogue (Phase 36)
                   └── both shipped; no new deps

[UNSUB: RFC 8058 one-click]
    └──requires──> anonymous POST route on server.js (pattern exists: file route, SSO no-oracle routes)
    └──requires──> HMAC token via MASTER_KEY keyring (v2 envelopes, Phase 25) — no migration
    └──requires──> notif_prefs accessor (Phase 34)
    └──enhances──> List-Unsubscribe header pair on digest sends (replaces/augments the mailto-only proposal)
    └──conflicts──> nothing; but DKIM signing is explicitly OUT (deferred, see Anti-Features)
```

### Dependency Notes

- **UNSUB requires no migration** if tokens are stateless HMAC — aligned with the "migrations additive-only" standing constraint (a migration of zero rows is still a clean pass, but avoiding one entirely is better).
- **SUBJ and UNSUB are independent** — can ship as separate phases or one phase; UNSUB is the larger surface (new route, tests, security review of the anonymous endpoint).
- **UNSUB's token should use a purpose tag** so a digest-unsub token can never be replayed against a future unsubscribe surface.

## MVP Definition

### Launch With (v1)

- [ ] Workspace name in digest subject (localized, one digest email per workspace) — the user-visible fix for backlog 999.1
- [ ] "Project — Task" task lines in digest body — same defect class
- [ ] List-Unsubscribe HTTPS header + List-Unsubscribe-Post on digest emails
- [ ] Anonymous POST /unsubscribe/:token endpoint (HMAC token, idempotent, no redirect, 200 on success, 404 no-oracle on bad token)
- [ ] List-Id header per workspace
- [ ] EN+FR catalogue keys for the new subject line; i18n-scan green

### Add After Validation (v1.x)

- [ ] Unsubscribe confirmation copy in Settings (show digest state after flip) — nice, not required
- [ ] DEPLOY.md section documenting the one-click endpoint, token scheme, and the DKIM caveat for instance operators

### Future Consideration (v2+)

- [ ] DKIM signing when self-hosted SMTP doesn't already sign — milestone-sized, only if a provider enforces it
- [ ] One-click unsubscribe for other notification types — needs its own audit ruling (D-05)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Workspace name in subject | HIGH | LOW | P1 |
| Project—Task lines | HIGH | LOW | P1 |
| Header pair (HTTPS URL + Post) | HIGH | LOW | P1 |
| POST endpoint + HMAC token | HIGH | MEDIUM | P1 |
| List-Id header | MEDIUM | LOW | P1 |
| DKIM signing | LOW (for self-hosted) | HIGH | P3 |

## Competitor Feature Analysis

| Feature | Linear | GitLab | GitHub | Our Approach |
|---------|--------|--------|--------|--------------|
| Digest scoping | Per-user, workspace-mixed inbox but per-workspace emails for batched notifications | Per-project List-Id headers on every notification email | Per-org/per-repo email streams | Per-workspace email with workspace List-Id |
| List-Unsubscribe | Yes (HTTPS, one-click) | Yes (mailto + HTTPS) | Yes | HTTPS one-click + retained mailto |
| Subject context | Project prefix in notification subjects | `[GitLab] Project` convention | `[Org/Repo]` subject prefix | `{Workspace} — {digest}` localized |
| Unsubscribe granularity | Per notification type in settings | Per level (global/project/participating) in settings | Per type/channel in settings | Per workspace, digest-only POST endpoint |

## Sources

- RFC 8058 (rfc-editor.org/rfc/rfc8058.txt) — primary text, read in full: header syntax (§5), sender requirements incl. no-redirect and no-cookies (§3.1), receiver POST semantics (§3.2), DKIM requirement (§4), opaque-token security guidance (§6). **HIGH**
- RFC 2919 List-Id (via dmarceye.com, Nodemailer docs, GitLab docs) — usage convention `<list.id.domain>`, GitLab precedent of per-project List-Id. **MEDIUM–HIGH**
- Gmail/Yahoo bulk sender requirements (support.google.com/mail/answer/14229414; dmarc.com, mailerbit.com 2026 checklists) — one-click required for bulk senders, honored within two days, since Feb 2024. **HIGH** (multi-source corroborated; not directly applicable below 5k msgs/day but headers are cheap)
- RFC 2369 (referenced within RFC 8058) — legacy List-Unsubscribe semantics, mailto URIs remain valid. **HIGH**

---
*Feature research for: per-workspace digest + RFC 8058 one-click unsubscribe, Projects Studio*
*Researched: 2026-11-05*
