# Feature Landscape — v1.8 "Notification Sanity"

**Domain:** Project-management tool notifications (reminder cadence, daily digest, notification i18n)
**Researched:** 2026-11-04
**Overall confidence:** HIGH for cadence and digest behavior patterns (grounded in Todoist/Asana/Workfront docs), MEDIUM for i18n norms (enterprise-tool docs + Trello behavior, less formal specification exists)

Scope note: covers ONLY the three new v1.8 feature areas (REM rework, DIGEST, I18N server-side) plus what the AUDIT needs to evaluate them. Existing gr8r baseline (3-offset scheduler, 17-key notifPrefs whitelist, per-account locale, EN/FR catalogues) is treated as given.

## How the PM ecosystem actually does it

### Reminder cadence (how many notifications per task?)

| Tool | Model |
|------|-------|
| **Todoist** | Reminders are *separate* from due dates: 1 automatic reminder (at due time, configurable default) + optional custom reminders. Users who complain about noise are told to disable automatic reminders, not to tolerate more. (HIGH — todoist.com/help) |
| **Asana** | No per-task reminder emails by default; noise control comes from a *choice between individual emails, daily digest, or both*. (HIGH — help.asana.com) |
| **Adobe Workfront** | Overdue emails go as **one digest email per recipient per day, not separate emails per item**. (HIGH — experienceleague.adobe.com) |
| **Trello / Linear / Jira** | Due-date nudges live in the in-app inbox/notifications; email is a mirror or an opt-in digest. Jira's due-date "notification schemes" are admin-configured, rarely email-first. (MEDIUM) |

**Consensus pattern:** 1–2 notifications per task maximum, with the "at due time / due today" one being the near-universal anchor. The "day before" offset exists in some tools (ClickUp due-date reminders, Todoist custom reminders) but as an **opt-in per-task or per-user setting, never a default that fires 3 emails per task**. A "past due" follow-up fired *once, the next morning* (not repeatedly each day) is the Workfront-style pattern and matches gr8r's planned REM rework exactly.

**Expected behavior for gr8r (validated):** max 2 per task — "due today" at 09:00 + "past due" the next morning, then silence. This is not a downgrade vs competitors; it is the aggressive end of the norm and directly answers the "too many notifications" feedback.

### Daily digest — what it contains and how it interacts with individual reminders

