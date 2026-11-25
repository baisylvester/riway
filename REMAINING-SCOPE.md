# RIWAY remaining proposal scope — 24 November 2026

## Current proposal candidate — 25 November 2026

The current requirement-by-requirement source is [PROPOSAL-MATRIX.md](PROPOSAL-MATRIX.md), with [delivery evidence](PROPOSAL-DELIVERY.md) and [exact dependencies/missing code](EXTERNAL-DEPENDENCIES.md). New candidate work is not deployed. Guest/collection and portions of all five optional enhancements have working code; subscriptions, paid tickets, refunds/tax, bonus campaigns, actual RIWAY/SSO/courier and other adapters still require implementation. Earlier G-number assessments below describe their dated releases.

Branch `feat/riway-remaining-scope-20261124`, worktree `riway_remaining_scope`, cut from `integration/features` @ `4c980a7` (22 commits past the audited `992c2ac`; the audit's findings were rechecked against this base). Status update: merged as PR #41 (and #42), hosted migrations applied and deployed to staging and production on 24 November 2026 (see `ROLLOUT-STATUS.md`). No real provider is connected; email and RIWAY volume delivery remain off.

Status words used below:

- **Implemented** — in code with automated tests, on this branch.
- **Partial** — part is in code; the rest is listed.
- **Missing** — not in code.
- **Config pending** — code exists; needs credentials, settings or a schedule.
- **Contract blocked** — needs a RIWAY rule, API specification or provider decision before it can be built honestly.
- **Acceptance pending** — needs evidence from outside the source tree (sandbox, UAT, audit).

## What this branch adds

| Increment | Audit IDs | Migration | Tests |
| --- | --- | --- | --- |
| Paid-order confirmation email for every gateway, frozen snapshot, no personal data in the job | G22 | `20261124090000_order_confirmation_and_stock_alerts.sql` | `tests/security/order_confirmation.sql`, `tests/unit/order-confirmation.test.ts` |
| Daily corporate low-stock email: market admin/operations opt in (MFA), checkout inventory only | G26 | same | same + `tests/unit/notification-worker.test.ts` |
| RIWAY compensation order-volume outbox: paid/reversal events, external idempotency references, leases, bounded backoff, ack-before-reversal, staff view + audited retry, bounded backfill, fail-closed worker and schedule | G02 | `20261124100000_compensation_volume_outbox.sql` | `tests/security/compensation.sql`, `tests/unit/compensation.test.ts` |
| Consent-gated `view_item`, `add_to_cart`, `begin_checkout` and server-verified `purchase` events, deduplicated, no PII | G23 | none | `tests/unit/commerce-analytics.test.ts` |
| Product JSON-LD (price only while the product is genuinely on sale) and a validated legacy-redirect map (empty) | G24 | none | `tests/unit/structured-data.test.ts` |
| Distributor dashboard: own settled attributed orders, pseudonymous customer summaries, expected reorder dates from approved product cycles, approved marketing materials; staff-approved store photo on `/d/[code]`; staff tools page | G04, G05 (partial), G08 data | `20261124110000_distributor_dashboard.sql` | `tests/security/distributor_dashboard.sql`, `tests/unit/distributor-dashboard.test.ts` |

Existing migrations are unchanged. One existing test changed: `tests/security/fulfilment.sql` now expects exactly one `order_confirmed` job besides the shipping/delivery jobs (previously it asserted there were no other notifications).

New routes and pages: `/api/internal/compensation` (service worker, 503 until enabled), `/admin/compensation` ("RIWAY volume sync"), `/admin/distributors` ("Distributor tools"); `/admin` gains the low-stock alert opt-in; `/distributor` gains orders, customers and materials.

## Content scheduling and public editorial media (branch `feat/unblocked-scope-20261124`)

Built without RIWAY inputs. Merged as PR #56, migration applied and deployed to staging and production on 24 November 2026 (see `ROLLOUT-STATUS.md`).

| Increment | Migration | Tests |
| --- | --- | --- |
| CMS scheduled publication: optional `publish_at` / `unpublish_at` window on `content_entries`. An approved entry is public only inside its window, enforced by the database read policy (no scheduler needed). Market staff still see scheduled and ended entries; editors cannot move an approved schedule; customers cannot register for an event before it is public. The content studio shows Draft / In review / Approved, scheduled / Live / Ended. | `20261124150000_content_scheduling_and_public_media.sql` | `tests/security/content_scheduling_media.sql`, `tests/unit/content-schedule.test.ts` |
| Public editorial media: a market admin or compliance reviewer other than the uploader publishes a private editorial image with an approval reference. The copy goes to the public `editorial-public` bucket at `<market>/<asset id>.<ext>`. Unpublishing is refused while content in review or published uses the image. Stories, events and pages can use a published image of their market (or a bundled `/design` asset), checked by a database trigger. R2-stored media cannot be published yet. | same | same, plus `tests/unit/media-publication.test.ts` |

Rollout: apply the migration (hosted rehearsal first), deploy, then run a staff browser check: schedule an entry, publish an image as a second reviewer, and attach it to a story.

## Refreshed feature matrix

Rows I01–I21 from the audit remain **Implemented** and were not rebuilt. Changes on this branch are in bold.

| ID | Feature | Status now | Evidence / what is left |
| --- | --- | --- | --- |
| G01 | RIWAY member lookup, sponsor/placement reconciliation | Contract blocked | `src/services/integrations.ts` still `DisabledMemberAdapter`. Needs RIWAY member API (below). |
| G02 | Compensation order-volume sync | **Implemented (delivery Contract blocked)** | Outbox, retries, reconciliation, staff alerting and audited retry are in code. The RIWAY adapter is intentionally absent: `compensationAdapter()` throws for `riway` until the contract exists. Partial-refund adjustments follow the refunds work (G11). |
| G03 | Automatic membership after payment + RIWAY acknowledgement | Contract blocked | Staff confirm/reject fallback unchanged. Needs RIWAY enrolment API and an approved automatic rule. |
| G04 | Distributor dashboard | **Implemented (disclosure rules pending)** | `src/app/distributor/page.tsx`, `private.my_distributor_dashboard`. Default disclosure is minimal (pseudonymous labels); widening it needs RIWAY's privacy decision. |
| G05 | Distributor photo / personal store | **Implemented (content integration branch)** | Distributors upload a photo to a private bucket; market admin/compliance approve it, which publishes a copy from the public `distributor-photos` bucket to `/d/[code]` and Find a Distributor. Staff can still set an approved photo directly. |
| G06 | Guest checkout | Missing | `orders.user_id` is required; needs approved guest rules (verification, access, claim). |
| G07 | Auto-replenishment subscriptions | Contract blocked | Needs approved intervals, recurring consent wording and a gateway recurring capability (Stripe/Xendit merchant setup). |
| G08 | Reorder reminders + message reorder | **Partial** | Approved per-product cycles now exist (`products.replenishment_days`) and drive dashboard dates. Reminder jobs, consent and signed message links are not built. |
| G09 | Courier rates/labels/tracking | Contract blocked | Courier not selected. Manual fulfilment unchanged. |
| G10 | Service-centre collection choice at checkout | Missing | Needs approved centre list; touches `create_commerce_order` and the quote hash. |
| G11 | Returns, refunds, credit notes | Contract blocked | Needs Terms of Sale refund policy and gateway refund setup. Unpaid cancellation unchanged. |
| G12 | Tax and legal receipts/invoices | Contract blocked | Needs per-market tax rules and legal numbering. The new confirmation email says it is not a tax invoice. |
| G13 | Bonus-item promotions | Contract blocked | Needs the specific approved campaigns. |
| G14 | Rich market product content/media fields | **Implemented (content pending)** | `public.product_market_content` per product, market and locale; editors draft at `/admin/product-content`, only market admin/compliance publish with an approval reference; product pages show published content. RIWAY-approved copy still to be entered. |
| G15–G18, A04 | Corporate, membership, support and legal pages; Find a Distributor | **Implemented (content pending)** | About, Membership, Support and legal pages render compliance-published CMS `page` entries by slug (`about-history`, `membership-overview`, `support-contacts`, `legal-privacy` and so on, optionally `-ph` / `-<locale>`), falling back to the current notices. `/find-a-distributor` lists only verified distributors who opt in (display name, code, market, city, approved photo). Approved copy still to be entered. |
| G19 | Languages and regional URLs | Partial | CMS sections resolve a locale-specific slug before English. Language selection, URL routing per language, dictionaries and hreflang remain; needs the agreed rollout and approved translations. |
| G20 | Magazine-app links | Contract blocked | Needs the link contract. |
| G21 | CRM/SMS/messaging | Contract blocked | Needs provider choice and channel consent rules. |
| G22 | Order confirmation emails | **Implemented (Config pending)** | Sends once Resend is enabled. Market receipt wording to be approved. |
| G23 | Conversion analytics | **Implemented (Config pending)** | Inactive until GA4/Pixel IDs are configured; real dashboard receipt untested. |
| G24 | SEO structured data and redirects | **Implemented (data pending)** | JSON-LD live in code; redirect map empty until RIWAY's old-URL inventory exists. |
| G25 | Data-subject requests, retention | **Partial: request workflow implemented** | Customers submit access/correction/erasure/restriction cases, track status, reply and withdraw at `/account/privacy`. Market admin/compliance staff with a second step review at `/admin/privacy`; completion requires an identity-verification reference and resolution reference. Version checks, audit events, pagination, duplicate protection and intake throttling are enforced by the database. Automated exports/deletion and retention schedules remain blocked by approved verification, fulfilment and retention rules. See `PRIVACY-REQUESTS.md`. |
| G26 | Corporate low-stock alerts | **Implemented (Config pending)** | Sends once Resend is enabled and staff opt in. |
| A01–A04 | Payments, email, GA4/Meta activation, approved data | Config pending / Acceptance pending | Unchanged; see runbook below. SG PayNow still has no proven channel. |
| A05 | RIWAY SSO | Contract blocked | Needs OIDC/SAML metadata and linking rules. |
| A06 | Pay at pickup / bank transfer | Contract blocked (conditional) | Build only if RIWAY selects it. |
| N01–N06 | Accessibility, security test, monitoring, backups, environments, UAT/training | Acceptance pending | Not provable from source. |

## Dependency-ordered plan for what is left

Each step lists what unblocks it and how it is accepted.

1. **RIWAY member API → G01, then G03.** Inputs: sandbox URL, auth, lookup/enrol schemas, sponsor/placement rules, error codes, rate limits. Accept: duplicate/timeout/malformed-response tests; membership activates only after verified payment **and** RIWAY acknowledgement; staff fallback still works.
2. **RIWAY compensation contract → G02 delivery.** Inputs: endpoint, auth, field mapping for the existing payload (`src/services/compensation.ts`), acknowledgement format, permanent-vs-retryable error codes, refund/partial-refund semantics. Accept: implement `CompensationVolumeAdapter`, sandbox run with duplicate and reversed events, reconciliation report matches RIWAY.
3. **Refund policy + gateway refunds → G11, then G02 adjustments, G12 credit notes.** Accept: request → decision → restock → gateway refund confirmed by webhook; status alone never claims a refund; concurrent refund tests.
4. **Tax rules → G12.** Accept: immutable tax snapshot on the order, legal numbering, downloadable invoice, refund adjustment.
5. **Service centres → G10;** **courier → G09.** Accept: frozen fulfilment choice in the order and quote hash; courier sandbox labels and signed tracking events; manual fallback preserved.
6. **Guest rules → G06.** Accept: contact verification, restricted order access link, safe account claim, same stock/idempotency/sponsor gates.
7. **Recurring rules + merchant capability → G07; channel consent + providers → G08 reminders, G21.**
8. **Content, translations, link contracts → G14–G20; DSR/retention policy → G25.**
9. **Activation and acceptance → A01–A04, N01–N06** (runbook below).

## Activation runbook for this branch (not executed)

Do these only with RIWAY's approval and in staging first.

1. **Review and merge** the branch through the normal PR and CI (`verify` + `postgres-concurrency`). CI's `postgres-concurrency` job runs the three new suites (added to `scripts/test-postgres.mjs`).
2. **Apply migrations** in order: `20261124090000`, `20261124100000`, `20261124110000`. Use the repository's hosted-rehearsal practice: run each migration plus its suite in one transaction that ends with `rollback`, confirm nothing persisted, then apply and record the hosted version.
3. **Order confirmations and low-stock alerts** need no new settings: they send through the existing notification worker once `EMAIL_PROVIDER=resend` and the Resend settings are configured. Staff opt in on `/admin`. Before live email, approve the receipt statements in `src/services/resend-email.ts` (`orderStatements`).
4. **Compensation delivery** stays off (`COMPENSATION_PROVIDER` unset). Activation after the adapter exists: set `COMPENSATION_PROVIDER=riway`, `COMPENSATION_WORKER_SECRET` (32+ characters, Worker secret) and the adapter's RIWAY credentials; the minute cron then calls `/api/internal/compensation`. To include orders paid before the migration, a service-role operator runs `select public.enqueue_missing_compensation_events(<start>)` (31-day limit).
5. **Analytics events** need only the existing GA4/Pixel IDs; verify consent denial, withdrawal and real dashboard receipt.
6. **Distributor tools**: compliance sets approved product cycles and photos; editors add approved materials on `/admin/distributors`.

**Rollback.** Code: revert the merge. Delivery: unset `COMPENSATION_PROVIDER` or `EMAIL_PROVIDER` (both stop before claiming). Database objects are additive; if removal is required, write a new forward migration that drops the two triggers (`order_confirmation_notification`, `compensation_volume_event`) first, then the new functions, tables and columns. Do not edit applied migrations.

## Checks run on this branch (24 November 2026)

- `npx vitest run`: 57 files, 545 tests passed (baseline before changes: 51 files, 510 tests). This includes in-process PostgreSQL (PGlite) replay of every migration and the three new rollback-only suites, including permission and isolation checks.
- `npx tsc --noEmit`: passed.
- `npx next build --webpack`: passed (all routes compiled, including `/admin/compensation`, `/admin/distributors`, `/api/internal/compensation`). The first attempt compiled but the CLI exited 1 with a notice that next@16.4.6 is affected by a published security advisory; the immediate rerun exited 0. The Next.js upgrade is a separate decision and was not made here.
- Not run: `npm run test:postgres` (known to hang on Windows at `pg_ctl start`; CI runs it), Playwright e2e, Cloudflare packaging, any hosted database, provider sandbox or browser acceptance.

## RIWAY inputs needed

- Member/enrolment API contract and sandbox (G01, G03).
- Compensation API contract, acknowledgement and refund semantics (G02).
- Disclosure rules for distributor customer data beyond pseudonymous summaries (G04).
- Approved product reorder cycles (G04, G08) and distributor photos/materials (G05).
- Refund/return policy and Terms of Sale; gateway refund enablement (G11).
- Per-market tax and invoice rules (G12); approved receipt wording (G22).
- Service-centre list and collection rules (G10); courier selection and API (G09).
- Guest-checkout rules (G06); recurring subscription rules and merchant capability (G07).
- Messaging providers and channel consent (G08, G21); Magazine link contract (G20).
- Approved content, translations, old-URL inventory (G14–G19, G24); DSR and retention policy (G25).
- SSO identity provider metadata (A05); pay-at-pickup decision (A06); SG payment provider (A01).
