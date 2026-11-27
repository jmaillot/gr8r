# Phase 102 Discussion Log

**Date:** 2026-11-27 · **Mode:** default (interactive)

## Area: Page layout & form placement
| Question | Options presented | Decision |
|---|---|---|
| Create form placement | Always-visible form (rec) / reveal-on-add | Always-visible form |
| Row hints rendering | Badges + count chip (rec) / hints-only-when-meaningful / dimmed rows | Badges + count chip |

## Area: Delete interaction shape
| Question | Options presented | Decision |
|---|---|---|
| Delete flow | Staged inline-confirm, D-90 pattern (rec) / modal | Staged inline-confirm |
| Copy | Verbatim SC sentence + mechanism hint (rec) / verbatim only | Verbatim + mechanism |

## Area: Card migration details
| Question | Options presented | Decision |
|---|---|---|
| Card move | Strict move (rec) / dual location | Strict move |
| Card content | Keep as-is — orphans/trail complementary to row hints (rec) / merge with hints | Keep as-is |

## Area: Toasts, validation & empty states
| Question | Options presented | Decision |
|---|---|---|
| Client validation | Light pre-checks (rec) / server-only / full mirror | Light pre-checks |
| Empty state | Quiet hint (rec) / guided setup | Quiet hint |

## Deferred during discussion
- Card/hint merge · guided empty state · full validation mirror · PATCH edit-in-place · sort/filter controls
