/* =====================================================================
   OIDC docs fidelity (Phase 105, plan 105-02, OIDCDOC-01/02/03) —
   the docs-pinning discipline: fs-reads the REAL docs and pins every
   claim to server.js:6673-6727 semantics so the docs cannot silently
   drift from the code:

   - DEPLOY.md: the linking-policy section LEADS with OIDC_TRUST_TENANT_EMAIL
     for Azure AD work/school tenants, pins the guest carve-out
     (acct=1 / external idp → literal email_verified required), and carries
     the symptom→cause table; the stale "check tenant email verification"
     operator note is GONE
   - DEPLOY.md: the Azure group-claim prerequisites carry the Object-ID
     GUID copy-path that feeds the /governance mappings paste form
   - .env.example: the OIDC_TRUST_TENANT_EMAIL comment carries the why,
     the guest carve-out, the true/1/yes/on token list, and the DEPLOY.md
     pointer
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');
const deploy = read('docs/DEPLOY.md');
const envExample = read('.env.example');

test('DEPLOY.md linking policy leads with OIDC_TRUST_TENANT_EMAIL for Azure AD work/school tenants', () => {
  assert.match(
    deploy,
    /\*\*Azure AD work\/school tenants:\*\*[^]*OIDC_TRUST_TENANT_EMAIL=true/,
    'the linking-policy section must lead with the flag for work/school tenants whose tokens omit email_verified',
  );
  assert.match(
    deploy,
    /OIDC_TRUST_TENANT_EMAIL=true[^]*pinned-tenant members only/,
    'the substitution must be scoped to pinned-tenant members (tid match, non-guest)',
  );
  assert.match(
    deploy,
    /covers both account linking and JIT provisioning/,
    'the substitution covers linking AND JIT provisioning (server.js:6724)',
  );
});

test('DEPLOY.md pins the guest carve-out: acct=1 / external idp always need the literal claim', () => {
  assert.match(
    deploy,
    /\*\*Guest carve-out:\*\*[^]*acct=1/,
    'guest carve-out must name the acct=1 shape',
  );
  assert.match(
    deploy,
    /Guest carve-out:[^]*external-IdP identities[^]*`email_verified: true` claim[^]*the flag never applies to them/,
    'guests and external-IdP identities always require the literal email_verified: true claim',
  );
});

test('DEPLOY.md carries the symptom→cause table; the stale operator note is gone', () => {
  assert.match(deploy, /\| Symptom \| Cause \| Fix \|/, 'symptom→cause markdown table must exist');
  assert.match(
    deploy,
    /"Sign-in with Microsoft failed" \(generic error\)[^]*Azure AD work\/school token omits `email_verified`[^]*OIDC_TRUST_TENANT_EMAIL=true/,
    'row 1: generic error → missing claim → set the flag',
  );
  assert.match(
    deploy,
    /Guest sign-in fails[^]*fix at the IdP|Verify the guest's email at the IdP/,
    'row 2: guest failure → fix at the IdP',
  );
  assert.doesNotMatch(
    deploy,
    /check that the account's email is verified in the tenant/,
    'the wrong "check tenant email verification" operator note must be gone',
  );
});

test('DEPLOY.md Azure prerequisites carry the Object-ID GUID copy-path for the mappings form', () => {
  assert.match(
    deploy,
    /Groups → your group → Overview → copy \*\*Object ID\*\*/,
    'the explicit Entra copy-path must be present',
  );
  assert.match(
    deploy,
    /copy \*\*Object ID\*\*[^]*pasted into the \/governance mappings form/,
    'the GUID feeds the /governance mappings paste form',
  );
  /* OIDCDOC-02 also requires the manifest edit + assignment (pre-existing pins) */
  assert.match(deploy, /groupMembershipClaims`? to\s*\n?\s*`"ApplicationGroup"`/, 'manifest edit present');
  assert.match(deploy, /Enterprise applications → your app → Users and groups/, 'assignment path present');
});

test('.env.example OIDC_TRUST_TENANT_EMAIL comment carries why + guest carve-out + token list + DEPLOY.md pointer', () => {
  const block = envExample.match(/(?:^|\n)(#[^\n]*\n)+OIDC_TRUST_TENANT_EMAIL=/);
  assert.ok(block, 'the comment block directly above OIDC_TRUST_TENANT_EMAIL= must exist');
  const comment = block[0];
  assert.match(comment, /work\/school tokens omit|omit the .*email_verified/, 'the why: work/school tokens omit the claim');
  assert.match(comment, /acct=1|external idp/i, 'the guest carve-out must name the guest shapes');
  assert.match(comment, /the flag never applies to them|never applies to guests/i, 'the flag never applies to guests');
  assert.match(comment, /true\/1\/yes\/on/, 'the accepted token list');
  assert.match(comment, /docs\/DEPLOY\.md/, 'the pointer to DEPLOY.md');
});
