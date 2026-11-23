# Xendit and xenPlatform integration

Status, 23 November 2026: implemented and tested locally with mocks and an embedded PostgreSQL database. **Not activated.** No Xendit account, key, sub-account, channel or webhook has been configured, and no sandbox or live payment has been made. Stripe is unchanged and remains the default gateway.

## Terms

| Term | In RIWAY |
| --- | --- |
| **Gateway** | The payment provider: Stripe or Xendit. One gateway per order. An order with a Stripe attempt cannot start Xendit, and the reverse is also refused. |
| **Payment method / channel** | A Xendit channel code chosen by the customer, e.g. `GCASH`, `QRPH`, `BPI_ONLINE_BANKING`, `CIMB_FPX`, `CARDS`. Online banking and FPX ask the customer to pick a bank. |
| **Merchant account** | The Xendit account that processes a market's payments: the RIWAY xenPlatform master account, or one mapped sub-account sent as the `for-user-id` header. |
| **Settlement / payout bank account** | Where Xendit pays out merchant funds. Configured in the Xendit dashboard only. RIWAY never stores, reads or changes it. |

Choosing a bank never gives RIWAY access to the customer's bank account and never debits it automatically. The customer signs in to their own bank (or FPX, or their e-wallet) on Xendit's hosted page and approves the payment there.

## Architecture

Repository evidence:

- RIWAY sells as one merchant in three markets: PH/PHP, SG/SGD and MY/MYR (`public.markets`).
- Every order belongs to exactly one market and currency. A cart cannot span merchants, so one order is never split across accounts.
- Distributors are attributed sponsors, not payees. Compensation stays with RIWAY's own system.

Routing therefore maps **market → Xendit account**. **RIWAY decision (23 November 2026): each market's live payments go to its own xenPlatform sub-account.** The database refuses a live routing row on the master account. Test mode may still use the master account for quick sandbox checks.

```
RIWAY xenPlatform master account (platform only; no live market payments)
  ├─ PH market → PH sub-account (for-user-id)
  ├─ SG market → SG sub-account (no documented SG channels yet; disabled)
  └─ MY market → MY sub-account
```

`private.xendit_market_accounts` stores, per market and per test/live mode:

- the account type, sub-account ID and the Xendit status entered by the admin;
- the channels enabled for that account;
- whether Xendit is offered at checkout.

A sub-account can be enabled only when its status is `LIVE`. That rule is a database constraint.

Each payment attempt snapshots its account when it is created, so a later routing change never moves an existing payment. The browser sends only `{gateway, channel}`. The receiving account, amount, currency and items always come from the database.

No split rules, commissions or automated payouts are implemented, because no RIWAY requirement asks for them.

### Checkout approach

The integration uses **Payment Sessions** in hosted `PAYMENT_LINK` mode, which Xendit's migration guide names as the replacement for legacy Invoices:

- `POST /sessions` with `session_type: PAY`, `reference_id` set to the attempt UUID, the amount in major units, the currency, the country and HTTPS return URLs.
- `allowed_payment_channels: [<selected channel>]` restricts the hosted page to the customer's choice.

Limitation: Xendit documents this field as the list of channels the hosted page offers. It does not document skipping the page entirely, so the customer still sees Xendit's page, showing only the chosen channel. Bank-transfer instructions, QR codes, references and redirects appear on that page. RIWAY shows the method, expiry time and verified status on the order page.

### Sequence

