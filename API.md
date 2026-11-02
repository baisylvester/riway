# Application API

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
