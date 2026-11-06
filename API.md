# Application API

## Stripe checkout addition

`POST /api/checkout` retains the unavailable response by default. With explicitly configured Stripe, it validates accepted terms/version, uses the authenticated user's transactional `create_order`, snapshots payment state through service-only RPCs and returns a hosted checkout URL. No browser price/amount or sponsor override is accepted. `POST /api/payments/resume` resumes only the current user's order. `POST /api/webhooks/payments` validates bounded raw signed payloads and reconciles a freshly retrieved canonical Stripe session before acknowledgement. `POST /api/internal/payments` requires a separate bearer secret and processes at most five due payment attempts. `/admin/payments` exposes role/market/MFA-scoped operational status, never keys. See `STRIPE.md`; live defaults remain disabled and provider acceptance is pending.

## Added in the provider/tenant implementation

- `/operations`: authenticated store portal; RIWAY super admins oversee tenants; owners configure locations/SKUs/members; inventory users record stock movements; viewers read. Database permissions enforce MFA and tenant isolation for every action.
- `POST /api/referral`: same-origin authenticated referral claim, shared by both auth providers.
- `POST /api/webhooks/clerk`: verifies the Clerk signature and disables deleted identities through a service-only RPC; returns 503 when unconfigured.
- `POST /api/internal/notifications`: bearer-secret worker endpoint (minimum 32-character configured secret), service-only leased outbox processing; returns 503 when unconfigured.
- RPCs `create_tenant`, `setup_tenant_inventory`, `mutate_tenant_stock`, `is_platform_admin`: RLS-aware, server-validated tenant operations. No browser table mutation grants exist for stock, membership, or journal tables.

See `PROVIDER-IMPLEMENTATION.md` for provider variables, job lease/idempotency behavior and rollout. These additions have not been deployed.

Errors use `{ "error": { "message": "..." } }`. JSON mutations validate Origin against the actual request origin. Server Actions use Next.js origin protections, validate fields and retain Supabase/RLS enforcement. Account and API responses are private/no-store. Never use a service-role key in a browser.

| Endpoint                    | Access                   | Result                                                                     |
| --------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| GET /api/health             | Public                   | Minimal database readiness; commerce explicitly disabled                   |
| POST /api/market            | Same origin              | Valid PH/SG/MY market preference cookie                                    |
| GET /api/cart               | Signed in                | Own saved bag                                                              |
| PUT /api/cart               | Signed in, same origin   | Validated own bag; DB limit 30 writes/minute                               |
| POST /api/checkout          | Same origin, signed in   | HTTP 409 unavailable; no order/payment created                             |
| POST /api/webhooks/payments | Unconfigured             | HTTP 503; no webhook accepted                                              |
| POST /api/admin/media       | Staff + MFA, same origin | Private image upload; 3 MiB web limit, magic-byte validation               |
| GET /api/admin/export       | Staff + MFA              | Latest 1,000 authorized orders as CSV; formula-prefix escaping             |
| GET /auth/callback          | PKCE auth flow           | Exchanges code, redirects only to account or approved password-reset route |

Server Actions cover profiles, addresses, support, event registration, product/content editing, pricing, inventory and support resolution. Staff updates remain restricted by market and role even if a caller invokes Supabase directly.

## Database RPCs

- `lookup_distributor(c)`: public projection of active, verified distributor display name/code/market only.
- `claim_referral(c)`: authenticated immutable first referral, rate limited.
- `adjust_inventory(p,m,d,r)`: operations/admin + MFA, constrained stock adjustment.
- `create_order(m,items,delivery,key,terms)`: authenticated atomic order routine behind market/payment/product gates. Not called by web checkout while payment work is deferred.
- `release_expired_reservations()`: service-role maintenance only, never a browser action.

There is no invented RIWAY, courier, payment or compensation endpoint. Provider API paths and webhook contracts will be added only after the client supplies approved documentation.
