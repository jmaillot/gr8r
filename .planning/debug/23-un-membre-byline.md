---
status: resolved (fix shipped in 23-05 / 23-06, verified 2026-10-31)
trigger: "Prod emails read 'Un membre mentioned you in test notif test on Prod.' instead of the author's username (UAT gap G-23-1)"
created: 2026-10-31T11:40:00Z
updated: 2026-10-31T12:05:00Z
---

## Current Focus

hypothesis: CONFIRMED — the stored workspace document intentionally carries no account-backed member profiles; queueNotifEmails resolves the author's name from `nextDoc.data.members`, which is empty of account members, so `profiles.get(n.by)?.name` falls through to 'Un membre'.
test: Live repro on a scratch server instance (temp DB, SMTP catcher on 127.0.0.1:2525): signup Alice+Bob, create workspace, invite Bob, Alice PUTs doc containing a mention notif (by: her member id, to: Bob's member id).
expecting: stored doc keeps notif + task but members = [] → profiles map empty → byline falls back.
next_action: report findings (diagnose-only mode)

## Symptoms

expected: email byline shows the acting user's name ("Alice mentioned you …")
actual: byline is the fallback "Un membre"; task deep-link works
errors: none (silent fallback)
reproduction: any mention/assign/comment email on prod where the author is an account-backed member
started: noticed on prod deployment (projects.jeremymaillot.fr), phase 23 UAT

## Eliminated

- hypothesis: mailer.js renders the wrong field
  evidence: mailer.js:398 `const actor = text(msg.by) || 'Someone'` — pure passthrough of the `by` field it receives.
- hypothesis: users table / signup stores empty names
  evidence: server.js:1300 `cleanName = (name||'').trim() || clean.split('@')[0]` — users.name is never empty.
- hypothesis: `n.by` is a user id (id-space mismatch)
  evidence: n.by comes from client `D().me` (store.js:291 `by: n.by`), which is `api.memberId` = `membership.member_id` (server.js:359) — a member id in the same id-space the profiles map is keyed on. The recipient (same id-space) resolved fine in prod.

## Evidence

- timestamp: 2026-10-31T11:45Z
  checked: server.js:696-729 (queueNotifEmails)
  found: `profiles` map is built exclusively from `nextDoc.data.members` (line 699); byline is `profiles.get(n.by)?.name || 'Un membre'` (line 722); recipient email resolution (lines 707-708) also depends on that same map.
  implication: byline correctness depends entirely on the members array present in the post-PUT doc.
- timestamp: 2026-10-31T11:50Z
  checked: server.js doc write path (docFromClient 763-801, PUT handler 2160-2206, emptyDoc 964, normalizeDoc 384-401)
  found: emptyDoc seeds `members: []`; normalizeDoc comment (line 397-398): "the stored document intentionally carries no members"; docFromClient's admin branch (775-783) keeps only account-backed incoming members that the STORED roster already knows — since the stored roster is empty, every account-backed profile is dropped to null and filtered; the non-admin branch (771) replaces members with the stored (empty) roster outright. syncProfiles (867-899), which would rebuild profiles from memberships+users (memberProfile carries users.name), runs ONLY on the read path (docForClient:754), never before queueNotifEmails.
  implication: `next.data.members` passed to queueNotifEmails never contains account-backed author profiles; only doc-only members (no userId) survive.
- timestamp: 2026-10-31T11:52Z
  checked: live repro — scratch server (DATA_DIR/DB_PATH under /tmp/opencode/g23, PORT 8123, APP_URL set, SMTP catcher on 127.0.0.1:2525, ALLOW_SIGNUP=true)
  found: after Alice (owner/admin) PUTs a doc carrying `notifs:[{id:'n2',to:'m_8fd285d3',type:'mention',by:'m_ec79a901',…}]`, the raw stored doc row shows `members: []` while `notifs` and `tasks` persist. In-app roster still LOOKS correct because the GET read path re-runs syncProfiles from memberships+users. In this repro no email was even sent: with profiles empty, recipient resolution (line 709 `if (!to) continue`) also skipped — on prod the email went out, meaning the recipient profile existed there (doc-only member with email / or stored roster residual) while the author's did not.
  implication: `profiles.get(n.by)?.name` is undefined for any account-backed author → 'Un membre'. Confirms root cause end-to-end.

## Resolution

root_cause: The stored workspace doc never persists account-backed member profiles (by design — roster authority lives in memberships+users, rebuilt only on the read path via syncProfiles). queueNotifEmails resolves the author byline from `nextDoc.data.members` (server.js:699,722), which is empty of account members at email-build time, so the name lookup falls through to the 'Un membre' literal.
fix: (missing change) resolve the author name from the authority tables in queueNotifEmails, not from nextDoc.data.members — e.g. reuse membersOf(ws.id)/a userId→name query (users joined via memberships.member_id/user_id) to map n.by (member id) → user name, keeping profile.name as fallback for doc-only members and 'Un membre' as last resort. Note the sibling defect on the same lines: recipient email resolution (server.js:707-708) silently skips account-backed recipients whose profile is absent from the stored doc (observed: no email at all in the repro) — same data source, same fix surface.
verification: not fixed yet (diagnose-only)
files_changed: []
