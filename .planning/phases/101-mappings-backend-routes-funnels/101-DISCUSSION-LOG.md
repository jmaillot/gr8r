# Phase 101 Discussion Log

**Date:** 2026-11-27 · **Mode:** default (interactive)

## Area: Route gate & throttle shape
| Question | Options presented | Decision |
|---|---|---|
| Unknown mapping id on DELETE: what does anyone learn? | Uniform 404 (rec) / 403-404 ladder split | Uniform 404 |
| Throttle shape | GET none + DELETE throttled (rec) / both / none | GET none, DELETE throttled |
| URL family | /api/governance (rec) / /api/auth/operator | /api/governance |

## Area: Dead-hint data scope
| Question | Options presented | Decision |
|---|---|---|
| MAP-04 hint depth | ws state + live members (rec) / + guard trail / ws state only | ws state + live members |
| Hint transport | Structured fields (rec) / pre-rendered text | Structured fields |

## Area: List payload shape
| Question | Options presented | Decision |
|---|---|---|
| Replace or coexist with dead-mappings route | Flat rows coexist (rec) / merged single source / duplicated logic | Coexist |
| Delete targeting key | Opaque row id (rec) / composite GUID+ws | Opaque row id |

## Area: Delete audit details
| Question | Options presented | Decision |
|---|---|---|
| Audit verb | group_mapping_deleted (rec) / other | group_mapping_deleted |
| Audit content | GUID+ws+label (rec) / minimal | GUID+ws+label |
| Actor | Operator actor (rec) / self-style | Operator actor |

## Area: Additional gray areas (user-selected round 2)
| Question | Options presented | Decision |
|---|---|---|
| Role edit path | Delete+recreate (rec) / PATCH / PATCH label-only | Delete + recreate |
| Boot warn alignment | Keep as-is (rec) / align | Keep as-is |
| Operator gate scope | isInstanceAdmin (rec) / wider super-access | isInstanceAdmin |
| Dialect parity tests | Live SQLite + static pg (rec) / both live | Live SQLite + static pg |

## Deferred during discussion
- PATCH route (additive later) · per-row guard trail in GET · Graph lookup seam · MCP mirror