**Content (what every digest that works contains):**
- Two sections, clearly separated: **due today** and **overdue** (gr8r's planned scope matches).
- Each item: task title (linked via the existing `/w/:slug/task/:key` deep-link + `?next=` carry), project name, and due date (with days-overdue count for the overdue section).
- Absence handling: if nothing is due/overdue, either **send nothing** (majority pattern — silence is a feature) or a minimal "nothing due today" note. Recommended: send nothing; an empty daily email becomes noise within a week.
- A header noting the digest replaces individual reminders, so the user understands why the per-task emails stopped. (MEDIUM — inferred from Asana's "individual vs digest vs both" copy)

**Digest vs individual reminder interaction — the industry-standard decision table:**

| Digest enabled? | Due-today/past-due email | Push/inbox |
|---|---|---|
| Off (default for existing users already receiving reminders) | per-task email as today | unchanged |
| On | **suppressed entirely** — one email per day per recipient replaces per-task email | unchanged |

This "digest replaces reminders, push stays real-time" split is exactly Asana's model (digest is an *email-channel* choice; inbox/push notifications are governed separately) and Workfront's implementation. gr8r's plan (digest replaces reminder emails only, push unchanged, stub `email_digest` pref takes its real role) matches the ecosystem norm precisely — the pref already exists in the 17-key whitelist, so no migration is needed.

**Timing:** 09:00 in the recipient's timezone is the standard slot (gr8r has a workspace-shared timezone and the reminder pass already scans a 09:00 window — the digest should ride the same pass). (HIGH)

### Notification language — do tools localize per recipient?

**Yes, and it is the enterprise expectation, not a nice-to-have:**
- **Trello** detects the account language and localizes all notification emails per user. (MEDIUM — idalko guide)
- **ServiceNow** documents "multilingual email notifications: send email notifications in the **recipient's preferred language**" as a platform feature. (HIGH — docs.servicenow.com)
- **Artala** (a newer PM tool) markets "per-user language preferences, localized emails" as a differentiator. (MEDIUM)
- No major tool localizes emails by *workspace* language or *sender* language. Per-**recipient** locale is the invariant everywhere. (HIGH — convergence)

**Implication for gr8r:** the server must render email subjects/bodies, push text and inbox snippets from the recipient's account locale using the existing EN/FR catalogues. Two known constraints from v1.2 decisions resurface:
1. The server image ships no catalogue today (v1.2 deferred the invitation email for exactly this reason — Dockerfile change needed). I18N therefore requires making the JSON catalogues available server-side (they are already "importable by plain Node" by design, so this is a build/copy concern, not a rewrite).
2. Fallback rule: unknown key or missing locale → English, mirroring the client's behavior (ERR-02 pattern).

## Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Cap due-date reminders at 2 per task (due-today + one past-due, no repeats) | Industry max is 1–2; 3+ emails per task is the complaint being fixed (Kanzo #6) | **Low** | Remove `day_before` offset from `runReminderPass()`; existing `reminders_sent` dedup handles the rest. Migration concern: existing pref rows/keys for day_before must degrade gracefully |
| Per-recipient locale for ALL server-emitted text (email subject/body, push, inbox snippets) | Trello/ServiceNow norm; gr8r already has per-account locale + EN/FR catalogues — only the server lacks them | **Medium** | Server-side `t()` over the same JSON catalogues; English fallback; Dockerfile/build change to ship catalogues (the exact thing v1.2 deferred) |
| Daily digest email with two sections: due today + overdue, deep-linked items | Asana/Workfront digest shape; matches planned scope exactly | **Medium** | Rides the existing 09:00 reminder pass; per-recipient grouping query + localized digest template |
| Digest ON ⇒ individual reminder emails suppressed (per user, emails only) | Asana's model; without suppression the digest ADDS email instead of reducing it | **Low** | Gate in the reminder pass on `email_digest` pref (stub already in the 17-key whitelist) |
| Silent digest (no email when nothing due/overdue) | An empty daily email becomes noise; most digests send nothing | **Low** | One `if (rows.length === 0) return` |
| All new user-facing strings catalogued EN+FR, i18n-scan green | Standing constraint (EN+FR i18n gate) | **Low** | Existing build gate |

## Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Digest localized per recipient (not per workspace) | Rarer among self-hosted tools; multi-locale teams get one consistent experience | Low | Falls out of the server i18n layer for free once it exists |
| "Digest replaces reminders" explained in the digest header + settings copy | Users understand the behavior change without filing "where did my reminders go" | Low | 2–3 catalogue keys |
| Past-due fires exactly once (next morning), never daily | Workfront-style; repeated overdue nagging is the #1 residual noise source even in tools that fixed cadence | Low | Already the planned REM behavior; protect it in tests against "daily overdue re-fire" regressions |
| Notification audit doc (every type × channel × default, trim recommendations) | No mainstream tool publishes its notification surface; forces the "honest minimum" review the milestone name promises | **Low** | Doc-only; threshold changes validated by owner before coding (per milestone context) |

## Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Per-task configurable reminder offsets (Todoist-style custom reminders) | Direct contradiction of the milestone goal; per-task reminder settings were the *cause* of noise in Todoist-like setups | Fixed 2-notification cadence, workspace-wide |
| Digest content beyond due-today + overdue (activity, mentions, comments) | Scope creep; mixed-content digests get ignored, and mention/comment have their own real-time channels | Keep the digest strictly about dates |
| "Digest AND individual emails" option (Asana's "both") | More email, not less — inverts the milestone premise | One boolean: `email_digest` on = reminders off |
| Snooze/re-remind loops for overdue tasks (daily overdue re-fire) | Nag spiral; the honest minimum is one past-due ping | Past-due fires once, next morning only |
| Machine-translation pipeline or new languages (DE/ES/JA) | Explicitly out of scope since v1.2; selector only offers what exists | EN+FR catalogues only, extend the existing files |
| Localizing by workspace locale or Accept-Language | Wrong axis — per-recipient account locale is the industry invariant and what gr8r already stores | Read recipient's `locale` column |

## Feature Dependencies

```
I18N server-side t() layer → REM (localized reminder text on new cadence)
I18N server-side t() layer → DIGEST (localized digest subject/body/items)
DIGEST → REM (digest suppression gate lives inside the reminder pass)
Catalogue shipping to server image → all of the above (Dockerfile/build change)
Existing: reminders_sent dedup + 09:00 pass + notifPrefs rows → all of the above
AUDIT depends on nothing; its trim recommendations must land BEFORE coding threshold changes
```

**Suggested order:** I18N first (pure additive infrastructure, de-risks both other features), then REM cadence (smallest), then DIGEST (composes both). AUDIT runs in parallel from day one and gates the REM threshold coding.

## MVP Recommendation

Prioritize:
1. **Server-side notification i18n** (table stakes, medium, unblocks everything else)
2. **Cadence rework to 2-per-task** (low complexity, direct fix for the feedback that named the milestone)
3. **Daily digest replacing reminder emails** (the one differentiator users actually asked for)

Defer: digest scheduling preferences (custom hour/timezone per user) — workspace-shared 09:00 matches every competitor and the existing scheduler; digest for other notification types (mentions/activity) — different milestone.

## Sources

- Todoist Help — Introduction to reminders (todoist.com/help) — HIGH
- Asana Help — Email notifications: manage what you receive (help.asana.com) — HIGH
- Asana Forum — "Email digest?" / "More options for Email Notifications" — MEDIUM
- Adobe Workfront — Set Up Automatic Reminders: overdue digest per recipient per day (experienceleague.adobe.com) — HIGH
- ServiceNow Docs — Multilingual email notifications, recipient's preferred language (servicenow.com) — HIGH
- Idalko — Trello guide: account-language detection/localized notifications (MEDIUM)
- Ziflow Help — daily digest scheduled 09:00 (MEDIUM)
- gr8r .planning/PROJECT.md (v1.2 i18n decisions, v1.5 REM-01..05, v1.7 SETTINGS-01..03) — HIGH (local ground truth)
