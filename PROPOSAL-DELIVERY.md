# RIWAY proposal implementation handover — 25 November 2026

This candidate adds working customer, distributor and staff workflows to the latest merged application. It does **not** complete proposal BAI-RWY-2026-001 or establish production readiness. See the 100-row `PROPOSAL-MATRIX.md` for every requirement and `EXTERNAL-DEPENDENCIES.md` for the remaining code and inputs. No hosted migration, provider configuration, payment activation or commercial launch was performed for this candidate.

## Baseline and preservation

- Original repository: `C:\Users\PC2\AndroidStudioProjects\PROJECTS\riway\riway_web_app`, clean `integration/features` at `4c980a7`. Existing checkout and records were preserved.
- Latest merged baseline, rechecked with GitHub: `ccd5be77b790c50f864bad825c93b252a5967f43` (PR #57). It includes the 24 November feature releases; they were not rebuilt.
- Isolated branch: `feat/riway-proposal-completion-20261125`. Local linked worktree: `C:\Users\PC2\Documents\Codex\2026-11-25\files-pasted-by-the-user-complete\work\riway`.
- Existing Next.js/React, Supabase, OpenNext/Cloudflare, Xendit/disabled Stripe and Resend architecture is retained. RIWAY remains authoritative for membership, commissions and payouts.

## Implemented in this candidate

| Workflow | Behavior and boundary |
| --- | --- |
| Verified guest checkout | Supabase email link/code verifies contact without a password; orders belong to the verified canonical account. Existing emails use the same identity. Choosing a password later does not transfer orders by an unverified email match. Both checkout and payment resume reject unverified contact. SMTP and real-auth acceptance remain pending. |
| Service-centre collection | Market-scoped MFA-protected staff approval, revision control, approved address/instructions, active availability and explicit approval of no additional collection fee. Quote/order bind the chosen centre revision. Retries return the original immutable order even after withdrawal; a changed selection is refused. Customer/staff order views show frozen instructions. No centres were invented. Courier fees/tax remain separate missing workflows. |
| Consultation booking | Verified distributors offer future slots in an IANA timezone. Customers book, reschedule within the same distributor or cancel. Participants see their own records. Ordered participant locks prevent overlaps; retries are idempotent and stale revisions fail. Notification outbox includes changes and 24-hour reminders, with delivery-time cancellation/revision checks. |
| Stories and distributor library | Immutable campaign asset revisions, market/language/type filters, title/campaign search, videos/documents with accessible transcript requirements, independent MFA reviewer and approval reference. Public current-version sharing links stop showing withdrawn assets immediately. Stories may link approved same-market media; withdrawal hides linked stories. Source media and approved copy are still required. Withdrawal cannot revoke a file already downloaded or an external host's direct URL. |
| Product assistant | Approved scheduled-live market/locale CMS references only. A real OpenAI Responses adapter selects source IDs; the server returns approved passages verbatim. It sends matched public terms and public passages, not free questions or private orders. Medical requests go to support; authenticated order support checks ownership without sending order data to AI. Voice uses explicit consent, bounded WebM upload/rate limits and a real transcription adapter. Local browser speech is optional. Credentials, provider/privacy approval, corpus and real voice/model acceptance are absent; the provider remains disabled. |
| Event attendance | Atomic capacity admission; customer registration/cancellation; scoped, paginated MFA staff attendee management and check-in; revision control, audit and cancelled-confirmation suppression. This does not include paid tickets, gateway refunds or ticket finance. |
| Reorder email and preferences | Opt-in defaults false, approved product cycle/lead-time reference, deduplicated jobs and authenticated reorder links. Delivery rechecks consent revision, current purchase, timing, stock, registration and market. Bearer unsubscribe only disables the optional reminder and exposes no account data. Reorder adds items to the bag; it never places or charges an order. SMS/messaging are still missing. |
| Private data export | Authenticated explicit-projection JSON export of the subject's account/customer records, no arbitrary user ID parameter, audit and three-per-hour rate guard. Existing case intake/correction remains. Automated erasure/restriction, retention fulfilment and applicable session revocation remain missing. |

## Verification evidence

Checks were run against the candidate source on 25 November 2026. Local runtime is Node 26.13.0 on Windows (outside the repository's declared Node 22–24 range); Node 22 Linux CI remains required before merge/deployment.

| Check | Result and limits |
| --- | --- |
| Baseline unit suite | 639 tests in 69 files passed before changes. |
| Final unit suite | **656 tests in 75 files passed**. Includes PGlite execution of all migrations and new SQL assertions, assistant authorization/grounding, verified-contact gates, CSP separation and reorder email headers. |
| Real PostgreSQL | **38 migrations, 27 rollback security suites passed** in a fresh loopback PostgreSQL 18 cluster. CI specifies PostgreSQL 17. Eight simultaneous bookings: one accepted/seven conflicts; four identical replays; conflicting reschedules one accepted/one stale. Eight event admissions into capacity two: two accepted/six refused. Existing concurrent stock/voucher/expiry/membership/privacy/payment checks also passed. No hosted data was used. |
| New desktop/mobile browser workflows | **8 cases passed** using installed Edge with Playwright desktop and mobile viewport projects against real PGlite migrations/RLS/RPCs. Covers booking/cancellation persistence, consent/export isolation, medical/order handoff and separate editor/reviewer publication/withdrawal. Auth/REST transport is deliberately synthetic. This is not Supabase, Clerk, gateway, email or AI provider acceptance, nor physical iOS coverage. |
| Existing public browser suite | Earlier run: 29 passed, two timing failures and one skipped. Both affected spec files rerun in isolation: all six cases passed. Browser workers now bounded to two to avoid software WebGL starvation. This is not a clean full browser/device matrix or an accessibility audit. |
| TypeScript | Passed. |
| Production build | Webpack production build passed. Cloudflare packaging and deployment must pass the Node 22 Linux workflow. |
| Final HTTP integration rerun | **Blocked at the first health check (503)**. Direct outbound Supabase fetch fails with `EACCES` in the current restricted execution environment, even with the public runtime configuration set. The full HTTP suite did not run and is not counted as passed. Rerun in authorized CI/staging with database connectivity. |
| Dependency audit | Earlier candidate `npm audit --audit-level=high`: zero vulnerabilities reported. This does not replace an independent penetration test. |

Reproduce from a fresh clone with Node 22, `npm ci`, configured public Supabase variables and providers disabled:

```text
npm run typecheck
npm test
npm run test:postgres
npm run build -- --webpack
```

For a fresh disposable positive browser run, set `RIWAY_DISPOSABLE_BROWSER=1` and start `node tests/fixtures/browser-server.mjs`. It owns ports 4682/4174 and runs a synthetic Auth/REST boundary over actual migration/RLS/RPC execution. In a second terminal set `RIWAY_DISPOSABLE_BROWSER=1`, `PLAYWRIGHT_EXTERNAL_SERVER=1`, `PLAYWRIGHT_PORT=4174`, and run `npx playwright test tests/e2e/optional-workflows.spec.ts --workers=1`. Install Playwright Chromium first, or set `PLAYWRIGHT_CHANNEL=msedge` for an installed Edge. Stop the fixture afterwards. Each full rerun starts a fresh fixture so export limits and test state reset. Never point fixtures or `test:postgres` at shared or real databases.

This Windows worktree shares a read-only dependency junction. For that environment only, use `node_modules/.bin/vitest.cmd run --configLoader runner --fsModuleCachePath .cache/vitest --cache=false` to keep Vite temporary/cache writes inside the workspace. Normal clones/CI use `npm test`.

## Review delivery and publication limitation

GitHub was rechecked as account `baiaerlmrtn`. Repository tree creation returns HTTP 403, `Resource not accessible by integration`; the existing GitHub CLI credentials report invalid. No remote branch, PR or candidate CI run is claimed. A GitHub connection with repository write access is required to publish. The PR title/body is prepared in `PULL-REQUEST-DRAFT.md`.

Because the original linked worktree's Git metadata is outside the current writable workspace, a separate local review clone is used at `C:\Users\PC2\Documents\Codex\2026-11-25\files-pasted-by-the-user-complete\work\review-repo`. It contains the candidate branch/commit without altering the original checkout. The portable Git bundle is based on the exact main commit above and contains the candidate delta; import it into a repository that contains that base. No credentials or dependencies are included.

```text
git bundle verify <absolute-path-to-riway-proposal.bundle>
git fetch <absolute-path-to-riway-proposal.bundle> refs/heads/feat/riway-proposal-completion-20261125:refs/heads/feat/riway-proposal-completion-20261125
git switch feat/riway-proposal-completion-20261125
git push -u origin feat/riway-proposal-completion-20261125
```

Run these in a clean authorized clone; if a local branch with that name already exists, inspect its head before choosing a distinct import branch. Do not force-update a user's branch. Open a draft PR against `main` using the prepared description after push, then follow the CI/deployment gates below.

## Inspected operational state

- Hosted Supabase project `skiimthwadramxdzhgoy` is in `eu-west-1`. Staging and production still reference the same project; only the main hosted branch was visible. No fixtures were placed there.
- Latest inspected hosted migration was `20261124150000`; none of this candidate's six migrations is applied.
- PH/SG/MY `online_sales_approved` and `payments_ready` were false. PH Xendit test master routing existed with payment activation false. Historical GCash/Maya success is not a new sandbox transaction and is not evidence for cards, banks, QR, FPX or PayNow.
- Existing local secret references contained Supabase service access and Xendit development access; Resend, Stripe and OpenAI keys were absent. No secret values are included in source or this handover.
- Available Cloudflare OAuth account returned zero DNS zones. Sender DNS/SMTP therefore could not be completed through that account. No new provider was provisioned. Connected Drive/Gmail searches found progress records but no private RIWAY integration contracts.
- Supabase organization reported FREE. Daily backups with 30-day retention and restoration were not verified. Advisors reported leaked-password protection disabled and two informational RLS-without-policy notices; investigate under the existing operations process. No independent penetration test or full WCAG audit was performed.

## Deployment procedure

1. Review the PR and its 100-row matrix. Require passing Node 22 Linux `verify`, `postgres-concurrency` and `optional-browser-workflows` checks. Download and verify the workflow artifact digest; build from the reviewed commit, never a dirty local tree. Confirm public URLs, CSP, OAuth callback allowlists and secret scope match the target.
2. Establish an **isolated existing development/staging database** before hosted rehearsal. Current staging shares production data. Record target project IDs, access owner, encrypted backup location and a successful isolated restore. If no authorized isolated resource exists, deployment rehearsal remains blocked; do not insert fixtures into the shared project or silently buy a plan.
3. Rehearse all six migrations in timestamp order, first transactionally with rollback-only suites on a disposable target, then on isolated staging. Review function grants, definer search paths, RLS, ownership, advisors and migration ledger. Supabase CLI `db push` requires a verified linked target; use its dry-run before applying. Do not blindly execute against the default linked project.
4. Apply the additive migrations in order: `20261125012539`, `20261125012655`, `20261125013708`, `20261125014114`, `20261125015220`, `20261125015757`. They add wrappers/columns/private tables and retain prior commerce functions. Take a verified backup immediately before application. Record full checksums and ledger entries.
5. Deploy the reviewed Cloudflare artifact to isolated staging with payments, AI and email disabled. Configure correct canonical `SITE_URL`/`NEXT_PUBLIC_SITE_URL`, project URL/key and approved Auth callback URLs. Smoke-test public pages and health, signed-out redirects, real customer ownership, verified guest contact, distributor booking, independent library review, staff capacity/centres, export and unsubscribe. Run actual provider acceptance separately before enabling any channel.
6. Have authorized RIWAY staff load approved centres, products/cycles, media, legal and assistant references. Centre approval requires an explicit no-additional-fee decision; a centre requiring a collection fee is not supported by this candidate. Service-centre activation never authorizes payment or online sales.
7. Configure Resend sender/DNS and Supabase SMTP using authorized existing accounts, then prove inbox delivery, suppression/retry and account recovery. New booking/reorder jobs use the existing notification worker. Keep the payment/RIWAY gates unchanged. Record consent, processor/data-location approvals before any AI/voice enablement; set server-only AI flags only after acceptance.
8. Complete outstanding required code and acceptance gates, including paid tickets, refunds/tax, subscriptions, selected courier and actual RIWAY adapters. Run the agreed UAT and obtain recorded commercial launch approval. This candidate is not a substitute for those requirements. Only then consider production promotion and a separately authorized payment activation.

## Rollback and incident handling

Before promotion, retain the previous Cloudflare deployment/version, artifact digest, reviewed commit, secret configuration versions, backup IDs, migration ledger and an identified operator. This candidate does not supply or claim a production restore rehearsal.

For an application regression, disable new AI/voice/email delivery and payment/commerce activation where relevant, stop scheduled worker dispatch if jobs are implicated, and route traffic to the last verified Cloudflare version. Verify public/auth/health and queue state. Preserve private tables and audit records; mark incident/recovery evidence. New job types can remain queued until a fixed worker is deployed. Older workers may fail on an unknown job type, so do not leave notification dispatch running blindly after an application rollback.

Database rollback is **forward repair**, reviewed and rehearsed on an isolated copy. Do not drop new tables/columns or rewrite payment/stock records to simulate a rollback. Schema wrappers change even when the application is reverted; validate legacy/new checkout, fulfilment, media publication and notification context against the retained schema. If restoration is necessary, stop writers, confirm the approved RPO/RTO, restore to a separate protected target, reconcile provider settlements/outbox after the snapshot, then switch connections under the incident owner. Never overwrite the shared live database without an approved recovery action.

## Remaining acceptance and handover

Missing commercial workflows and external contracts are listed explicitly in `EXTERNAL-DEPENDENCIES.md`; the remaining work is not solely configuration. Staff/distributor guidance and a training exercise plan are in `OPERATING-GUIDE.md`. No role training session, produced training video, 10-business-day UAT, 30-day launch hypercare, 99.9% observation, agreed mobile <3-second/load test, independent pentest or 30-day backup/restore certification is claimed.
