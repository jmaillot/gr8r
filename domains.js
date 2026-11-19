/* =====================================================================
   Domain admission (Phase 75, DOM-01/DOM-02/DOM-07) — the ONE canonicalizing
   domain machinery behind every admission door (signup DP-1, invite-create
   DP-2, invite-accept DP-3, MCP invite_member). Lives in src/core/ (not
   server.js) so the MCP tool composes the exact same pipeline — no bypass
   lane, no reimplemented matching (T-75-16). One split('@') call site.

   Tri-state resolver: raw === undefined → null (door off/fail-open; strict
   presence, never falsiness — Pitfall 4); an empty or whitespace-resolving
   raw value parses to an EMPTY Set (deny-all, D-01/D-02). Matching is exact
   Set.has on the canonicalized domain — never suffix/endsWith (verified
   bypass vector). Malformed entries are warn-and-clean (D-05): dropped with
   a boot warning, boot never aborts.
   ===================================================================== */

export const canonicalizeDomain = domain =>
  String(domain || '')
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\.$/, '');

/* NFKC-normalize BEFORE splitting on the LAST '@' (Pitfall 2): a fullwidth ＠
   (U+FF20) becomes a real separator, and a fullwidth full stop (U+FF0E) in the
   domain part becomes '.' before the trailing-dot strip. Returns null for an
   email with no separator or an empty domain part. */
export const emailFromEmail = email => {
  const raw = String(email || '').normalize('NFKC');
  const at = raw.lastIndexOf('@');
  if (at === -1 || at === raw.length - 1) return null;
  return canonicalizeDomain(raw.slice(at + 1));
};

/* Valid canonicalized domain shape: labels of [a-z0-9-] (single label allowed
   — the tri-state matrix pins ' a , B ' → {a, b}) — no '@', no whitespace, no
   leading dot left over after the trailing-dot strip (WR-01 review fix:
   entries like '@example.com' or 'example .com' used to enter the Set
   silently, never matched, and printed as valid in the D-06 boot log — a
   dead door with no warning). */
const DOMAIN_SHAPE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/* Pure parser (raw + name in, null-or-Set out, no process.env reads — the
   unset/set-empty distinction is made by the caller's strict undefined
   comparison). Idempotent: the same raw always yields an equal Set. */
export const parseDomainList = (raw, name) => {
  if (raw === undefined) return null;
  const domains = new Set();
  for (const entry of String(raw).split(',')) {
    const domain = canonicalizeDomain(entry);
    if (!domain || !DOMAIN_SHAPE.test(domain)) {
      /* D-05 warn-and-clean: printed straight to stderr so the observable
         survives regardless of the host's log-level plumbing. */
      console['warn'](`${name}: dropping invalid entry "${entry}" (warn-and-clean, D-05)`);
      continue;
    }
    domains.add(domain); // Set dedupe — idempotent re-parse
  }
  return domains;
};

/* Boot-frozen door matrix (artifacts decision): tightening takes effect on
   restart. DOM-02 inheritance rides ?? — null (unset) inherits; an explicitly
   set value, including '', parses to a Set that ?? never overrides. Frozen
   once at module load (server.js imports mcp.js which imports this module —
   both doors see the same Set objects). */
export const SIGNUP_DOMAINS = parseDomainList(process.env.ALLOW_SIGNUP_DOMAINS, 'ALLOW_SIGNUP_DOMAINS');
export const INVITE_DOMAINS = parseDomainList(process.env.ALLOW_INVITE_DOMAINS, 'ALLOW_INVITE_DOMAINS') ?? SIGNUP_DOMAINS;

/* The {code,message}|null funnel contract (mirrors validateGuestInviteShape):
   null = admitted, object = keyed generic refusal (D-04 — no policy reveal).
   The caller picks the door's list (DP-1 passes SIGNUP_DOMAINS, never the
   invite list — one door, one rule). An unparseable email refuses, never throws. */
export function emailDomainRefusal(email, domains, code = 'signupDomainNotAllowed', message = 'This email is outside the domains allowed to create an account') {
  if (!domains) return null; // door off — fail-open (unset)
  const domain = emailFromEmail(email);
  if (domain === null || !domains.has(domain)) return { code, message }; // exact membership only
  return null;
}
