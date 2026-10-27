# Discussion Log — Phase 18

**Date:** 2026-10-27
**Mode:** discuss (default)
**Areas selected:** all 4 (user selected everything)

## Area 1: Périmètre e2e Chromium

| Question | Options presented | Decision |
|----------|-------------------|----------|
| Where do new auth e2e tests live? | Extend flows.spec / new auth.spec.mjs / decide at plan | **Extend flows.spec** (D-75) |
| How is TOTP obtained in e2e? | Test secret + local RFC calc / test-only backdoor route / other | **Secret + local computation** (D-76) |
| Locale coverage in new tests? | Parametric EN+FR everywhere / 2FA-only FR / FR sample | **EN+FR parametric** (D-77) |

## Area 2: Preuve de migration

| Question | Options presented | Decision |
|----------|-------------------|----------|
| How is the final migration proven? | Extend migration.test.mjs / dedicated final test / mixed | **Extend migration.test.mjs** (D-78) |
| Where does the "no auth fields in workspace JSON" check live? | Direct DB assertion / DB + API surface / nothing more | **Direct DB assertion** (D-79) |

## Area 3: Checklist pitfalls

| Question | Options presented | Decision |
|----------|-------------------|----------|
| How is the looks-done-but-isn't checklist executed? | Audit + documented gaps / immediate fixes / auth subset only | **Audit + gaps documented** (D-80/81) |
| Where is the audit result documented? | Dedicated 18-PITFALLS-AUDIT.md / section in VERIFICATION.md | **Dedicated file** (D-80) |

## Area 4: UAT appareil réel + reports

| Question | Options presented | Decision |
|----------|-------------------|----------|
| When does real-device UAT happen? | After e2e green / parallel / first | **After e2e green** (D-82) |
| What happens to WR-01/WR-02 and IN-02? | WR fix + IN-02 deferred / fix everything / verification only | **WR-01/WR-02 fixed here, IN-02 deferred** (D-84/85) |

## Deferred Ideas

- IN-02 (logout CSRF) → backlog, v1.3.x hardening pass
- New capabilities from audit → roadmap backlog

## Agent Discretion Items

- Whether `npm run e2e` joins the closing gate alongside `npm test` (plan decides)
- Throttle isolation strategy per e2e test (planner verifies helpers/setup.mjs)
- Splitting flows.spec into a second describe block if size demands (allowed, D-75)
