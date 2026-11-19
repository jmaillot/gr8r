# Phase 75 Discussion Log — Domain Admission Core

**Date:** 2026-11-19
**Mode:** default (interactive)
**Prior decisions carried:** SEED-261119-f3w door matrix (owner-validated), research
recommendations (deny-all for set-but-empty, exact Set matching, live-read env).

## Areas Discussed

### Set-but-empty semantics
| Question | Options presented | Decision |
|---|---|---|
| `ALLOW_INVITE_DOMAINS=''` semantics | Deny-all (rec) / inherit signup | **Deny-all** |
| Same for `ALLOW_SIGNUP_DOMAINS=''` | Same rule (rec) / asymmetric fail-open | **Same rule** |
| Continue? | — | Next area |

### Invite-refusal UX
| Question | Options presented | Decision |
|---|---|---|
| Multi-email batch refusal | Per-email inline (rec) / all-or-nothing batch | **Per-email inline** |
| Reveal allowed domains? | Generic refusal (rec) / reveal list | **Generic (no oracle)** |
| Continue? | — | Next area |

### Boot validation posture
| Question | Options presented | Decision |
|---|---|---|
| Malformed entries | Warn-and-clean (rec) / fail-fast boot | **Warn-and-clean** |
| Boot log shape | Single summary line per var (rec) / verbose per-entry | **Single summary line** |
| Continue? | — | Next area |

### Accept-refusal UX
| Question | Options presented | Decision |
|---|---|---|
| Invitee refusal message | Generic non-consuming (rec) / domain-specific | **Generic, non-consuming** |
| Notify inviter? | No notify (rec) / notify inviter | **No notify** |
| Continue? | — | All areas complete |

## Agent Discretion Items
- Catalogue wording for new refusal keys
- Internal validator/resolver function shape (pure, funnel-shaped)
- Live-read vs boot-frozen env at door call-sites (research recommends live-read)

## Deferred Ideas
None — no scope creep occurred.

## Canonical Refs Added During Discussion
None beyond roadmap/research (user referenced no new docs).