```
Customer          RIWAY (Next.js Worker)                     Postgres (service RPC)            Xendit
   | review + choose gateway/method/bank                          |                               |
   |--POST /api/checkout {items, quoteHash, payment}-->|          |                               |
   |                  | create_membership_commerce_order (prices, stock, sponsor, voucher)        |
   |                  | check channel ∈ catalogue ∩ enabled, amount limits                        |
   |                  |--prepare_xendit_payment------------------>| lock order, snapshot amount,  |
   |                  |                                           | account, channel (1 active)   |
   |                  |--POST /sessions (for-user-id from DB)--------------------------------->|
   |                  |<-------------------------------------------- ps-…, payment_link_url ---|
   |                  | verify reference/amount/currency/host     |                               |
   |                  |--bind_xendit_payment--------------------->|                               |
   |<-- redirect to checkout.xendit.co ---|                       |                               |
   |== pays on Xendit / bank / e-wallet ==========================================================>|
   |<-- return to /account/orders/{id}?payment=return ("waiting for confirmation", never "paid")  |
   |                  |<--webhook payment_session.completed, x-callback-token -----------------|
   |                  | constant-time token check                 |                               |
   |                  |--GET /sessions/{id} (stored for-user-id)------------------------------->|
   |                  |<------------------------------------------- canonical status/amount ---|
   |                  |--apply_xendit_payment_event-------------->| dedupe, match amount/currency |
   |                  |                                           | /mode/order; deduct stock once|
   |                  |                                           | → paid / expired / review     |
   |                  | (every minute) pending_xendit_payments → same GET + apply; retry unknown creation;
   |                  |  cancel extra open sessions on paid orders; release abandoned orders   |
```

### State mapping

| Xendit session (canonical, from `GET /sessions/{id}`) | RIWAY attempt phase | Order effect | Customer sees |
| --- | --- | --- | --- |
| (create not confirmed) | `preparing` | stock held | "being set up" |
| `ACTIVE` | `open` | stock held | "Awaiting payment", expiry, Resume / Switch method |
| `ACTIVE` after return redirect | `open` | none | "Waiting for Xendit to confirm; do not pay again" (the processing state) |
| `COMPLETED` + `payment_id` | `paid` | stock deducted once, order `paid` | "Payment confirmed" |
| `COMPLETED` after expiry, on a second attempt, or on an unbound session | `review` | not fulfilled again; flagged | "Needs review; do not pay again" |
| `EXPIRED` | `expired` | stock released, order `cancelled`/`failed` (unless another attempt is payable) | "expired" |
| `CANCELED` (customer switched channel) | `canceled` | stock kept for the next attempt; released by the sweep after 15 minutes if no payable attempt remains | "cancelled" |

Xendit reports individual failed attempts within a session through `payment.failure`, but the session stays `ACTIVE` and the customer can retry on the same page. RIWAY therefore has no separate terminal "failed" phase for Xendit. A session that ends unpaid ends as `EXPIRED`.

## Reliability and security

- **Server-only secrets.** `XENDIT_SECRET_KEY` and `XENDIT_WEBHOOK_TOKEN` are read on the server only and never placed in `NEXT_PUBLIC_*`. The service never logs or returns them.
- **Trusted amounts.** Prices, discounts and totals come from the existing order RPC. The snapshot checks that line totals equal the order total. Minor units are integers throughout; conversion to major units happens only at the API boundary and is checked exactly on the way back.
- **No duplicate payments.** A unique partial index allows one `preparing`/`open` attempt per order. Repeated clicks reuse it. Changing the payment method reuses the same order, because the payment choice is not part of the order idempotency key, and Xendit must confirm the old session as `CANCELED` before a new one opens.
- **Uncertain creation.** Xendit documents no idempotency header for `/sessions`, so none is relied on. After a timeout the attempt stays `preparing` with the same `reference_id`, and the reconciler retries creation. A session created by a lost request was never shown to anyone, so nobody can pay it, and it expires on its own. If such a session reports `EXPIRED` it is ignored; if it ever reports `COMPLETED` it is flagged for review.
- **Webhook authentication.** The `x-callback-token` header is compared in constant time with the dashboard verification token. The payload is used only to find the session. Status, amount, currency and reference are re-read with `GET /sessions/{id}` using the attempt's stored `for-user-id`, so a session from another account is not found.
- **Duplicate and out-of-order events.** Events are deduplicated in the database (`private.xendit_events`). Terminal phases never regress, so stock moves at most once. Non-2xx responses make Xendit retry (up to six times over about 24 hours).
- **Fulfillment once.** Only the first confirmed payment deducts stock and marks the order paid. A late payment, a second payment or an excess payment is flagged in `/admin/payments` for refund or reconciliation.
- **Local expiry.** Local expiry and customer cancellation are refused for orders that have a Xendit attempt; only provider reconciliation releases them, as with Stripe.
- **Tenant isolation.** Staff can read payments and routing only for markets where they hold admin/operations roles with MFA. Changing routing requires the market admin role with MFA and writes an audit log entry.
- **Settlement is separate.** RIWAY tracks customer payment confirmation only. Settlement and payout status live in the Xendit dashboard.

