# Security

## Implemented and checked

- Verified Supabase users and request-scoped cookie clients; private pages redirect unauthenticated visitors.
- Customer RLS isolation; protected records cannot be read or reassigned across customers.
- Staff roles stored separately from user-editable metadata; market restrictions and AAL2 MFA enforced in PostgreSQL and web access.
- Compliance/admin publication checks for product content and stories; editors cannot publish directly.
- Foreign keys, positive-money/stock constraints, address bounds, currency consistency and quantity limits.
- Atomic inventory reservations, idempotency locking/fingerprints and server-selected prices.
- Database-backed user rate limits for carts, addresses, support, referrals and order creation.
- Origin checks for JSON/upload mutations and Next.js Server Action protections.
- Private editorial bucket; short-lived authorized previews; no SVG/HTML uploads; byte-signature checks and a 3 MiB web limit.
- Plain-text CMS rendering, escaped React output, restrictive image hosts, frame denial and security response headers.
- Read-only audit metadata excludes customer addresses, payment data, secrets and content bodies.
- No privileged environment keys, raw payment card data, invented successful integrations or open payment webhook.

Latest Supabase security advisor returned **no findings**. Dependency audit returned **zero vulnerabilities**. These checks do not replace penetration testing.

## Boundaries before launch

The current Content Security Policy permits inline scripts/styles for the Next.js runtime. Introduce nonce-based CSP after testing all production integrations. Configure edge/WAF rate limits for public routes and auth abuse protection in Supabase; database per-user limits do not replace network-level limits.

Confirm Supabase password policy, email confirmation, custom SMTP, redirect allowlist, auth rate limits and breached-password protection. MFA enrollment/challenge UI is implemented; staff role assignment requires an authorized operator and no bootstrap administrator was invented.

Configure monitoring, alert ownership, recovery procedures, data retention/deletion requests, privacy contacts and processor agreements. Confirm Ireland data residency with RIWAY. Conduct independent penetration testing, cross-browser accessibility testing and load testing before public launch. No claim of legal, medical or PCI compliance is made by implementation alone.

## Reporting and credentials

Report vulnerabilities privately to the designated RIWAY operator once appointed. Rotate credentials through provider dashboards, revoke affected sessions and review audit records. Never paste service-role keys, database passwords or webhook secrets into issue descriptions or frontend variables.
