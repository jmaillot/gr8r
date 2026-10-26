# Pitfalls Research

**Domain:** Adding TOTP 2FA, QR provisioning, session revocation and password-change-with-revocation to Gr8r Studio's hand-rolled, zero-dependency auth (`server.js`, Node 24 built-ins, `node:sqlite`, opaque cookies, scrypt passwords)
**Researched:** 2026-10-26
**Confidence:** HIGH (grounded in RFC 6238/4226, the otpauth URI spec, and a direct read of the existing session/scrypt/throttle machinery in `server.js`)

## Critical Pitfalls

### Pitfall 1: Time-step drift — code rejected at ±30s boundary

**What goes wrong:** A TOTP check that computes exactly one expected step and compares it to the user's code fails ~15% of the time in practice: the code flips mid-submission, the phone's clock is 20 seconds off, or there is network latency. Users outside a ±1-step window conclude "2FA is broken" and disable it.

**Why it happens:** Developers implement the minimum-correct version of RFC 6238 (HMAC-SHA1 over a counter) instead of the practical version (RFC 6238 §5.2 explicitly allows the server to accept a window of previous/time-ahead values).

**How to avoid:** Compute a window of steps — standard is +1/−1 immediately (30–90 s of tolerance each way); many implementations use −2 for older phone clocks. Derive the candidate counter as `Math.floor((Date.now()/1000 − 0) / 30)` locally (no NTP dependency) and loop `counter`, `counter−1`, `counter+1` (optionally `−2`). Node has **no built-in TOTP** — you must hand-roll it with `node:crypto` (`crypto.createHmac('sha1', secretBuf).update(Buffer.from([(ctr>>>24)&255,(ctr>>>16)&255,(ctr>>>8)&255,ctr&255]))`, then dynamic truncation per RFC 4226 §5.3: take low 4 bits of the last byte as offset, extract 4 bytes, mask the top bit, mod 10⁶). Zero runtime deps is fine here: TOTP is ~30 lines, is safely hand-rolled, and `crypto.createHmac` is exact.

**Warning signs:** Support tickets "code didn't work"; you tested with the same machine's clock so it always passed locally; the QR cut-off at a second boundary fails but retrying works.

**Phase to address:** Phase 14+ (TOTP implementation) — the design decision "window of ±1 step minimum, document the chosen skew" goes in the plan, not the code comment.

---

### Pitfall 2: Replay — the same code accepted twice within the window

**What goes wrong:** With a ±1 window, a 6-digit code remains valid for up to ~90 s. If the server just verifies it, an attacker who observes one successful verification (shoulder-surf, phish, logs) can replay it. Worse with a ×2 drift window.

**Why it happens:** Enforcing single-use requires server state — the "last used counter" — and it's the part most tutorials omit.

**How to avoid:** Store the last successfully verified timestep counter per user (a `totp_last_step` column or in the 2FA table). Reject any code whose matched counter is **≤** `totp_last_step`. Since the matched counter can only move forward if you use a window, check `matchCounter > lastStep` before accepting. No clock restore edge case breaks this: after a big clock jump, current counter is larger, which is still acceptable.

**Warning signs:** Unit test that verifies the same code twice succeeds; `totp_last_step` absent from the schema.

**Phase to address:** Phase 14+ — must be in the same migration as the 2FA columns (adding it later = second migration = risk to the byte-identical no-op guarantee).

---

### Pitfall 3: Non-constant-time comparison of the code

**What goes wrong:** `code === expected` (string or number comparison) leaks timing information across the 10⁶ code space. The existing `verifyPassword` uses scrypt's built-in compare on the result — the *TOTP* code check is the weak link, since HMAC is far faster to grind and a per-IP throttle (existing `tooMany`) is your only other guard. This is defence-in-depth, not an exploit you can realistically pull off over HTTP with a 30-s code — but it is the single most-cited TOTP flaw in reviews.

**Why it happens:** JavaScript's `===` is the natural expression.