## Files

| Area | Files |
| --- | --- |
| Database | `supabase/migrations/20261123090000_xendit_payments.sql` |
| Channels / config | `src/lib/xendit-channels.ts`, `src/lib/xendit-config.ts`, `src/lib/domain.ts` (`paymentSelectionSchema`), `src/lib/stripe-config.ts` |
| Service | `src/services/xendit-payments.ts` |
| Routes | `src/app/api/checkout/route.ts`, `src/app/api/payments/resume/route.ts`, `src/app/api/webhooks/xendit/route.ts`, `src/app/api/internal/payments/route.ts`, `src/app/api/health/route.ts` |
| UI | `src/components/payment-method.tsx`, `src/components/checkout.tsx`, `src/app/checkout/page.tsx`, `src/components/order-payment.tsx`, `src/app/account/orders/[id]/page.tsx` |
| Admin | `src/app/admin/payments/page.tsx`, `src/app/admin/payments/xendit-actions.ts`, `src/components/xendit-routing-form.tsx` |
| Ops | `deployment/scheduled-payments.ts`, `wrangler.jsonc`, `.env.example`, `scripts/test-postgres.mjs` |
| Tests | `tests/security/xendit.sql`, `tests/unit/xendit-database.test.ts`, `tests/unit/xendit-payments.test.ts`, `tests/unit/xendit-routes.test.ts`, `tests/unit/xendit-checkout-ui.test.tsx` |

## Environment

```
PAYMENT_PROVIDERS=stripe,xendit   # comma list; supersedes PAYMENT_PROVIDER
XENDIT_MODE=test                  # test | live
XENDIT_SECRET_KEY=                # secret: xnd_development_… (test) or xnd_production_… (live)
XENDIT_WEBHOOK_TOKEN=             # secret: dashboard webhook verification token
XENDIT_LIVE_APPROVED=false        # live creation also needs non-draft terms
PAYMENT_WORKER_SECRET=            # existing, ≥32 chars
SUPABASE_SERVICE_ROLE_KEY=        # existing, server only
```

Publish `XENDIT_SECRET_KEY` and `XENDIT_WEBHOOK_TOKEN` as encrypted Worker secrets, e.g. `wrangler secret put XENDIT_SECRET_KEY`, which reads the value from stdin. Prefer a key with only the permissions needed: Money-in write, plus xenPlatform read if you use sub-accounts.

## Admin setup

1. **Test and live separation.** Xendit issues separate keys for test mode and live mode. Use `XENDIT_MODE=test` with a `xnd_development_` key in every non-production environment. Routing rows are stored per mode, so test settings never route live payments.
2. **xenPlatform activation (required).** An account admin activates xenPlatform at https://dashboard.xendit.co/xenplatform-activation. Live payments cannot be routed until each market has a sub-account.
3. **Merchant onboarding.** Create one OWNED or MANAGED sub-account per market (PH, MY, and SG once channels are confirmed) in the dashboard, or with `POST /v3/accounts`, which needs an Account Write key. Wait until its status is `LIVE`. In test mode, sub-accounts are created already `LIVE`. Copy its account ID.
4. **Payment channels.** In https://dashboard.xendit.co/settings/payment-methods, activate the channels for the account that will process the market (each sub-account separately).
5. **RIWAY routing.** A market admin with MFA opens `/admin/payments` → *Xendit account routing* for that market and mode, then:
   - chooses the sub-account type (live mode offers no master option);
   - pastes the sub-account ID and status;
   - ticks exactly the channels activated in step 4;
   - ticks *Offer Xendit at checkout*.
