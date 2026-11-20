# Phase 80 Discussion Log

**Date:** 2026-11-20
**Phase:** 80 — Group Mapping Core

## Areas Discussed

### Env var naming & format
- Presented: colon triples env / numbered vars / JSON env; role tokens.
- **Owner pivot: "can we do this in app directly?"** → follow-up offered env-only vs DB+UI vs hybrid.
- **Decision: in-app config — DB table + operator UI on /governance (editor in Phase 83). Env mapping vars dropped.** Supersedes GM-01's `ENTRA_GROUP_MAP` wording.
- Role tokens: exactly app role names (owner/admin/member), strict, no aliases.

### Boot refusal vs warn
- **Decision: refuse at save (keyed 400, nothing invalid stored), warn at boot/console for mappings that became dead (D-82-6).**

### Module API shape
- **Decision: full resolver API** — groups.js exports validation + `resolve(groupsClaim)` (D-82-1 highest-role-wins). Inert until Phase 81.

### Overage test fixtures
- **Decision: all four shapes pinned** — `_claim_names` alone; `_claim_names` + `_claim_sources`; missing `groups`; empty array (the only true "no groups").

## Noted for Later
- None — no scope creep offered.
