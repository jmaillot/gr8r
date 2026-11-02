# API Coverage — Microsoft Entra ID (v2.0 OIDC endpoints)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Note: the deterministic detector returned `detected:false` over the phase scope, but the
> phase genuinely integrates Entra's OIDC endpoint surface — this matrix is produced
> voluntarily rather than skipping the checkpoint. Scope read from ROADMAP §Phase 30 +
> 30-CONTEXT.md + 30-RESEARCH.md.

| capability | decision | reason |
|---|---|---|
| openid-configuration discovery fetch | INTEGRATE | one GET, issuer-validated, cached at boot (SSO-01) |
| authorize (auth-code + PKCE S256, response_mode=query) | INTEGRATE | the core sign-in path (SSO-01) |
| token endpoint (authorization_code grant, confidential client) | INTEGRATE | D-01 client secret + PKCE verifier exchange (SSO-01) |
| JWKS keys fetch + cache + unknown-kid refetch | INTEGRATE | RS256 id_token verification (SSO-01/SSO-08) |
| id_token claims validation (iss/aud/exp/nbf/nonce/tid) | INTEGRATE | SSO-08 checklist |
| userinfo endpoint | OPT-OUT | email claim already arrives in id_token via `openid email` scope; a second round-trip adds no verification value |
| refresh-token grant / token lifetime management | OPT-OUT | app's own `sessions` rows own lifetime; IdP tokens are one-shot proof (RESEARCH Don't-Hand-Roll) |
| end-session / front-channel logout | OPT-OUT | app logout revokes the local session row (existing teardown); Entra browser session is intentionally untouched |
| admin-consent / Graph / SCIM provisioning | OPT-OUT | explicitly out of scope per REQUIREMENTS.md (de-provision = disable in Entra, login then fails) |
| groups claims → role mapping | OPT-OUT | explicitly out of scope per REQUIREMENTS.md; role comes from D-04 env default only |
| implicit flow (`response_type=id_token`) | OPT-OUT | deprecated; nonce only consumed on token-endpoint id_token |
| PKCE method `plain` | OPT-OUT | spec-allowed but always send S256 |