6. **Webhooks.** In Dashboard → Settings → Webhooks, set the Payment Sessions URL to `https://<site>/api/webhooks/xendit`, and copy the verification token into `XENDIT_WEBHOOK_TOKEN`. For sub-accounts, keep webhooks going to the master account (the default); test-mode sub-accounts require it.
7. **Enable.** Set `PAYMENT_PROVIDERS` to include `xendit`, deploy, and check that `/api/health` reports `"xendit":"test"`. The market's existing sales and payment gates must also be open.

## Verification

### Automated, passed locally on 23 November 2026

- `npx vitest run`: 50 files, 495 tests passed. That is 436 existing tests unchanged, plus 59 new ones:
  - end to end (`tests/unit/xendit-flow.test.ts`): the real service, webhook and worker routes against the real migration and a fake Xendit API that enforces account routing. Covers bank-channel payment on the sub-account, repeated clicks, forged/duplicate/out-of-order webhooks, a session planted in another account, a tampered provider amount, a lost create request reconciled by the worker, channel switching, Xendit refusing a channel, disabled channels, expiry with late payment, and a missed webhook recovered by polling;
  - service: refused creation closes the attempt, rate limits and 5xx stay uncertain, no expired expiry is sent, provider error codes are sanitized, channel gates, amount limits, exact money conversion, request shape, host allowlist, `for-user-id` from the database, tampered responses, timeout, channel switch with cancel, 422 reconciliation, foreign-account 404, foreign reference;
  - routing admin: live master refused, live sub-account saved, test master allowed, undocumented channels and missing MFA refused;
  - routes: gateway selection, browser-supplied routing and amounts ignored, unconfigured or incomplete gateway, invalid channel, forged/missing token, deduplication key, foreign events, retry on failure;
  - UI: bank selector only for bank methods, amount filtering, redirect allowlist, return page never shows paid, state messages;
  - database suite (`tests/security/xendit.sql`, run in PGlite): browser denial, ownership, disabled channel, missing live routing, duplicate submission replay, single gateway per order, tampered amount/currency/mode/order, duplicate and out-of-order webhooks, expiry release, late success review, channel-switch race with excess-payment review, orphan sessions, local-expiry protection, abandoned release, owner/tenant isolation, MFA admin routing, the LIVE sub-account rule, live routing refused on the master account, routing snapshots and audit.
- `tsc --noEmit` is clean.
- `next build --webpack` compiled, and `/api/webhooks/xendit` and `/admin/payments` were generated. The build command then exited with Next.js's own security-advisory notice for the installed version; that is separate from this change.
- Existing `stripe.sql`, `cancellation.sql` and `commerce_checkout.sql` pass with the new migration applied.
- Hosted rollback rehearsal (23 November 2026): the migration plus the full Xendit suite ran in one transaction on the hosted Supabase database and passed, then rolled back. Checked afterwards: no Xendit tables, functions, test users, products or audit rows remained, the Stripe and expiry functions were unchanged, and all market sales/payment gates stayed closed.

### Not yet run

- The real-PostgreSQL CI runner (`npm run test:postgres`) was still running when this was committed.

### Sandbox checklist (needs Xendit test credentials and dashboard access)

