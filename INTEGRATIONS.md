# Future API integration handoff

**User direction, 2026-11-02: skip payment features for now; client API documentation will follow.** No gateway was selected, no merchant account was created, no financial transaction was sent and no fake payment success is exposed.

## Ready seams

`src/services/integrations.ts` defines PaymentAdapter and MemberAdapter contracts. Disabled implementations throw a named IntegrationUnavailable error. The payment webhook route returns 503. Checkout always fails closed at the application boundary. Database order, item, reservation, price, approval and sponsor constraints are implemented and tested independently in rollback-only transactions.

`integration_events` is a starting record for durable processing. It is not a running queue worker, retry scheduler or completed outbox implementation. Before connecting a provider, implement delivery ownership, retries/backoff, dead-letter handling, idempotent external references, reconciliation and operational monitoring.

## Client information required

| Provider          | Required contract and decisions                                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RIWAY members     | Authentication, sandbox URL, member lookup, verified sponsor/placement rules, qualifying-package tiers, enrollment inputs, consent versions, change/reconciliation strategy, rate limits and error codes                           |
| Compensation      | Accepted order-volume fields, decimal precision, order/refund/cancellation event contracts, external idempotency reference, acknowledgement/retry rules; calculations remain entirely with RIWAY                                   |
| Payment, deferred | Approved gateway and merchant markets, hosted/tokenized checkout, currency and method eligibility, signature algorithm/raw-body validation, event ordering, status API, refunds, sandbox credentials and settlement reconciliation |
| Courier           | Markets, service areas, rate/tax inputs, shipment/label contract, tracking webhook authentication, collection workflow and failure/cancellation rules                                                                              |
| Email/SMS         | Approved providers/templates, consent rules, sender registration, delivery events, retries and suppression handling                                                                                                                |
| SSO               | RIWAY identity provider, OIDC/SAML metadata, callback allowlist, verified account linking and role mapping                                                                                                                         |

Do not send production identities, addresses or orders to an unapproved provider. Do not guess API paths from these interfaces. The interfaces represent application needs, not claims that RIWAY already exposes matching endpoints.

## Integration sequence

1. Review client documentation; resolve contract/business-rule gaps and data location.
2. Add versioned input/output schemas and sanitized fixtures from approved examples.
3. Implement a provider adapter in a server-only module with secret environment configuration, timeouts and redacted errors.
4. Validate existing members and reconcile authoritative sponsors before enabling membership-dependent orders. The current local referral record is a verified-introduction mechanism, not a replacement for RIWAY placement records.
5. Test duplicate submissions, malformed responses, timeouts, stale sponsor records, retries and reconciliation.
6. For payments, add raw-body signature verification, gateway status verification, amount/currency matching, unique event IDs, monotonic payment transitions and reservation conversion/release. Never mark paid from a browser redirect.
7. Implement taxes, shipping, qualifying-package mapping and versioned enrollment consent using approved policies.
8. Schedule reservation expiry and durable workers with alert ownership.
9. Run sandbox order-to-back-office and provider tests, then client UAT.
10. Enable a market only after policy, product registration, pricing, stock, terms, integrations and operational readiness are all approved. An environment flag alone cannot open checkout.

## Other deferred scope

Recurring subscriptions need confirmed intervals, skip/pause/cancel rules and a compatible merchant contract. Promotions require approved eligibility/timing/voucher rules. No arbitrary discount, commission, tax, refund or subscription policy has been encoded as an official RIWAY rule.
