# 87-03 → 87-04 LOCALE HANDOFF — backup alert email keys

87-03 (this plan) added a `backup_alert` email kind rendered by
`mailer.js` `buildBackupAlertMessage` via `tFor(locale, key, { task })`.
The keys below DO NOT yet exist in `src/locales/*.json` (87-03 owns no
locale files — 87-04 wave owns them). Until 87-04 lands them, the SC-5
try/catch fallback in `buildBackupAlertMessage` renders the English
literals listed here, so behavior is correct-but-EN-only.

## Keys required (all four, in every locale catalogue: fr, es, de, nl + en)

| Key | English fallback (source of truth: mailer.js) | Vars |
|-----|-----------------------------------------------|------|
| `backup.alert.failed.subject` | `Backup failed: {task}` | `{task}` = task name |
| `backup.alert.failed.body` | `The last backup run of "{task}" failed. Check the backup run history for details.` | `{task}` |
| `backup.alert.recovered.subject` | `Backup recovered: {task}` | `{task}` |
| `backup.alert.recovered.body` | `The last backup run of "{task}" succeeded again — the earlier failure has cleared.` | `{task}` |

Also consumed (already exist, no action): `notif.email.greeting`,
`notif.email.body.footer`.

## Notes for 87-04

- Locale resolution: `msg.locale` is one of `en|fr|es|de|nl` (whitelist in
  the builder); anything else/absent → `en`.
- `{task}` is interpolated by `tFor`'s existing var mechanism — same shape
  as other notif keys.
- FR translation suggestion (NBSP before colon per house rule): subject
  `Sauvegarde en échec : {task}` / recovered `Sauvegarde rétablie : {task}`.
- The 87-03 suite does NOT assert translated strings — adding the keys in
  87-04 cannot break `test/backup-rotation.test.mjs`.