- [ ] `XENDIT_MODE=test`, a test key and the webhook token are set; `/api/health` shows `xendit: test`.
- [ ] The PH test routing row is enabled with GCASH and one online-banking bank activated in the dashboard.
- [ ] Checkout → E-wallet → GCash opens `checkout-staging.xendit.co` showing only GCash; the order page shows "Awaiting payment".
- [ ] Complete the test payment; the `payment_session.completed` webhook arrives; the order becomes `paid`; stock is deducted once.
- [ ] Resend the same webhook from the dashboard → still 200, no second deduction.
- [ ] A request with the wrong `x-callback-token` → 401.
- [ ] Online banking → choose bank → the hosted page shows only that bank.
- [ ] Switch method from the order page → the old link stops working (`CANCELED`) and a new link opens for the same order.
- [ ] Let a session expire, or create one with a short expiry → `payment_session.expired` → order cancelled, stock released.
- [ ] Sub-account: create a test sub-account, route PH to it, pay, and confirm in the dashboard that the transaction sits on the sub-account.
- [ ] Block the network during creation → the attempt stays `preparing` → the minute worker creates and binds a session.
- [ ] Confirm the exact amount and decimal handling Xendit accepts for PHP and MYR, and whether a session webhook carries the sub-account or master `business_id`. The docs do not say.

## Open items

- **Credentials and dashboard.** Xendit test and live keys, the webhook token, xenPlatform activation, sub-account creation and channel activation all need RIWAY's Xendit dashboard access. None of it has been done.
- **Decided 23 November 2026: one sub-account per market for live payments.** Enforced by a database constraint, the admin action and the admin form.
- **Still open: OWNED or MANAGED sub-accounts.** OWNED sub-accounts are run by the RIWAY platform and cannot hold their own API keys. MANAGED ones typically belong to an entity that goes through its own Xendit verification. Both are supported; RIWAY should choose per country entity with Xendit. Each sub-account's payout bank account is set in Xendit only.
- **Singapore.** Xendit's channel documentation has no Singapore section. SG stays without Xendit channels until Xendit confirms availability for RIWAY.
- **Assumptions to verify in the sandbox:**
  - the `xnd_development_`/`xnd_production_` key prefixes;
  - the `dev.xen.to`/`xen.to` link hosts;
  - that `allowed_payment_channels` with one code shows only that channel;
  - limits for channels listed without one (`null` in the catalogue);
  - the summarized FPX codes (`MAYB2U_FPX`, `OCBC_FPX`, `PUBLIC_FPX`, `RHB_FPX`, `UOB_FPX`).
- **Not implemented:**
  - refunds;
  - direct-debit channels, which need account linking;
  - Xendit Components (embedded) mode;
  - split rules and commissions;
  - automatic sub-account status sync. Admins enter the status; the owned-account status webhook could automate it.

## Official references (read 23 November 2026)

- Documentation index: https://docs.xendit.co/llms.txt
- Create session: https://docs.xendit.co/apidocs/create-session
- Get session: https://docs.xendit.co/apidocs/get-session
- Cancel session: https://docs.xendit.co/apidocs/cancel-session
- Session webhooks: https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session
- Webhook handling and `x-callback-token`: https://docs.xendit.co/docs/handling-webhooks
- Webhook retries: https://docs.xendit.co/apidocs/webhook-behavior
- Authentication: https://docs.xendit.co/apidocs/quick-setup.md
- Migrating from Invoices to Payment Sessions: https://docs.xendit.co/docs/migrate-to-payment-session
- xenPlatform overview: https://docs.xendit.co/docs/xenplatform-overview
- Payments for sub-accounts (`for-user-id`): https://docs.xendit.co/docs/accepting-payments-for-sub-accounts
- Create account v3: https://docs.xendit.co/apidocs/create-account-v3
- Split payments (not used): https://docs.xendit.co/docs/split-payments
- Channel list: https://docs.xendit.co/docs/available-payment-methods
- API keys and test/live separation: https://docs.xendit.co/docs/api-keys
