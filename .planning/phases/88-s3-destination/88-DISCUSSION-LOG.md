# Phase 88 Discussion Log — S3 Destination (2026-11-22)

Mode: default (interactive). All 4 proposed gray areas selected by the user.

## Destination model
| Q | Options | Selected |
|---|---|---|
| S3 vs local relationship | S3 beside local / one destination per task / local+optional-S3 now | **S3 beside local** |
| History representation | Single row lifecycle / run row + separate upload event / two linked rows | **Single row, upload in lifecycle** |
| Upload failure email | Email on upload failure / history only / after N consecutive failures | **Email on upload failure** |
| Manual Run-now uploads | Manual uploads too / scheduled only | **Manual uploads too** |
| Upload as D-19 stage | Visible 'uploading' stage with parts progress / hidden inside verify | **Visible stage** |

## Object layout & retention
| Q | Options | Selected |
|---|---|---|
| Key layout | Per-task prefix / flat / date-partitioned | **Per-task prefix** |
| Bucket pruning | Lifecycle rules, app never deletes / in-app mirrored deletes / per-task prune flag | **Lifecycle rules, app never deletes** |
| Checksum verifiability | Sidecar object + DB sha256 / DB-only re-read / trust provider headers | **Sidecar object + DB sha256** |
| Manual archive prefix | backup-manual/ / date prefix under manual / flat mixed | **backup-manual/** |
| Upload headers | Minimal (CT+CL only) / force SSE-S3 header | **Minimal headers** |

## Credential custody
| Q | Options | Selected |
|---|---|---|
| Config count | Single S3_* env pair / multi-profile / single + reserved column | **Single S3_* env pair** |
| Task opt-in | Boolean s3_enabled / instance-wide flag / destination object column | **Boolean s3_enabled** |
| URL styling | Path-style default + region default / provider-detect | **Path-style default** |
| http endpoints | Allow http, warn / https enforced | **Allow http, warn** |

## Probe & failure semantics
| Q | Options | Selected |
|---|---|---|
| Probe check | Write+delete marker / HeadBucket only / List+HeadBucket | **Write+delete marker** |
| Retry posture | In-run retry then upload_failed / fail fast / retry + re-upload sweep | **In-run retry then upload_failed** |
| Clock skew | Distinct keyed refusal / generic S3 error | **Distinct keyed refusal** |
| MinIO e2e | Env-gated Docker MinIO / programmatic container / mock-only | **Env-gated Docker MinIO** |

## Deferred ideas captured
- In-app S3 object deletion (v2)
- S3-only tasks (post-89)
- Multi-profile S3 (v2)
- SMB/FTP (v2, D-33-3)
- SSE headers per upload (D-33-12 out of scope)

## Agent discretion items
Retry backoff constants, probe key naming, SigV4 implementation details, part buffer mechanics, test file layout, audit action naming.
