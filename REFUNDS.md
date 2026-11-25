# Returns and refund operations

This is an implemented, locally verified candidate workflow. No migration,
merchant refund, provider webhook configuration or live activation was performed.
Approved PH/SG/MY policy versions, actual merchant/channel acceptance, tax invoices,
credit notes and RIWAY partial-volume/member adjustments remain outstanding.

## Customer and staff workflow

Customers open a return, refund review or paid cancellation from their own paid
order. One case can be open per order; an exact intake retry returns that case.
The case does not itself stop fulfilment or move money. Operations must review
the case before dispatch; approval of a paid cancellation requires the complete
remaining refundable amount. The ordinary unpaid cancellation path is unchanged.

At `/admin/returns`, market admin/compliance staff with MFA approve an immutable
refund policy with an approval reference, customer-facing terms and explicit
partial-refund rule. Nothing is seeded as an approved commercial policy. Current
terms are bound into quotes and frozen on orders; policy withdrawal invalidates
an old unaccepted quote and preserves accepted order terms. Legacy orders need a
current approved policy and staff review of the original Terms of Sale.

The same staff approve positive allocations against the original paid order
lines. Amounts are entered in currency units, with at most two decimal places.
The database serializes approval on the order and caps each line and the order
against successful and still-held refunds. Exact approval-reference retries
return the same refund; changed allocations are refused. Only one unambiguous
original paid gateway can be selected. Gateway, mode, payment ID, Xendit merchant
account, amount and currency are frozen. Undispatched approvals can be cancelled;
dispatched/uncertain refunds stay held for canonical reconciliation.

Admin/operations separately record confirmed physical receipts (including bonus
goods), a unique receipt reference and restock/quarantine/discard disposition.
The original frozen physical manifest caps all receipts across cases. Exact
retries credit once. Refund settlement never restocks goods. Quarantined and
discarded goods do not increase sellable stock. Only verified unshipped goods
retained or goods physically received may be recorded; money settlement is not
evidence of physical receipt.

Case closure requires pending refunds to be reconciled and a customer-facing
explanation. Rejection cannot overwrite a case with a successful refund. Scoped
account views and private data exports include case/refund state; staff/provider
secrets are excluded. Transactional notices cover request receipt, verified
provider processing and case resolution through the existing authenticated
notification worker. Notices omit reasons, addresses and provider identifiers.

## Dispatch and reconciliation

`REFUNDS_ENABLED=false` is the default. To rehearse on an isolated approved
sandbox, configure the original gateway's test credentials/service access,
`REFUND_WORKER_SECRET` as a separate encrypted secret of at least 32 random
characters, and enable refunds for that isolated environment. The existing minute
cron calls `/api/internal/refunds` through the worker self binding. Live dispatch
also requires `REFUNDS_LIVE_APPROVED=true` and the existing gateway live gates;
these settings are not commercial launch approval. No credentials are public.

Each claim persists first-dispatch intent before any network call, with a
two-minute lease. Pending work is polled at five-minute intervals, with twelve
attempts before staff reconciliation is required. A timeout is not a definitive
failure and never releases held money. Canonical results must match the frozen
payment, amount, currency and local reference before updating the ledger.
Successful settlement cannot be downgraded by a late callback. Partial success
keeps the order paid with a separate refunded amount; complete monetary refund
sets the order/payment to refunded. Provider success does not prove bank posting.

- Stripe uses the original payment intent, metadata and stable
  `riway-refund:<local UUID>` idempotency key. Retrieval/listing precedes retry;
  an unknown outcome older than 23 hours is held for manual reconciliation.
- Xendit uses `/v3/refunds`, API version `2024-11-11`, the original payment ID and
  frozen `for-user-id` account. Only first dispatch can POST. Later attempts GET
  a known refund ID or list refunds for a v3 `py-` payment and match the stable
  reference. An uncertain legacy-payment outcome without a refund ID requires
  merchant reconciliation. No undocumented POST idempotency guarantee is assumed.
- Existing signed Stripe payment webhooks also handle refund events. Xendit
  refund callbacks use `/api/webhooks/refunds/xendit` and callback-token
  verification. Both fetch canonical refund facts; callback amounts/status alone
  never settle money. Merchant webhook registration and actual delivery remain
  acceptance work.

For an uncertain outcome, locate the original merchant account/payment in the
provider, obtain the existing refund ID, and use **Refund management → Verify a
provider refund ID**. This records a candidate for GET verification; it cannot
declare success or erase first-dispatch intent. Never create a replacement refund
just because a response was lost. A confirmed failed refund releases its held
allocation; a new approval needs its own authorization reference.

## Accounting boundaries and rollback

Reports/CSV subtract only verified successful monetary refunds from the original
order period. Original sold quantities remain quantities sold, not estimated
returned quantities. Scheduled reports are snapshots when queued. New ledger-backed
fully refunded orders remain visible with zero net sales and their refund amount;
legacy refunded orders with no verified refund ledger retain prior exclusion.
Optional reorder reminders are suppressed for active return cases and refunded
source purchases, including delivery-time rechecks.

Full refunds retain the existing full-volume reversal outbox behavior. Partial
RIWAY volume/member adjustment delivery is not implemented without its contract;
every successful refund records an audit review and staff must retain RIWAY
reconciliation evidence. Paid bonus allocations remain consumed, under the
campaign's explicitly approved supported return rule. No commissions are computed
here. This ledger and its emails are not tax invoices or credit notes.

To suspend dispatch/polling, disable `REFUNDS_ENABLED`; preserve service credentials
and verified callbacks for in-flight outcomes and reconcile held refunds before
removing them. Disabling new checkout alone does not disable refund processing.
For application rollback, pause affected workers first, retain all financial,
receipt and audit records, and use a reviewed forward repair migration. Do not
edit an applied migration, delete a refund ledger or replay an uncertain POST.

## Verification and API references

`tests/security/returns_refunds.sql` covers owner isolation, MFA, policy snapshots,
withdrawal, stale quotes, bounded approvals, leases, verified partial/full results,
notification authorization, exports and independent physical receipt accounting.
Real PostgreSQL races verify approval, receipt and settlement idempotency. Provider
unit/route tests use synthetic responses; desktop/mobile browser cases use real
database routines with deliberately synthetic Auth/REST. None establishes actual
merchant/channel refund acceptance, sender delivery or RIWAY reconciliation.

Primary references used for the adapter:
[Stripe refunds](https://docs.stripe.com/api/refunds/create),
[Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests),
[Xendit create refund](https://docs.xendit.co/apidocs/create-a-refund),
[Xendit get refund](https://docs.xendit.co/apidocs/get-a-refund), and
[Xendit payment refunds](https://docs.xendit.co/apidocs/list-refunds-for-a-payment).
