# Stripe checkout integration

## Planner review and latest direction

The official Claude Stripe plugin was installed; project MCP configuration points to `https://mcp.stripe.com`. Stripe MCP is connected in the working chat and its implementation planner was called and accepted for hosted, browser-based, one-time physical-goods Checkout. Guide `iguide_61Vi6FkCs48l8dj0z41H3N2KvLZ5N` matches this integration. Review retained the official current SDK/API, dynamic methods, required signed webhooks, idempotent fulfillment and sandbox-first testing; a stable `integration_identifier` was added. Adaptive Pricing remains off to preserve approved market currency/totals until a compatible presentment policy is agreed.

The user initially requested Payments and Tax, then explicitly said to skip Tax for now. Checkout sets `automatic_tax.enabled=false`. Read-only inspection of Riway sandbox found Tax Settings pending with head office missing, no registrations and threshold results with no computation timestamp or locations. No address, tax classification, registration, tax rate or legal obligation was invented or changed. Those observations do not determine tax obligations, and no successful tax calculation is claimed.

An API key was pasted in chat. Do not copy it into source or logs. Rotate the exposed test key in Stripe and use a least-privilege restricted key for the deployed service. Server credentials belong in Cloudflare encrypted secret bindings.

Stripe is the first selected payment provider. The integration uses the official `stripe@23.1.0` SDK and pinned API `2026-10-28.endive`, fetch transport and asynchronous Web Crypto signature verification for Cloudflare. Hosted Checkout collects payment details; no card field or card data is stored by RIWAY. Available methods follow the merchant account's Stripe Checkout configuration; no local wallet is claimed to be supported without account/provider acceptance.

## Implemented flow

1. The signed-in customer accepts the displayed terms version. `/api/checkout` validates origin and a bounded body, checks configuration and current terms, then calls the user's `create_order` RPC. Approved market, verified sponsor, current database prices, quantity and stock checks remain authoritative.
2. A service-only RPC snapshots the order into private Stripe state. It binds owner, amount, currency, items, mode, return origin, UUID idempotency key and a fixed 40-minute session expiry. Terms are selected by market; live payments reject draft versions. No browser can prepare sessions or mark orders paid.
3. Stripe creates a hosted session with the same parameters/key on retry. The attempt persists before the API call; session binding cannot overwrite a faster paid webhook. A timeout never proves that no session or charge exists. Account order details can resume the same order.
4. `/api/webhooks/payments` verifies the exact raw body/signature and mode with the SDK, then retrieves Stripe's canonical session. A single database transaction checks order/attempt/session references, amount/currency/mode and payment state, deduplicates the event and updates stock/order state.
5. Unpaid completion retains stock as processing. Confirmed payment deducts on-hand/reserved inventory once and removes reservations. Expiry or confirmed asynchronous failure releases stock once. Paid/terminal states do not regress. A payment reported after closure is flagged for review, without fulfillment against released stock.
6. The minute Worker calls a bearer-authenticated reconciliation endpoint independently of email. Service-only batches of five pending attempts are deferred for two minutes after claim. Known sessions are retrieved; unknown creation outcomes retry the original idempotency key. Provider/recording failures remain reserved and are flagged in `/admin/payments`; they must not be released on a local timeout alone. Webhook settlement and configured reconciliation remain available when new checkout is disabled.

The legacy expiry function also now releases every line of an expired non-Stripe order; its previous order-status update could strand later lines. It skips all Stripe-backed orders, which need provider reconciliation.

## Current activation boundary

Committed defaults are `PAYMENT_PROVIDER=disabled`, `STRIPE_MODE=test` and `STRIPE_LIVE_APPROVED=false`. No merchant account, real key, payment or market approval is fabricated. Shipping/tax rates, membership enrollment/compensation, subscriptions, refunds and commercial acceptance are separate unfinished proposal workflows. This release is not the complete proposal.

Configuration requires:

- `STRIPE_SECRET_KEY`: matching `sk_test_...`/`rk_test_...` or separately approved live key.
- `STRIPE_WEBHOOK_SECRET`: endpoint signing secret; never a publishable key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only access to payment RPCs.
- `PAYMENT_WORKER_SECRET`: random secret of at least 32 characters.
- Existing exact HTTPS `NEXT_PUBLIC_SITE_URL` and Supabase URL.
- `COMMERCE_TERMS_VERSION`: must match `markets.checkout_terms_version` and the version the customer accepted.
- For live creation, `STRIPE_LIVE_APPROVED=true`, non-draft terms and all existing market/product/pricing/sponsor/stock gates.

Stripe's supported merchant-country list currently includes Singapore/Malaysia and omits the Philippines. An eligible existing RIWAY merchant account and approved product/business eligibility are prerequisites; this code does not create a company/account or assert eligibility. Do not change gates merely to demonstrate a payment.

## Secure setup

Run `npm run setup:providers` locally. Enter a Stripe test secret key and the designated Supabase service key in its loopback-only form; values are never returned to the browser. An existing endpoint's signing secret can also be entered. Never paste keys in chat/issues or put them in `NEXT_PUBLIC_*` variables.

`node scripts/setup-stripe.mjs --configure-webhook` can create a sandbox endpoint for the exact configured site and save the returned secret in ignored `.env.local`. If an enabled endpoint already exists, enter its signing secret; the script does not rotate/delete it. The endpoint needs these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.

After validating the target Worker/account, add `--publish-secrets` to publish only four server secrets through Wrangler stdin. It keeps commerce flags unchanged. The script accepts test keys only. Review service-key rotation dependencies if that credential is shared with notification processing.

Use a designated sandbox/staging database with synthetic approved products/sponsors, price/stock and test identities for real Stripe test-card acceptance. Rollback-only SQL is useful but does not prove external delivery. Before live activation, finish tax/shipping/legal/member policy decisions, merchant eligibility, every payment-method acceptance flow, independent security/UAT and monitoring/operating ownership. A Stripe receipt is not by itself a validated local tax invoice.

## Verification

Tests exercise the official SDK's signed raw payloads, altered/stale/mode-mismatched signatures, safe redirect destinations, immutable prices/expiry/keys, ambiguous network retry, order ownership, callback authority, webhook retry responses and scheduler behavior. `tests/security/stripe.sql` is rollback-only and runs with every migration in both embedded PostgreSQL and real PostgreSQL CI. It covers service-only transitions, owner isolation, amount/mode mismatches, unpaid completion, duplicate/delayed events, stock reconciliation, failure/expiry release, late-charge review and webhook/bind races.

Actual Stripe sandbox transactions are not counted as passed until a real test account/key and designated sandbox fixtures are supplied. Never infer paid status from the success URL.

## Official references

- [Checkout fulfillment and asynchronous events](https://docs.stripe.com/checkout/fulfillment)
- [Checkout Sessions API](https://docs.stripe.com/api/checkout/sessions/create)
- [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Stripe SDK webhook verification](https://github.com/stripe/stripe-node#webhook-signing)
- [Merchant availability](https://stripe.com/global)