**How to avoid:** Convert both codes to fixed-length `Buffer`s and compare with `crypto.timingSafeEqual(buf1, buf2)` (throws on length mismatch — coerce first, e.g. reject a code that isn't exactly 6 chars *before* calling). Apply the same pattern to the recovery-code check and to the totp-replay counter.

**Warning signs:** Grep finds `===` against `answer`/`code` in the 2FA paths; no `timingSafeEqual` import.

**Phase to address:** Phase 14+ — one-line fix, belongs in the implementation checklist as a verification criterion.

---

### Pitfall 4: Storing the TOTP secret plaintext

**What goes wrong:** `totp_secret` sitting in cleartext in `users` or the workspace document. Anyone with DB read (backup leak, SQLite file disclosure, a SQL-injection elsewhere, the `/data/gr8r.db` Docker volume) gets a permanent second factor that can generate valid codes offline forever.

**Why it happens:** No zero-dep crypto layer in the project yet, and "encrypt at rest" sounds like a feature-limit.

**How to avoid:** Generate the secret as 20 random bytes (`crypto.randomBytes(20)` → 160 bits, the HOTP spec minimum) and store it **encrypted** with a server-side key from an environment variable (`MASTER_KEY`), using `crypto.createCipheriv('aes-256-gcm', key, randomIv)` — GCM auth tag included and verified at decrypt. Base32-encode only the URI/QR representation. Do NOT derive the key from a password you also store. If `MASTER_KEY` is unset, refuse to enable 2FA (with a clear DEPLOY.md note), rather than silently falling back to plaintext.

**Warning signs:** Migration writes a `totp_secret` column with no cipher step; `grep -c "totp_secret"` finds a raw `insert … values` without `encrypt()`.

**Phase to address:** Phase 14+; the key-availability decision (fail closed) is a Phase 13 investigation output.

---

### Pitfall 5: Base32 padding / charset edge cases in the hand-rolled encoder

**What goes wrong:** Hand-rolling base32 for the secret in the otpauth URI commonly produces (a) no padding when Google Authenticator tolerates it but some apps (older Aegis, some web OTP parsers) don't; (b) wrong `_`/`0` or `O`/`0` confusions if you typo the RFC 4648 alphabet (`ABCDEFGHIJKLMNOPQRSTUVWXYZ234567` — digits last, no 0/1/8/9); (c) off-by-one on 5-bit-to-8-bit grouping for secrets whose bit length isn't a multiple of 40, especially when encrypting-then-encoding random bytes instead of encoding the raw 20-byte secret.

**Why it happens:** It's a 10-line function with a spec, cut-and-tested only with the happy 20-byte/32-char case.

**How to avoid:** (1) Generate the secret as exactly 20 bytes so the base32 is exactly 32 chars, no padding ambiguity; (2) keep the RFC 4648 alphabet as a named constant and unit-test it against a known vector; (3) encode the **plaintext secret** (before encryption) in the URI only, decrypt on the fly when regenerating; (4) when decoding back from base32 for verification, `buf.length === 20` check. Also: uppercase only, strip whitespace the user might paste with a space.

**Warning signs:** Test only with 20 random bytes; the encoder is inline in a 2FA handler rather than a tested function.

**Phase to address:** Phase 14+; add a known-vector unit test to the same `node:test` suite.

---

### Pitfall 6: Clock issues — loosen the "current time" assumption after restore or restart of the server image

**What goes wrong:** Two flavours. (a) The **server** clock drifting (container on a host drifted NTP, or a restored snapshot with an old clock) silently makes the window linear in drift, so you end up widening the window to "fix" it. (b) The migration/init code assumes "now" is safe to embed in a column (e.g. writing `totp_last_step` only at enable time using server-now and comparing that to a future step) — this breaks on restore of an older snapshot. Also: `Docker` lacking TZ doesn't matter for TOTP (epoch is TZ-independent) — but a hand-rolled `date()` instead of `Date.now()`/`now()` helper in the new code is the usual culprit.

**Why it happens:** Auto-scope creep: "while we're at it let's also store lastLogin via totp step".

**How to avoid:** Use a **single `now()` helper** everywhere new — the codebase already has one; do not introduce `Date.now()` inline in 2FA code paths. Never store a *step* derived from local server "now" as the initial `totp_last_step`; on enable (the only moment you have a candidate code from the phone), set it to the matched counter itself, not server-now-derived.

**Warning signs:** `grep Date.now` and `Date.prototype.getUTC` in new 2FA code paths; snapshot-restore smoke test.

**Phase to address:** Phase 14+.

---

### Pitfall 7: otpauth URI params — Google Authenticator / Authy accepting a broken QR silently, or refusing the real one

**What goes wrong:** The URI wrong in one of: label path not `URL-encoded` issuer with `:` (correct form: `otpauth://totp/Gr8r%3A<user-email>%3Fissuer%3DGr8r` — the exact label format is `<issuer>:<accountName>` with the `:` itself %-encoded if it's a reserved char inside the label, plus **a separate** `issuer=` param); issuer containing `&`/`=`/`:` that is never percent-encoded; `algorithm=SHA1` omitted (must be present — Authy defaults to SHA1 but flags absence as a config mismatch); `digits=6` and `period=30` omitted — Google defaults to SHA1/6/30 but **Authy and some others refuse or warn** on their absence; `secret=` re-encoded as lowercase base32 — some parsers are case-sensitive even though the spec is case-insensitive; using `+` for sp/slash escapes in the query string instead of `%20` (the query is NOT application/x-www-form-urlencoded). Also: `secret` prefixed with `data:image` garbage or extra whitespace.

**Why it happens:** There is no single canonical otpauth doc — the spec lives in a random GitHub wiki (google-authenticator wiki "KeyUriFormat") that people approximate from tutorials.

**How to avoid:** Build the URI with `new URL('otpauth://totp/' + encodeURIComponent(`${ISSUER}:${email}`))` then set `searchParams` for `secret` (base32, uppercase), `issuer`, `algorithm=SHA1`, `digits=6`, `period=30`. Test with a *fixture vector* — generate the URI for a known 20-byte secret and run the OTP once from that secret in a unit test, so the URI secret → space and the code-generation have one shared source of truth.

**Warning signs:** `grep otpauth` in the code, count params < 5; hand-written template string with raw `${issuer}` interpolation (issuer has no escaping); the milestone's existing "illegible fake QR" — that's the current waist-time to fix in the real thing.

**Phase to address:** Phase 14+; add the "QR param completeness" as a verification criterion in the PLAN.

---

### Pitfall 8: Scan-time vs enable-time mismatch — confirming the code, not the "next code"

**What goes wrong:** The setup flow lets the user scan the QR, then "enable" with the *current* code. If the app is time-aligned this works, but users often scan and type with a 10-second gap, or their phone clock is one step behind — and now the enable fails at exactly the moment a user decides 2FA is flaky and never retries. Conversely: if you do NOT require a code at enable, you can enable 2FA the user never scanned, locking them out at next login.

**Why it happens:** The "confirm with a code" step feels redundant with the QR and gets dropped, or the wrong code (current vs next) is required.

**How to avoid:** Two-step enable: (1) generate secret, show QR, store it encrypted with a `totp_pending` column (or a status flag) — do NOT set `tfa_enabled = true`; (2) require the user to submit a code that verifies *within your ±1 window* (this inherently proves scan succeeded + clock okay). On success, flip to enabled, set `totp_last_step` to the matched counter, and immediately show recovery codes. On step 2 failure, keep pending for retry but re-show the same secret (do not regenerate — it forces another scan cycle). Add a "regenerate secret" action for the actual stale case.

**Warning signs:** Only one endpoint (`/api/auth/2fa/enable`) with no confirm step; e2e test that never tests the 10-s-delay case.

**Phase to address:** Phase 14+ — it's a UX shape decision, should be explicit in the PLAN's UI flow.

---

### Pitfall 9: Revoking your OWN current session by accident

**What goes wrong:** "Disconnect other sessions" — the milestone's headline button — is trivially implemented wrong: `delete from sessions where user_id = ?` (matches the existing `--set-password` CLI at server.js:2160) removes the caller's own session too, instantaneously signing themselves out. Then the Settings page can't load (401s from `requireUser`), and the user thinks they've been kicked out of their own account.

**Why it happens:** The one-liner deletes by user; distinguishing "all" from "all but me" requires the current `token_hash`, which lives in the cookie, not the user row.

**How to avoid:** Fetch the current token from the cookie (`parseCookies(req.headers.cookie)[COOKIE]`), `sha256` it, and delete with `where user_id = ? and token_hash != ?`. Return the remaining session count. Note: the CLI `--set-password` path *correctly* deletes all (including the current — nothing is, or needs to be, logged in there); reuse intent deliberately, not by copy-paste.

**Warning signs:** Feature-flag test "after disconnect-all I am still signed in" — missing from the plan; test only checks other sessions gone.

**Phase to address:** Phase 14+ (implementation); Phase 13 investigation must enumerate which endpoint mutates which session set.

---

### Pitfall 10: Revocation not enforced because a token is checked only on writes / a cached identity survives the DELETE

**What goes wrong:** Auth check is per-request already here — `currentUser()` is called by every `requireUser`/`requireWorkspace`, hitting the DB via the `sessions` join. So the classic "revocation lag" (in-memory session cache, JWT-like opaque-but-cachable identity) is NOT a risk today. The risk arrives when the 2FA/password-change features introduce a **cache**: e.g., if password-change revokes by deleting rows while some handler keeps a stale `user` object from before the delete, the crate-of-the-request can still write one more mutation; or if the settings page client keeps its own `me` state and only refreshes after a full reload, the user *sees* a session still listed that was actually revoked.

**Why it happens:** In a single-file server with shared state, it is tempting to memoize `currentUser(req)` per request or read a cached user row; a "me" patch that doesn't re-read the DB in the same handler path leaves the stale identity usable for the remainder of that request.

**How to avoid:** Keep the invariant "identity is re-derived from the DB on every request" — do not introduce any request-level or module-level memoization of `currentUser`. After password-change revocation, re-derive within the response (the pattern `PATCH /api/auth/me` already does: it re-selects the fresh row). For "disconnect other sessions": return the *live* remaining list after delete, not the pre-delete list.

**Warning signs:** `grep currentUser` shows a `.get` result held across a mutation boundary in a handler; a new `const cache = new Map()` near auth code.

**Phase to address:** Phase 13 investigation (establish the invariant) and Phase 14+ implementation (a test: revoke, then issue a request in the same tick — expect 401).

---

### Pitfall 11: Remember-me vs all sessions — the milestone's "other sessions" conflates device lifetime tiers

**What goes wrong:** Today every session has the same `SESSION_DAYS` expiry; there is no remember-me. When 2FA and revocation ship, product pressure creates an implicit two-tier ("this browser: 30 days" vs "other devices: until logout") — and a naive revocation ("other sessions") then cannot distinguish "the box I'm typing in now" from "the box I want to forget." Worse: a cookie-only "remember me" that lives client-side with no server row means revocation in the table leaves the remembered-cookie path still authenticated.

**Why it happens:** Every auth hand-roller reinvents remember-me once; when adding revocation you discover the tiers too late.

**How to avoid:** For v1.3, deliberately keep one tier (single `SESSION_DAYS`) and document it; revocation = delete row, cookie is opaque + DB-backed so it dies with the row (this is an existing strength, keep it). Do NOT add remember-me in the same milestone — it needs a separate session-kind column and more tests. If it bleeds in, revoke by `token_hash != <current>` which is correct under a single tier and document that remember-me is out of scope.

**Warning signs:** Plan mentions "remember me" without a schema column; test fixtures with two different `maxAge` values.

**Phase to address:** Explicitly out-of-scope decision to record at Phase 13/planning time; risk of quiet scope-creep is the pitfall itself.

---

### Pitfall 12: Password change — updating the scrypt hash but not invalidating in-memory session identity / not revoking other sessions

**What goes wrong:** Two-part classic. (a) The handler updates `users.password_hash` but the request's own `user` object (already fetched by `requireUser`) is a copy — any *other* session for that user keeps working because revocation is skipped. The milestone explicitly demands the revocation, so forgetting it or forgetting to exclude the current session (Pitfall 9 variant) both fail UAT. (b) A subtler version: the handler revokes other sessions but the *current* session's identity was loaded from `users` **before** the hash update and any downstream code in the same handler re-verifies the password against the stale row object → confusing success with stale data, or a false "re-auth required" UX.

**Why it happens:** The milestone's current `--set-password` CLI path does `delete from sessions where user_id = ?` and is the obvious precedent — but that path has no live request context, so the "all but me" subtlety hides.

**How to avoid:** The password-change endpoint should: verify old password (constant-time compare against the stored hash — scryptSync already does this), update the hash **and** delete `sessions where user_id = ? and token_hash != <current>` **in the same transaction** (no gap where an attacker who knows the password can re-login mid-change), then refresh the user row returned in the response. Note scrypt is slow (~100ms at N=16384) — the same handler must not call it twice per request; reuse the verify result.

**Warning signs:** Test that changes password and only checks the new login works; no test that a second, pre-existing cookie is now 401.

**Phase to address:** Phase 14+; the two assertions (new password works at login; second session dead) belong in the plan's verification criteria verbatim (the milestone already states them).

---

### Pitfall 13: "Token derived from the password" — apparently-common hand-rolled auth advance that Gr8r does not have, and must not accidentally acquire

**What goes wrong:** Some hand-rolled systems make session tokens deterministic derivations of the password hash (`hmac(password, salt)`), so a password change "automatically" revokes sessions — which sounds nice but breaks password *verification attempts* (the same user typing the same password on two boxes gets different tokens), prevents you from revoking one session without rotating the user's password, and leaks password-material into cookies.

**Why it happens:** In Gr8r, this is not the bug — sessions are already random opaque tokens (`crypto.randomBytes(32)` hashed to `token_hash`), which is the right design. The pitfall is *acquiring* it while refactoring: a dev "simplifying" token issuance to derive from user data, or reusing the scrypt key material for both password verify AND token HMAC.

**How to avoid:** Lock in the invariant in a Phase 13 write-up: **session tokens are pure random entropy, sessions are the revocation source of truth, password change revokes sessions by row-deletion — never by token derivation.** If you ever feel the need to "derive" a token, that's the smell.

**Warning signs:** Any new code reaching into `password_hash` from a token-issuing path.

**Phase to address:** Phase 13 (write the invariant down); Phase 14+ (review checklist).

---

### Pitfall 14: Old password policy leak

**What goes wrong:** The change-password endpoint accepts a weaker password than signup enforces (`>=10 chars + symbol/number`, signup path at server.js:1296), or accepts a password that leaks **the old** password's strength bands — so an account whose password is strong can be *changed down* to a trivial one. Conversely: enforcing the *new* policy against the *old* password's history buckets stores a policy that grows stale if you ever raise the minimum length — old accounts become grandfathered below the new minimum with no migration notice.

**Why it happens:** Signup and change-password reuse different validation code paths — literally two places to keep in sync.

**How to avoid:** Extract one `validatePasswordStrength(pw)` helper used by signup AND change-password from day one of this milestone. Do NOT add password history or "no reuse of last N" in v1.3 — that requires storing old hashes (a GDPR/HMAC consideration) and grows scope; explicitly defer it.

**Warning signs:** Grep shows the password regex present twice (once in signup, once unattached); no `passwordStrength` error code in the change-password handler.

**Phase to address:** Phase 14+; verification: change-password to `password1` → 400 with a localised code (note: new error codes feed the v1.2 i18n catalogue — see Integration Gotchas).

---

### Pitfall 15: The 2FA challenge becomes an authentication bypass when the session is "partial"

**What goes wrong:** The dangerous one. If the login flow, once `tfa_enabled`, issues a **session cookie** (or a "signed-in-looking" 200 with an `ok: true` user payload) *before* the TOTP code is verified, the second factor is decorative: any API that calls `requireUser` treats the attacker as signed in, and a leaked/stolen password is now sufficient. Related variant: the client-side gate (show the pin screen because the response says `pending2fa`) but the server has already minted a cookie — the attacker just calls other endpoints directly.

**Why it happens:** Session cookie + "pending state" fight: it's easier to reuse the existing session mechanism for the pre-2FA state than to introduce a challenge-state cookie.

**How to avoid:** Two clean options — choose ONE in the plan:
- **(A) Pending session row.** Insert a `sessions` row with a new `pending_tfa = 1` column; `currentUser()`/`requireUser` treat pending sessions as anonymous (return null → 401) except for the dedicated `/api/auth/2fa/verify` and `/api/auth/logout` endpoints, which check and promote the row on success (flip `pending_tfa = 0`). Revocation and expiry work uniformly since it's still a sessions row.
- **(B) Separate challenge token.** Short-lived random challenge token in a *different* cookie (or same cookie table with a `kind` column), never treated as identity.
Option A fits the existing schema best. Whatever is chosen, the invariant is absolute: **no endpoint outside the 2FA-verify path may see a `pending_tfa=1` session as a signed-in user.** Beware the file route (`/w/:slug/file/:id`) and invite-accept (`/api/…` with session fallback at server.js:1676) — both are session-consuming endpoints that must also respect the pending gate.

**Warning signs:** Any code path that returns an identity for a pending session; approval-gate test "POST /api/workspaces with a pending-tfa session → 401" missing from the plan; cookie `Max-Age` set on the pre-verify response (pending sessions should be short-lived — e.g. 5 min — not `SESSION_DAYS`).

**Phase to address:** Phase 13 investigation must produce this decision; Phase 14+ implements with a test per affected endpoint family.

---

### Pitfall 16: Recovery codes stored plaintext

**What goes wrong:** Printing ten 10-char recovery codes and storing them in a JSON column cleartext. Same threat model as Pitfall 4, but recovery codes are *longer-lived* and provide full account access without a device.

**Why it happens:** They must be *shown* to the user at enable-time in plaintext (that's the UX), which feels like license to store them plaintext too.

**How to avoid:** Hash each code independently at generation time (`sha256` per code is enough — recovery codes are high-entropy, no KDF needed, unlike passwords), store the hash list (+ a `used_at` column), compare with `timingSafeEqual`. If you store them encrypted-at-rest instead (reusing Pitfall 4's AES-GCM machinery), you get "can display remaining codes again" as a feature — a defensible choice, but it leaks them with the DB read; the hash approach cannot display, which is the honest default. Show the full list exactly once at enable.

**Warning signs:** Column `recovery_codes` containing `,`-separated readable strings; no per-code `used_at`.

**Phase to address:** Phase 14+; verified by a test that greps the DB row after enable and finds no plaintext.

---

### Pitfall 17: Recovery code not single-use (or single-use only by row-deletion, losing audit)

**What goes wrong:** A recovery code works repeatedly until it's noticed; or single-use is enforced by deleting the used code's row, which destroys the ability to know it was used and (worse) races two concurrent attempts into both succeeding.

**Why it happens:** Deletion is the simplest enforcement; SQLite makes the conditional-update competitor to delete easy to miss.

**How to avoid:** Mark rather than delete: `update recovery_codes set used_at = ? where user_id = ? and code_hash = ? and used_at is null` and check `changes` — `changes === 1` wins, `0` means already used (or invalid — same error message to avoid an oracle). Cache the "remaining codes: N" count to drive the "X codes left, generate more" nag in the UI. Auditability bonus: the activity log can now record "recovery code used, 2FA bypassed".

**Warning signs:** Recovery code works on the second login; no `used_at`; no "codes remaining" UI guarantee.

**Phase to address:** Phase 14+.

---

### Pitfall 18: Brute-force on the 6-digit code or the recovery code at the login challenge — the existing throttle is the *right* mechanism but the wrong key and constant

**What goes wrong:** The 2FA challenge is a sweet spot for brute force: 10⁶ possibilities, and the existing in-memory throttle keys on `${ip}|${email}` with `max = 10` per 15 min (server.js:1163) — that was sized for password guessing, not for a 6-digit space where an attacker with many IPs and a 90-s window wants to burn 10⁶/2 tries. Variants: (a) not throttling the 2FA endpoint at all (it's a "second" check, devs assume the login already throttled); (b) throttling but not clearing `attempts.delete` on the email key after a successful overall login, so the count carries over spuriously (or, worse, *clearing* it on each 2FA attempt, resetting the attacker's budget); (c) keying only on IP (misses distributed attackers) but not on email (misses one attacker with many IPs).

**Why it happens:** The throttle is generic; each new endpoint quietly picks its own max/key when you write it.

**How to avoid:** Reuse `tooMany` but with explicit constants per endpoint: TOTP verify at max 5–10 per 15 min keyed on `${ip}|${email}`, and DO NOT reset that key between the failed-password attempt and the 2FA steps of the same flow (they're one logical login). Recovery-code verify: tighter (max 5). Add a lockout response code distinct from `tooManyLoginAttempts` only if the UI must distinguish them — otherwise reuse the same code (one fewer catalogue entry). Consider `sleep(50)` on any failure to slow online enumeration marginally, and log every 2FA failure to the activity log.

**Warning signs:** New 2FA/recovery endpoint with no `tooMany(` call; a successful verify that calls `attempts.delete` with the email key before the TOTP step.

**Phase to address:** Phase 14+; Phase 13 investigation should audit the throttle's key/constant table as an explicit deliverable.

---

### Pitfall 19: Zero-dependency constraint violated by external crypto or QR libs — and hand-rolling the WRONG things instead

**What goes wrong:** Two opposite failure modes. (a) Escaping the constraint: `npm install qrcode` or `otplib` sneaks in because "totp is hard" — that breaks the project's core identity decision (validated twice in PROJECT.md). (b) The opposite: hand-rolling an HMAC/OTP correctly is fine (~30 lines), but hand-rolling **QR code generation** is where it bites — a QR encoder is *not* trivial (Reed-Solomon ECC, masking, version selection); a naive hand-rolled one produces the current state (illegible/fake) or worse, a QR that *renders* but encodes the wrong URI.

**Why it happens:** People know TOTP is hand-rollable and assume QR is on the same difficulty tier.

**How to avoid:** Keep zero-runtime-deps (crypto + base32 by hand in `node:crypto` — safe) but make the QR a *build-time/dev-time or vendor decision*: precompute the SVG QR at enable-time with a tiny vendored dependency-free encoder you can review (a single-file base of a well-tested minimal QR encoder is the honest middle ground — vendoring is not "a runtime dependency" if it's an audited file in-repo), OR render a scannable QR with a small, bounded, unit-tested generator. Do NOT restart the whole app to install runtime packages. Document the choice so the next milestone doesn't re-litigate it.

**Warning signs:** `package.json` grows a runtime dependency; a "QR" that is a placeholder SVG/data-uri built by string-concat of rects (the current fake).

**Phase to address:** Phase 13 investigation must pick the QR strategy explicitly (vendored file vs build-time) and log it as a decision.

---

### Pitfall 20: i18n build gate flags every new literal — each 2FA/recovery message is an uncatalogued string

**What goes wrong:** The v1.2 build gate (`scripts/i18n-scan.mjs`) fails the build on any new uncatalogued literal. The auth endpoints return ~10–15 new error codes (`twoFactorRequired`, `invalidTotpCode`, `codeAlreadyUsed`, `sessionRevoked`, `passwordTooWeak` variants on change, `pendingChallenge` UI strings, "N recovery codes remaining", scanner instruction copy…). The server already follows the "stable code + English message, client translates" pattern from v1.2 — but the UI strings for the pin entry screen, the QR setup wizard and the sessions page will trip the gate *at build time in CI*, which is a surprise if the implementer expects code+message to be enough.

**Why it happens:** The gate scans the hand-written HTML template strings in `src/`, not just catalogues — and the 2FA UX needs real UI copy, not just error payloads.

**How to avoid:** Plan the catalogue keys as a deliverable: enumerate every new key and add EN+FR in the same commit as the UI feature. Reuse existing codes (`tooManyAttempts`, `signInRequired`) where the message is semantically identical — the client falls back to English + code translation is already built. Make the i18n scan part of the 2FA/sessions PLAN's verification, so the fail-the-build surprise arrives in the plan instead of CI.

**Warning signs:** New `t('...')` keys absent from both catalogues; CI's `i18n-scan` step red; PR diff that adds UI strings without a parallel catalogue diff.

**Phase to address:** Phase 14+ (each UI phase); call it out in the PLAN.

---

### Pitfall 21: Migration must remain a byte-identical no-op on second boot — 2FA columns are the trap

**What goes wrong:** The project's migration invariant (proven by v1.1's `migrateTenancy()` + `test/migration.test.mjs`, and re-proven by v1.2's `locale` column) is: schema migration runs at boot, guarded by column-existence checks so a second boot performs zero writes. New columns (`totp_secret_enc`, `totp_last_step`, `tfa_enabled_at`, `recovery_codes`, `sessions.pending_tfa`) must use the same `create table if not exists` / guarded `alter table` pattern — but 2FA invites the mistake of a *seed* or *backfill* step ("initialize recovery codes for all existing users at migration time"), which is a write that runs every boot (or runs once and corrupts the guarantee because the guard is wrong).

**Why it happens:** 2FA wants per-user state and it feels natural to "make everyone have recovery codes" in the same migration — but existing users don't have 2FA enabled yet; generating anything for them is either dead data or a pointless write.

**How to avoid:** The migration adds *columns and tables only*, all nullable/default-absent; existing users simply have `tfa_enabled = 0` and empty 2FA state — nothing to backfill. The existing shared-field problem (`tfa: false`, `sessions: []` currently live *inside the workspace JSON document* per PROJECT.md's Active issue) must be resolved with real columns **in this milestone** and not alongside the migration of the document, or you'll get a write-on-boot from the document migration path. Keep `vacuum into` backup-before-first-write consistent with v1.1's approach, and extend `test/migration.test.mjs` to assert byte-identical second boot for the *new* schema.

**Warning signs:** A migration function containing `insert`/`update` on user tables; the migration-test diff missing; `tfa`/`sessions` still keys in `redactDoc`-touched JSON after Phase 14.

**Phase to address:** Phase 13 investigation (decide: move `tfa`/`sessions` out of the workspace document into real per-user tables — PROJECT.md's Active isolation item lists exactly this) and Phase 14+ implementation.

---

### Pitfall 22: Minor — SESSION_DAYS vs pending-session lifetime mixing, and `timeSafeEqual` length-crash, and let-new-secret-overwrite flow

**What goes wrong:** Small sharp edges: (a) the pending 2FA session can inherit `SESSION_DAYS` max-age by copy-paste of the insert (see Pitfall 15); (b) `crypto.timingSafeEqual` **throws** on unequal lengths — a 5- or 7-character submitted code that reaches it produces a 500 instead of a 401 (validate length ≥ before calling); (c) a "regenerate secret" endpoint that can be hit via CSRF — the whole 2FA family must sit behind the existing `sameOrigin` guard which login/signup already have at server.js:1228/1286 but the analysis of *which new endpoints* need it is easy to forget.

**Why it happens:** Copy-paste from the login handler without re-deriving the constants.

**How to avoid:** New-mutation checklist per endpoint: `sameOrigin(req)` first, `tooMany` next, length-validate before `timingSafeEqual`, explicit short lifetime for challenge state, explicit exclude-of-current for revocation.

**Phase to address:** Phase 14+ as a checklist item; a generic "new auth endpoint contract" to record at Phase 13.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Plaintext TOTP secret in DB | No `MASTER_KEY` env plumbing, recoverable secret | DB leak = permanent 2FA bypass; you can never add billing/security claims on top | Never |
| No last-used-step (replay allowed) | One less column, one less test | One phished code usable for 90 s; fails future security review | Never |
| `code === expected` | One line | Review-flagged forever; the fix is one call | Never |
| Recovery codes as plaintext strings in a column | Display-them-again UX for free | DB leak = full account takeover without device | Never (show once, store hashes) |
| Adding remember-me in v1.3 alongside revocation | Users ask for it | Two-tier revocation bugs in the milestone's headline feature | Never in this milestone; separate milestone |
| Password history / no-reuse-of-last-N | Feels hardening | GDPR-ish storage question, scope creep, i18n keys for no value | Defer explicitly |
| NTP-correcting server clock "for TOTP" | Feels robust | Container image needs net access + a clock discipline it doesn't have; TOTP works fine with ±1 window | Never (never needed) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Google Authenticator / Authy via otpauth | Label not `<Issuer>:<account>`; issuer/secret params unescaped or lowercase; missing `algorithm/digits/period` | Build with `new URL()` + `URLSearchParams`; SHA1/6/30 explicit; secret base32 uppercase; fixture-vector unit test |
| Existing `tooMany` throttle | New 2FA endpoints skip it, or reset the key mid-login-flow | One logical login = one budget; no `attempts.delete` between password and TOTP steps; explicit constants per endpoint |
| Existing `currentUser()`/`requireUser` | Treating a `pending_tfa=1` session as signed in; memoizing identity per request | Pending sessions are anonymous to every endpoint except the challenge verify + logout; never cache identity beyond one handler |
| Existing `sameOrigin` guard | New mutation endpoints (2FA enable/verify/disable, password change, revoke-others) forget it | Copy the pattern from `/api/auth/login`: guard first, before body read and throttle |
| v1.2 i18n build gate | New UI/error literals shipped without catalogue entries → red CI | Catalogue keys (EN+FR) are part of each 2FA prerequisite definition in the plan; reuse existing error codes where semantically identical |
| v1.1 migration machinery | Backfilling per-user 2FA state inside the boot migration | Columns-and-tables only, no user-data writes; byte-identical no-op asserted by extending `test/migration.test.mjs` |
| scrypt verify in password change | Calling scryptSync twice in one request (verify + re-verify against stale row) | Verify once; hash the new password once; all in the same handler, same transaction as session revocation |
| Workspace document JSON | New `tfa`/`sessions` state written into the shared workspace doc (the current shape per PROJECT.md Active) | Real `users`/per-user tables; the doc keeps no auth state; contract covered by the isolation item |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| scryptSync on the hot path of every 2FA verification | P99 latency spikes, thread blocked ~100 ms during TOTP login | scrypt belongs to password verify only; TOTP/recovery verify is HMAC/sha256 (microseconds) — never re-run scrypt for the second factor | Immediately visible in any terminalUI test > 20 concurrent logins |
| Un-indexed sessions lookups after adding `pending_tfa`/kind filters | Every request's `currentUser` join slows as the sessions table grows | Index already exists on `expires_at`; add one on `token_hash` if composite conditions grow; sessions table should also have the expiry cleaner interval already present at server.js:2173 | Thousands of sessions/month on a long-lived self-hosted box |
| `attempts` Map unbounded keys from 2FA endpoints keyed on IP only | Memory creep; map flush already exists only when size > 5000 | Keep the IP+email composite key; the existing >5000 sweep covers it — do not add a second, different-keyed map | Many failed 2FA attempts from rotating IPs |
| Loading all recovery codes into memory to count remaining | Trivial now, but a per-login full scan | Just `select count(*)` on the index | Only at absurd code counts; non-issue in practice |

## Security Mistakes

| Mistake | Risk | Prevention |
|------|------|------------|
| 2FA challenge issues a usable session pre-verification | Full auth bypass — password alone authenticates (Pitfall 15) | Pending-session pattern; test every `requireUser` consumer against a pending session |
| TOTP secret plaintext at rest | DB theft → attacker generates valid codes offline forever | AES-256-GCM with env-held `MASTER_KEY`; fail closed if unset |
| Recovery codes usable repeatedly or listed again later | A phished code becomes a permanent key | `used_at` + changes-based race-safe update; show codes exactly once |
| Cross-session confusion on "disconnect others" | Self-DoS, or the opposite bug (attacker's session survives) | `where user_id = ? and token_hash != sha256(current)`; return live list |
| Password change does not revoke other sessions in the same transaction | Window where a session thief survives the rotation | Update hash + delete other sessions atomically; confirm new password at login AND second-cookie-death in tests |
| Missing `sameOrigin` on a new auth mutation | CSRF-driven 2FA enable/disable, secret regeneration | Guard-first pattern copied from login/signup |
| Error messages distinguishing "bad code" from "used code" on recovery | Oracle telling the attacker which codes are live | One error code: `invalidRecoveryCode`, regardless of reason |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|------|-------------|-----------------|
| Enable fails on first code attempt (±30s boundary) | "2FA is broken", feature abandoned | ±1-step window + clear retry copy explaining server-vs-phone clock |
| Self lockout on "disconnect other sessions" | User signs themselves out mid-page | Explicit exclude-current; optional "This will keep you signed in" copy |
| Recovery codes shown once and lost | Permanent lockout (self-hosted: no admin reset UX today) | Download/copy button + "I saved them" confirmation checkbox + a documented admin CLI reset path (pattern: the existing `--set-password` CLI is the model) |
| QR illegible (current fake) | Can't even start; the milestone's core complaint | Real scannable QR; also show the secret as copyable text for users who type codes manually — Apple/some users prefer pasting the base32 |
| Sessions page shows records with no last-active time | "Disconnect others" feels blind | Surface `created_at` and maybe `last_seen`; cheap, huge trust win |

## "Looks Done But Isn't" Checklist

- [ ] **TOTP:** often missing the ±1/−2 window and the replay counter — verify the same code fails on second submit
- [ ] **TOTP:** often missing constant-time compare — verify `timingSafeEqual` (length-guarded) appears in all four code-comparison sites
- [ ] **Materialization test:** database dump after enable contains no plaintext secret and no plaintext recovery codes — grep the row
- [ ] **otpauth:** often missing `algorithm`/`digits`/`period` params and correct issuer escaping — verify with a fixture vector and 5 params present
- [ ] **Enable flow:** often missing the confirm-code step, or confirming with the *current* code instead of a fresh one, or regenerating on retry
- [ ] **Revoke-others:** often deletes own session — verify a second browser stays dead while the caller stays signed in
- [ ] **Password change:** often skips the other-session revocation or does it outside the hash-write transaction — verify second-cookie 401 within the same second
- [ ] **Recovery codes:** often missing single-use race-safety and reuse of the login throttle on the recovery endpoint — verify `used_at` flips and throttle constants exist
- [ ] **Brute force:** often missing throttle on the TOTP challenge itself — verify failing verify 11 times → 429
- [ ] **Throttle hygiene:** often resets the attempt budget mid-flow — verify the budget survives across password→2FA steps
- [ ] **i18n:** often missing EN+FR catalogue keys for every new string — verify `scripts/i18n-scan.mjs` passes
- [ ] **Migration:** often backfills user 2FA state at boot — verify second boot is byte-identical via extended migration test
- [ ] **Shared fields:** often leaves `tfa`/`sessions` as JSON-in-document — verify they're real per-user columns and gone from the workspace doc

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Secret stored plaintext, discovered post-ship | MEDIUM | Flywheel: force-disable all 2FA, add encryption, require every user to re-enroll with a new QR/notification |
| Recovery code leaked (plaintext or reused) | LOW | Admin CLI path (copy `--set-password` shape) to invalidate + re-issue |
| No replay counter shipped | MEDIUM | Add column via guarded migration (byte-identical no-op applies), default `NULL`, treat NULL as "first use wins" |
| Self-revoke bug shipped | LOW | Post-fix: add a keep-current clause; UI copy "you were signed out" is forgiving |
| Throttle missing on 2FA endpoint | LOW | Add in the next patch; no state migration needed |
| Pending-session leaves auth bypass live | HIGH (security incident) | Immediate: rotate all 2FA pending states, review whether any attacker used it (activity log), then redesign via Pitfall 15's Option A |
| i18n build-gate red on a branch | LOW | Add the missing keys to both catalogues in the same commit; no runtime change |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1, 2, 3, 4, 5, 6 — TOTP crypto core (window, replay, timing, secrecy, base32, clock) | Phase 14+ (Phase 13 lists the constants and env expectations) | Unit tests: known-vector code, replay-after-success, timing-safe grep, DB-row dump clean |
| 7, 8 — provisioning (otpauth params, scan-vs-enable) | Phase 14+ (Phase 13 decides UI flow shape) | Fixture URI has SHA1/6/30 + escaped issuer; enable requires a verifying code; pending→enabled state flip covered |
| 15, 22 — challenge bypass & endpoint contract (pending session, sameOrigin, short lifetime, length-guard) | **Phase 13 investigation** (choose pending-session pattern) then Phase 14+ | Matrix test: every `requireUser` consumer returns 401 for a `pending_tfa=1` session except verify/logout |
| 9, 10, 11 — revocation (exclude current, no identity cache, single tier) | Phase 14+ (invariant written at Phase 13) | Second-cookie-dies test; caller-alive test; "revoked-cookie still 200 with same `<current>` session" test |
| 12, 13, 14 — password change (transaction, no token derivation, one strength helper) | Phase 14+ | New password works; second session dead; signup/change share one validator |
| 16, 17, 18 — recovery codes (hashing, single-use, throttle) | Phase 14+ | DB row plaintext-free; same code second use fails; 11 rapid failures → 429 |
| 19 — QR strategy under zero-deps (vendored audited encoder vs build-time) | **Phase 13 investigation** (explicit decision) | Scanned-by-real-device UAT (Google Authenticator + one other); no new runtime dependency in `package.json` |
| 20 — i18n build gate on new literals | Phase 14+ (every phase adds keys with its strings) | `scripts/i18n-scan.mjs` passes in CI; catalogues diffed in the same commit |
| 21 — migration no-op & moving `tfa`/`sessions` out of the workspace doc | **Phase 13 investigation** (whether to unify with the Active isolation item) then Phase 14+ | Extended `test/migration.test.mjs`: second boot byte-identical; workspace JSON contains no auth keys |

## Sources

- RFC 6238 (TOTP) §5.2 — "The verifier MUST be prepared to accept several time steps" (window authority); RFC 4226 (HOTP) §5.3 — dynamic truncation algorithm
- RFC 4648 — base32 alphabet, padding semantics
- Google Authenticator "KeyUriFormat" wiki (the de-facto otpauth URI spec: issuer/secret/algorithm/digits/period semantics, label format)
- OWASP Authentication Cheat Sheet — recovery codes, brute-force limits on OTP, storage of shared secrets
- Node `crypto` docs — `createHmac`, `createCipheriv` (aes-256-gcm), `timingSafeEqual` length behavior
- Direct read of `server.js` (v1.2-shipped state): `sessions` table + `token_hash`, `currentUser()` per-request DB identity, `tooMany()` throttle keyed `${ip}|${email}` max 10/15min, `sameOrigin` guards on login/signup, `--set-password` CLI revoking sessions, sessions-expiry cleaner interval, scrypt N=16384
- PROJECT.md v1.3 scope, Active items (`tfa`, `sessions` shared document fields), migration no-op guarantee, `scripts/i18n-scan.mjs` build gate

---
*Pitfalls research for: Gr8r Studio v1.3 Auth Hardening (TOTP 2FA, QR provisioning, session revocation, password-change-with-revocation)*
*Researched: 2026-10-26*
