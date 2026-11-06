# Database

## Pending provider/tenant migrations — 5 November 2026

Three new migration files add canonical UUID/Clerk identity mapping and per-asset storage backends; tenant roles/locations/SKUs/stock journals and atomic inventory RPCs; and a private durable notification outbox. They have been replayed locally in embedded PostgreSQL, including all three existing security scripts, but are not applied remotely. See `PROVIDER-IMPLEMENTATION.md` for exact filenames, identity-FK implications, provisioning and rollback. Tenant stock is independent from the existing corporate checkout inventory. New UUID identity helpers replace native-only `auth.uid()` calls in existing policies/functions while preserving grants and scopes.

Project: `riway` / `skiimthwadramxdzhgoy`. PostgreSQL 17, eu-west-1. Existing application schema was empty before development. Migrations were applied through the connected Supabase tool; local filenames were aligned to the resulting remote history to prevent accidental reapplication.

| Applied version | Change                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------ |
| 20261102073035  | Initial platform tables, RLS, order and stock functions, two product identities            |
| 20261102074502  | Scoped write policies, constraints, rate limits, referral functions and expiry maintenance |
| 20261102074752  | SHA-256 idempotency fingerprint and membership-price consistency under concurrent updates  |
| 20261102074822  | Rate-limit parameter ambiguity fix, verified by transactional tests                        |
| 20261102075048  | Private editorial media metadata and Storage policies                                      |
| 20261102080507  | Restrict customer order/support/member visibility to operations and admin staff            |

## Entities

- Identity: profiles, addresses, staff_roles; Supabase Auth owns credentials.
- Catalogue: products, product_offers, markets. Offers hold nullable retail/member minor-unit prices, regulatory evidence and limits.
- Inventory: inventory, inventory_movements, inventory_reservations.
- Customer: carts, memberships, sponsor_attributions, distributor_profiles.
- Orders: orders, order_items; prices and product names are snapshotted. Ownership/idempotency keys are unique.
- Editorial/community: content_entries, event_registrations, media_assets, support_tickets.
- Operations: audit_logs, integration_events; private.rate_limits is not exposed through the Data API.

All application tables in `public` enable RLS. No reservation table grants are given to browser roles. Customer tables restrict ownership using `auth.uid()`. Staff authorization checks a non-user-editable role table plus `aal2`. `private` is not in the API's exposed schema list.

## Critical routines

`create_order`: locks an idempotency key, checks market/product approvals and prices, locks stock in deterministic product order, reserves inventory and writes order/items atomically. Replays return the same order; changed payloads with the same key fail. Duplicate products, bad addresses, excessive quantities, missing sponsor and insufficient stock fail the transaction. No commissions are calculated.

`adjust_inventory`: requires operations/admin access for the market, records a movement and prevents stock dropping below reservations.

`claim_referral`: requires a signed-in customer, a verified active distributor and no self-referral. A conflicting introduction never overwrites the stored sponsor. Authoritative reconciliation with existing RIWAY sponsor records remains pending the client API.

`release_expired_reservations`: service-role-only maintenance function. Releases expired unpaid reservations and cancels the pending order. Schedule it before any live checkout is enabled; it is not currently scheduled because commerce is disabled.

Privileged functions are in the private schema, use an empty search path, check caller identity/permissions and have PUBLIC execution revoked. Public API wrappers are SECURITY INVOKER. The maintenance routine is also invoker-only and denied to browser roles.

## Data and seed policy

Only PH/SG/MY market identities, two verified public product names and informational review copy were installed. Prices are NULL, stock is zero, all sales/regulatory/payment gates are false. No real customers, staff, members, sponsors or transactions were created. Stories and events are empty until approved content is supplied.

## Migration procedure

Use `npx supabase migration new <name>`, inspect SQL, test against an isolated environment and review RLS before applying. Check remote migration history before pushing. Do not rerun initial migrations against the already configured project. The CLI is pinned to 2.81.3 because the latest release attempted an unsupported home-directory write; its vulnerable transitive tar dependency is overridden to a patched release. Audit currently reports zero vulnerabilities.

Local `supabase/config.toml` is generated for local development, not an update to hosted auth settings. Docker-based local migration replay and backup restoration have not been run. Backups, 30-day retention, storage backup/export and recovery objectives need client/operator configuration and restore testing before launch.
