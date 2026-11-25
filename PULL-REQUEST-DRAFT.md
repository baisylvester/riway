# Add secure checkout, distributor, attendance and refund workflows

Draft PR base: `main`. Head: `feat/riway-proposal-completion-20261125`.

Customers can verify guest contact, choose an approved collection centre with a frozen authoritative quote, book/cancel/reschedule consultations, manage optional reorder email and export their own data. Distributors receive a versioned campaign library; independent reviewers control publication/withdrawal and linked story media. Event capacity/check-in is enforced transactionally. A real approved-content-only AI text/voice adapter is included but remains disabled pending approved content, credentials and privacy/provider acceptance.

Additional hardening stops voice capture/transcription on either consent withdrawal, rejects late results and protects unpublished event metadata. Registration refreshes capacity/attendee views immediately.

An approved bonus-item engine now freezes gifts in quotes/orders, reserves shared physical stock, enforces campaign capacity and preserves payable/voucher accounting. New PostgreSQL races cover the last gift units; staff/customer browser checks cover approval/withdrawal and isolation.

Returns and refunds now include own-order case intake, frozen approved policies, bounded paid-line allocations, original Stripe/Xendit routing, verified results, durable uncertain-outcome reconciliation and gated minute dispatch. Physical/bonus-goods receipts are separate from money, and reports/exports/notices reflect verified refunds. Official tax/credit notes, approved policies, actual merchant acceptance and RIWAY partial adjustments remain outstanding.

Eight additive migrations preserve the established package/voucher/stock/payment path and add role/market authorization, revision checks, notification suppression and concurrency controls. The current 100-requirement matrix, operating guide, dependencies and deployment/rollback runbook distinguish local implementation from operational readiness.

Validation: 679 unit tests across 79 files; 40 migrations/29 suites on disposable real PostgreSQL; 22 desktop/mobile Playwright cases using synthetic Auth/REST over real PGlite RLS/RPCs; TypeScript and production webpack build passed. Local Node 26 is outside the declared range: Node 22 Linux CI remains required. The final HTTP integration rerun is blocked at health 503 because outbound Supabase fetch receives EACCES in the restricted environment. Provider/payment/email/AI acceptance, full browser/accessibility/performance/security/restore/UAT evidence remain pending.

This does not complete the proposal. Actual RIWAY/SSO/courier/CRM integrations, paid ticketing, subscriptions, official tax/invoice/credit-note workflows and RIWAY partial-refund adjustments, full localisation and retention-aware privacy fulfilment still require code and/or approved contracts/rules. No hosted schema, provider configuration, real payment or commercial launch changes are included. Staging still shares the production database; hosted fixtures require an isolated target.

Review `PROPOSAL-DELIVERY.md`, `PROPOSAL-MATRIX.md`, `EXTERNAL-DEPENDENCIES.md` and `OPERATING-GUIDE.md`. Keep this PR draft until the missing requirements and acceptance plan are reconciled.
