# RIWAY provider rollout — 24 November 2026

## Latest live release - independent distributor photo review

PR #47 merged as `ef8dc3fbbb7af548fbf45e3932047fe0fce94a1f` after exact-head push run `45328173860` and PR run `45328178372` passed `verify` and `postgres-concurrency`; merge run `45328583657` also passed both jobs. The tested head (`41df83fc22be779ffada33403f339d75f9c68e67`) and merge share tree `f45851ce16be82c70f2c3cb9635627b7b677b3ea`.

Migration `20261124140000_distributor_photo_independent_review.sql` refuses own-photo review and direct own-photo changes even when the distributor is a market admin/compliance staff member with MFA. The review queue excludes own submissions. The server action checks the submission's id, market and object path against that queue before copying an image into public storage.

Local verification: 571 tests across 60 files, TypeScript and the production webpack build pass. The new rollback-only acceptance suite reproduced admin self-approval before the fix; after the fix it covers admin/compliance self-approval, self-rejection, direct setting/removal, unchanged submission/photo/audit state on refusal, and independent approval/rejection. Eleven action tests cover refusal before upload and submission-field tampering. Both PGlite and CI's PostgreSQL runner include the new SQL suite.

Hosted migration `20261124140000_distributor_photo_independent_review.sql` was applied through the Supabase MCP before either deployment and recorded under the repository version in a separate call. The new rollback-only suite then passed on the hosted database. Follow-up counts found zero retained suite users, profiles or submissions. All three private function body hashes match the source; public wrappers remain invoker functions with empty search paths. Security advisors show the same two INFO no-policy notices and the pre-existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Artifact `14890876461` from push run `45328173860` (19,959,077 bytes) matched GitHub SHA-256 `1426ece350eb741059ff4dfe323e2c01ef8d85576334829a7f7619a4bfa9da60` before extraction and upload. From a checkout of the merged commit, staging deployed as `155004f102e642f0a73c4641c7d51c49` and production as `7cb4dc4c36e64d78abf2b5640a5c5ba3`, with identical etag `2fe6756dedf42d5352c99f2caff1cddcb7aa447d9aefc8a5530150dab36097ac`. Notification schedules were reapplied on both.

Post-deployment checks passed 53/53 HTTP/API cases on each environment. The unknown-collection expected count was adjusted from 2 to 3 in a temporary test copy only, because the published QA product remains in the shared catalogue. Signed-out `/admin/distributors` redirects to `/auth/login` on both. Production health still reports commerce, payments and Xendit disabled; staging reports commerce gated and Xendit test mode.

Signed-in browser review is still unverified; conditional CI Playwright steps were skipped by the existing repository-variable configuration. Staff inbox delivery/custom SMTP remains pending. Live QA inspection and the proposed cleanup are documented in `QA-CLEANUP-20261124.md`; no live QA data has been deleted and no QA configuration has been withdrawn. The older sponsor's two paid orders and attribution are preserved.

## Previous live release - emailed staff verification codes

PR #46 merged as `4ad6e0828dfa5399955258f607c84d7f8aa77e76`. Branch push run `45324715507` passed `verify` and `postgres-concurrency`; the PR run's `verify` job was still finishing at merge. The branch and merge trees are identical (`8fcc32f`). The GitHub run and artifact metadata were rechecked on 24 November when completing this record.

Hosted migration `20261124130000_email_second_factor.sql` is applied and recorded under the repository version. The handover records a rolled-back hosted acceptance run covering password-only refusal, service-role-only recording, foreign-session refusal, single-session scope and authenticator compatibility, with no test rows retained. Hosted migration history was rechecked on 24 November.

Artifact `14888474708` (19,958,909 bytes) has GitHub SHA-256 `043a2ffc3772be9c9380314cc77f06963ece005bad5f6d8425484c09ea2833fb`. The handover records a matching downloaded digest before deployment: staging `840ee04f3de84c00b25b44b064b231f9` and production `cbd5858c5424450aaa82dd85df08e75d`. It also records 53/53 HTTP/API checks passing on both, with the unknown-collection count adjusted to 3 for the shared QA product. These deployment and HTTP results are prior release evidence from the handover, not a new deployment or rerun.

Scope and state:
- **Staff verification:** an emailed code or an existing authenticator is accepted; email verification applies to one browser session for 12 hours.
- **Email delivery is not verified end to end:** the staging panel sent codes and Supabase logged both sends, but receipt in the staff inbox was not confirmed. The Magic Link template contains `{{ .Token }}`; custom SMTP still needs configuration.
- Commerce, payments and Xendit remain disabled on production. Staging and production share the database; temporary QA content remains pending reviewed cleanup.

## Previous live release - content integration (product content, CMS pages, Find a Distributor, photo uploads)

PR #44 merged as `a35dcdd9dedf2a7f750c4a9871a99ea17585e51b` after its PR CI passed `verify` and `postgres-concurrency`, including the new `content_integration.sql` suite; merge CI run `45321216289` passed.

Hosted migration `20261124120000_content_integration.sql` is applied through the Supabase MCP and recorded under the repository version. It was applied before the deploy; the previous code was unaffected because the migration only adds objects and loosens the distributor photo URL check. As with the previous release, the rolled-back hosted rehearsal with the suite was not run; the suite passed on real PostgreSQL in CI and in local PGlite replay. After applying: buckets `distributor-photo-submissions` (private) and `distributor-photos` (public) exist, the four storage policies are present, anonymous users can call only `find_distributors`, authenticated users cannot read the directory or submission tables, and security advisors show only the pre-existing notices.

Artifact `14887920999` (19,955,301 bytes) matched SHA-256 `9a0fd9b41c150dc3c32dc7298fd1e698f57bcf91d6e81bd2746d0ee1bb590ea4` before extraction and upload. Staging returned deployment `edcc6122d271473e9578119f5b35f1fa` and production `f2597b20ee70472b9fe04309dc5c6040` (same etag `d61d2bef3c81db97ae9dca33460791454a38f97d1f39e69dd02ce8e4a6013ad1`); the notification schedule was reapplied on both. Live checks on 24 November: 53/53 HTTP/API cases passed on staging and production (unknown-collection count adjusted to 3 for that run only, because of the staging QA product). `/find-a-distributor`, `/about`, `/membership`, `/support`, `/legal/privacy` and product pages return 200; signed-out `/admin/product-content` and `/distributor` redirect to login; `/api/health` still reports commerce, payments and Xendit disabled. Find a Distributor shows its empty-list message (no distributor has opted in). Production logs over about 75 seconds showed one minute-cron run `ok` and no exceptions or error logs.

Scope and state:
- **Product content, CMS page sections, legal pages:** live in code; no RIWAY content has been entered, so pages still show their existing notices.
- **Find a Distributor and photo uploads:** live; listing is opt-in from `/distributor`, photos appear only after market admin/compliance approval on `/admin/distributors`.
- Not covered: signed-in testing of listing, upload and review (needs a verified distributor and a compliance account); per-language URLs and hreflang.

## Previous live release - remaining proposal scope (order confirmations, volume outbox, distributor dashboard)

PR #41 merged as `511b45c50dc8750e23dbff42fdac67b178e3305e` and PR #42 as `8d3d9951c224ca26b9ffc463e21509a88ee51a91`. PR #41's CI and merge CI run `45310494879` passed `verify` and `postgres-concurrency`, including the new `order_confirmation.sql`, `compensation.sql` and `distributor_dashboard.sql` suites. PR #42 was merged by an auto-merge request that completed immediately because `main` has no required checks; its merge CI run `45310732465` then passed both jobs.

Hosted migrations `20261124090000_order_confirmation_and_stock_alerts.sql`, `20261124100000_compensation_volume_outbox.sql` and `20261124110000_distributor_dashboard.sql` are applied through the Supabase MCP, each in its own transaction; the recorded versions were then set to the repository filenames. **Deviation:** the usual rolled-back hosted rehearsal of each migration with its suite was not run (the combined script was too large for the tool); the suites passed on real PostgreSQL in CI and in local PGlite replay, including a local run of the exact combined rehearsal script. After applying: both triggers exist, grants match the suites (no authenticated access to the outbox or its claim function, no anonymous dashboard access, anonymous store lookup allowed), the outbox is empty, and security advisors show only the pre-existing leaked-password-protection warning and two INFO no-policy notices. This PR also narrows the `compensation.sql` backfill assertions to the suite's own orders so it can run on the shared database.

Artifact `14883356729` (19,928,211 bytes) matched SHA-256 `cadd89b550af84a362da6311b25baccf76d0a187164d66ec60552d78b509c67f` before extraction and upload. Staging returned deployment `39d82de784ed4e6eaba83a850169fdb0` and production `7049a575b9e143a4b97389099e755bfd` (same etag `7cbdbb11300b58e3c0d952d944e541f9a03d6dfdf3b768120b6a2ad116c9f7d4`); the notification schedule was reapplied on both. Live checks on 24 November: 53/53 HTTP/API cases passed on staging and production, with the unknown-collection catalogue count adjusted to 3 only for that run because the staging QA product is in the shared catalogue. On both, `POST /api/internal/compensation` returns 503 (not configured), signed-out `/admin/compensation`, `/admin/distributors` and `/distributor` redirect to login, `/d/QA-CHECKOUT` returns 200, and `/api/health` still reports commerce, payments and Xendit disabled. Staging product JSON-LD includes an Offer only for the opened QA product. Production logs over about 75 seconds showed one minute-cron run `ok` on the new version and no exceptions or error logs.

Scope and state:
- **Order confirmation and low-stock emails:** queued by the database; nothing sends while `EMAIL_PROVIDER` is not `resend`. Receipt wording still needs RIWAY approval.
- **Compensation outbox:** paid and reversal events now queue for every newly paid order; delivery stays off (`COMPENSATION_PROVIDER` unset) until RIWAY's API contract exists. Orders paid before this release have no events; `enqueue_missing_compensation_events` can backfill up to 31 days when needed.
- **Analytics events, Product JSON-LD, legacy redirects (empty), distributor dashboard and staff tools:** live in code; analytics stays inactive without measurement IDs.
- Not covered: signed-in staff/distributor pages against the live database, email delivery, and any RIWAY integration.

## Previous live release - Xendit calls work on Cloudflare Workers

PR #39 merged as `ecc5f4b2a1f5526fb4431f25019c760d74032e58`. PR CI runs `45143014218` and `45143022083`, and merge CI run `45144847944`, passed the `verify` and `postgres-concurrency` jobs. No migration.

Artifact `14802344346` (19,787,648 bytes) matched SHA-256 `876c95f0973f66c2b5dad7299724f7ebe57df51d18935f6b086f303d9a53a0d2` before extraction and upload, and the bundle's Xendit request uses `redirect: "manual"`. Production returned deployment `0b9712005cc7418bb294e1e0e2b696cd` and staging `f6dde9fbc2b340a6b1e6a6a37974c8e6` (same etag `772e0bf461f4ef4b354e948550c892915c5e71f6a2f24857c0e7d9c91d9d0e51`); the notification schedule was reapplied on both. Live checks on 23 November: 53/53 HTTP/API cases passed on production and staging. One catalogue count was adjusted only for that run, because the temporary staging QA product is in the shared catalogue. Production logs over two minutes showed the minute job running with no Xendit errors or exceptions.

Scope:
- **Fix:** the Xendit service called `fetch` with `redirect: "error"`. Cloudflare Workers reject that value, so every Xendit request failed before leaving the Worker and checkout reported "Payment could not be opened". Found by manual checkout testing on staging; Node-based tests had accepted the option. Requests now use `redirect: "manual"`, and an unexpected redirect is an uncertain outcome.
- **Logging:** checkout, resume, the Xendit webhook and the minute worker log one sanitised JSON line per Xendit failure (no secrets or reply values).
- **Manual staging test (Xendit test mode, synthetic QA data):** two orders paid via GCash and Maya, stock deducted once per unit (50 to 47), method switching cancelled the old Xendit link, double submission created one order, and an unavailable method was refused with no order. Xendit refused `BPI_ONLINE_BANKING` with `INVALID_PAYMENT_CHANNEL` (account/channel configuration). No Xendit webhooks arrived; confirmation came from the minute worker.
- **Configuration note:** the four Xendit/Supabase secrets were also added to the production Worker. Its Xendit checkout stays disabled (`xendit: disabled`), but its minute job now also reconciles test-mode attempts from the shared database; before this release that failed on the old code.
- **Test update:** `tests/integration/http.mjs` now checks that payment reconciliation refuses unauthenticated callers (401 once `PAYMENT_WORKER_SECRET` is set, 503 before).

## Previous live release - checkout refuses unavailable payment methods before ordering

PR #36 merged as `1c4af9f9e4d3001ebe067d62f21d24fb6ac6d689`. PR CI runs `45132269784` and `45132276516`, and merge CI run `45132769689`, passed the `verify` and `postgres-concurrency` jobs. No migration.

Artifact `14798711435` (19,786,488 bytes) matched SHA-256 `94a2ae8a41e32daccab84494e3ea2dc989dca7779f159721026bc79a72dc3eed` before extraction and upload. Production returned deployment `39c123e513b04579905161413e7aa457` and staging `86bc410c8f9544a2b2ed07d9f9398929` (same etag `020b7d4b40e46c65f251136adacecc3ec470c11cc8b0644d465132e402301b74`); the notification schedule was reapplied on both. Live checks on 23 November: 53/53 HTTP/API cases passed on production and staging, a 27-route desktop and mobile sweep of production was clean, and cross-origin checkout is refused (403). The deploy script ran without `--env` as fixed in PR #35.

Scope:
- **Fix:** checkout now checks the chosen Xendit method against the documented catalogue and the market's enabled list before creating the order. Previously an unavailable method was refused only after the order and its stock hold existed.
- **New test:** `tests/unit/checkout-flow.test.ts` runs the full server-side checkout (quote, order, Xendit payment, method switch, expiry, webhook, minute worker) against the real migrations, with only the Supabase client and `fetch` replaced; 10/10 scenarios pass.

Not covered: a browser checkout on staging and a real Xendit sandbox payment. Both need staging's Xendit secrets and an approved market, product and sponsor. Production checkout stays closed (`payments: disabled`, `xendit: disabled`).

## Previous live release - descriptive page titles

PR #34 merged as `38262da318ac24472d432a226b91d0e13a6b9f30`. PR CI runs `45121166773` and `45121194349`, and merge CI run `45122147609`, passed the `verify` and `postgres-concurrency` jobs. No migration. The Playwright e2e steps in CI are still skipped because the `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` repository variables are unset. The e2e suite was instead run against staging and production from a local Playwright install.

Artifact `14794102392` (19,784,428 bytes) matched SHA-256 `510e8399968ce1c23c01e35275d5efa2ed6f25e892312ca3e08038347b2b25cd` before extraction and upload. Cloudflare returned deployment `730b50c93c3245df9db2c12363322cb4`, etag `370e7a29cd8d156e1a79a604b6e6770f181dd5e633fa1e423a17b229823909d2`; the notification schedule was reapplied. Live checks on 23 November: 53/53 HTTP/API cases passed; a 27-route desktop and mobile sweep found no errors, failed requests, broken images or overflow, and no page that should be titled still has the generic title; the corrected WebGL-fallback e2e test passed on both viewports.

Scope:
- **Titles:** product pages take their title and description from the product, legal notices from the notice, and the sign-in, register, password, account, orders, staff and distributor pages have fixed titles.
- **Test fix:** the WebGL-fallback e2e test now identifies the PURTIER page by its title. It still expected the hero heading from before the 16 November restoration.
- **Deploy script fix (this PR):** without `--env`, `deploy-cloudflare-artifact.mjs` ignored the bundle path, a regression from PR #33. The first production attempt for this release therefore stopped before uploading anything. The fixed script deployed it.

Staging (`riway-platform-staging`) was deployed beforehand with PR #34's own verified build (artifact `14794080781`, deployment `c8eab3d759ef47c6840f041f86b1bc91`) and passed the same checks.

## Previous live release - Xendit gateway with per-market xenPlatform sub-accounts

PR #31 merged as `0992a27a80966fd20820318f626ce095d30c60b5`. PR CI runs `45113303131` and `45113334150`, and merge CI run `45113480043`, passed the `verify` and `postgres-concurrency` jobs, including the new `xendit.sql` suite.

Hosted migration `20261123090000_xendit_payments.sql` is applied under the same version as the repository file. All 23 functions it creates or replaces match a locally migrated database by body hash and security mode. Beforehand, the migration and `tests/security/xendit.sql` ran on the hosted database inside one rolled-back transaction and passed; a follow-up query found no table, function, QA user, product or audit row retained. Security advisors show only the pre-existing leaked-password-protection warning and the two documented INFO no-policy notices.

Artifact `14790357826` (19,783,513 bytes) matched SHA-256 `5c74014ddd1044c324c2c384c03702c6c64d58785de15802113caed8d54f4372` before extraction and upload. Cloudflare returned deployment `d8ecd8c4e8674139a4acf086731558a0`, etag `42c9c35fbd16bbf4c328f193a15d6f1a77c279875395c6ab2cb7d38ccf85a3b4`; the notification schedule was reapplied. Live checks on 23 November passed 53 HTTP/API cases. `/api/health` reports `"xendit":"disabled"`, `/api/webhooks/xendit` returns 503 (not configured), signed-out `/admin/payments` redirects to login, and cross-origin checkout is refused with 403.

Scope: Xendit Payment Sessions (hosted) beside Stripe. Customers choose gateway, then method, then bank (PH online banking, MY FPX); each market's live payments are routed to its own xenPlatform sub-account; the webhook is verified by `x-callback-token` and re-read from Xendit in the attempt's own account; stock is deducted once and late, excess and orphan payments are flagged. Nothing is active: no Xendit keys, sub-accounts or channels are configured, `PAYMENT_PROVIDERS` is unset, and all market sales/payment gates remain false. The removed `deploy-payment-gateway.yml` workflow (direct branch deploy) never ran successfully. Activation and a sandbox payment need RIWAY's Xendit dashboard access; see `XENDIT.md`.

## Previous live release - GA4 / Meta Pixel behind opt-in consent

PR #29 merged as `c62f969acacad74fef24770e756c10124acd42b9`. PR CI runs `44042601148` and `44042609567`, and merge CI run `44042810327`, passed the `verify` and `postgres-concurrency` jobs. No migration.

Artifact `14309962630` (19,641,642 bytes) matched SHA-256 `4a20714677879ffd5c43b8a1d2e043d2f446e7f15670b61d661c470891445c0d` before extraction and upload. Cloudflare returned deployment `51cf189c5df048c1b60e483521eeefcc`, etag `308069bca8ea19fae28ce45943eef725780c096b9470088363a1ce0caa58365c`; the notification schedule was reapplied. Live checks on 17 November passed 53 HTTP/API cases. No measurement IDs are configured, so the live CSP lists no Google or Meta origin, pages contain no tag, Pixel or banner markup, and the cookie notice still states that no analytics or advertising cookies are enabled.

A local production build with placeholder IDs was checked in a browser:
- **CSP:** the header added only the Google and Meta origins.
- **First visit:** the banner showed with no scripts loaded.
- **Necessary only:** nothing loaded.
- **Analytics only:** GA4 loaded with consent mode all denied by default, then only analytics granted.
- **Withdraw:** the page reloaded and the planted `_ga` cookies were removed.
- **Allow all at 375px:** GA4 and Meta Pixel loaded with ad signals granted; no overflow or console errors.

Activation needs RIWAY's IDs as the `NEXT_PUBLIC_GA4_MEASUREMENT_ID` / `NEXT_PUBLIC_META_PIXEL_ID` repository variables, a rebuild, and legal approval of the notices. Real data receipt was not tested.

## Previous live release - scheduled sales report emails

PR #27 merged as `4d59e03cb9f715c4b8a9e466171829ab259039b6`. PR CI runs `44041063559` and `44041072119`, and merge CI run `44041326003`, passed the `verify` and `postgres-concurrency` jobs, including the new `scheduled_reports.sql` suite.

Hosted migration `20261117074357_scheduled_sales_reports.sql` was applied before the merge. It replaces `private.notification_authorized` to add a `sales_report` case; the hosted function body was compared with the repository version first and matched. Beforehand, the migration and `tests/security/scheduled_reports.sql` ran on the hosted database inside one rolled-back transaction and passed; a follow-up query found no table, QA users or function change retained. Security advisors show only the pre-existing leaked-password-protection warning and the two documented INFO no-policy notices.

Artifact `14309387829` (19,634,245 bytes) matched SHA-256 `97d262223c5d232881b0db24c9c9828459eca3bfab76c230b25694b343d194e2` before extraction and upload. Cloudflare returned deployment `d426e53c795149e59825a9a88dc14473`, etag `5448df16418c17dd2e2e599f60c175c5967c890d1f19682619022751ae33c4a7`; the notification schedule was reapplied. Live checks on 17 November passed 53 HTTP/API cases; signed-out `/admin/reports` redirects to login, and the notification worker still returns 503 (not configured) because email delivery is off.

Scope: market admin/operations staff with verified MFA subscribe themselves per market to weekly (Mondays, previous Monday–Sunday) or monthly (1st, previous month) sales summary emails. Reports are queued at the existing daily report hour, deduplicated per period, and rechecked against the subscription and role at delivery. Nothing is sent until RIWAY enables email. Real delivery and the signed-in panel were not tested.

## Previous live release - cross-sell and package upsell

PR #25 merged as `2977b11f23e4bfb54c86c81be46043508b49e230`. PR CI runs `44039521408` and `44039530657`, and merge CI run `44039788841`, passed the `verify` and `postgres-concurrency` jobs, including the new `recommendations.sql` suite.

Hosted migration `20261117073214_product_recommendations.sql` was applied before the merge. Beforehand, the migration and `tests/security/recommendations.sql` ran on the hosted database inside one rolled-back transaction and passed; a follow-up query found no table, QA users or QA products retained. Security advisors show only the pre-existing leaked-password-protection warning and the two documented INFO no-policy notices.

Artifact `14307894289` (19,624,466 bytes) matched SHA-256 `3e3da296ed4e54b881bf4623964100be1340ba96035f6f0e5ca045a5df62a26c` before extraction and upload. Cloudflare returned deployment `232f799ba6db43d5b232bca2488519e9`, etag `8b968a2f2f54958325ca23ea17cf898e6c24e411a447a7842b3bc3c61483ef21`; the notification schedule was reapplied. Live checks on 17 November passed 53 HTTP/API cases. `/shop/purtier-placenta` and `/shop/conscientious` return 200 without a suggestion section, because no curated links or approved packages exist yet; signed-out `/admin/products` redirects to login.

Scope: admin, editor or compliance staff with verified MFA curate up to four "pairs well with" products per product, and product pages list approved packages in the visitor's market that contain the product. Nothing is recommended automatically. The signed-in staff form was not checked in a browser.

## Previous live release - sales report channel breakdown

PR #23 merged as `c34ca06f71bb458eda3cfc27f428afb1e7de9330`. PR CI runs `44038065671` and `44038073008`, and merge CI run `44038316873`, passed the `verify` and `postgres-concurrency` jobs.

Hosted migration `20261117072057_sales_report_channels.sql` replaces `private.staff_sales_report` and adds `byChannel`; the other breakdowns are unchanged. Beforehand, the migration and the extended `tests/security/reports.sql` ran on the hosted database inside one rolled-back transaction and passed; a follow-up query found no QA users retained and every market still closed. Repeat-purchase lookups use the existing `orders_user_created_idx`.

Artifact `14308795579` (19,617,421 bytes) matched SHA-256 `142c05eb5581806e7ee8413ab138ee5ad7d99b93ce40ab5c26b5cb6364607654` before extraction and upload. Cloudflare returned deployment `9e79cbeffe364d13a5c7f88068aa456a`, etag `aef84b2f1b761331d5ecd08866334c17f7971a26f18889e839e102562ca14d6e`; the notification schedule was reapplied. Live checks on 17 November passed 53 HTTP/API cases; signed-out `/admin/reports` redirects to login and `/api/admin/reports?kind=channel` returns 403.

Channel definition, pending RIWAY confirmation: every online order is distributor-attributed, so settled online orders are split into membership enrolment, first purchase and repeat purchase, with voucher-order counts. Offline and service-centre sales stay in RIWAY's systems. The signed-in staff report page was not checked in a browser.

## Previous live release - unpaid order cancellation

PR #21 merged as `d1f9f03784d7c486b1a56f6e136c1c047fc3df5d`. PR CI runs `44036606120` and `44036614183`, and merge CI run `44036875205`, passed the `verify` and `postgres-concurrency` jobs; the PostgreSQL job loaded all 20 migrations and ran the new `cancellation.sql` suite.

Hosted migration `20261117070936_order_cancellation.sql` was applied before the merge. Beforehand, the migration and `tests/security/cancellation.sql` ran on the hosted database inside one rolled-back transaction and passed; a follow-up query found no cancellation table, QA users or QA products retained and PH online sales still closed. Security advisors show only the pre-existing leaked-password-protection warning and the two documented INFO no-policy notices.

Artifact `14306919697` (19,616,218 bytes) matched SHA-256 `ec3fcce68ad1400bcbac95360cc91b714f84ed23a864a6af69c7ae888977ee1c` before extraction and upload. Cloudflare returned deployment `8ac15f8945fd436a9238502f815d593f`, etag `f9eae1cd78ca37e56b78852d2c0a2e796c5eaaf55dc0a4897af8a1d53e73959b`; the notification schedule was reapplied. Live checks on 17 November passed 53 HTTP/API cases; signed-out `/account/orders/<id>` and `/admin/orders?order=<id>` redirect to login.

Scope: the owner, or market admin/operations staff with verified MFA and a reason, can cancel an unpaid order that has no payment attempt. The stock hold, reserved voucher use and pending membership enrolment are released, and the cancellation is recorded and audited. Paid orders and orders with a started payment are refused; refunds remain deferred. Signed-in customer and staff browser flows were not tested: no live session was available and closed markets mean there are no live orders.

## Previous live release - sitemap, hreflang and launch-gated indexing

PR #19 merged as `fe78547566d362b49e1eaea716fadd114f1dd6bc`. PR CI and merge CI run `44035269496` passed the `verify` and `postgres-concurrency` jobs. No migration or provider change.

Artifact `14306538391` (19,608,932 bytes) matched SHA-256 `977987aaf926292bdc2505e3172a4ac1570f1ffcf1e15f66b77f4d657026439c` before extraction and upload with `scripts/deploy-cloudflare-artifact.mjs`. The first upload attempt failed with Cloudflare 401 at the Worker upload step after assets were sent; an immediate retry succeeded. Cloudflare returned deployment `9a692d7441ec486992105b7b1d822412`, etag `20e771c75ca5ddd735b87828ed171c34841eb5c9bb038391d0b5230e4ea389d1`; the notification schedule was reapplied.

Live checks on 17 November passed 53 HTTP/API cases. `/robots.txt` still returns `Disallow: /` and pages still carry `noindex, nofollow`, because `SEARCH_INDEXING` is not set. `/sitemap.xml` returns 17 URLs with `en` and `x-default` hreflang alternates. Setting `SEARCH_INDEXING=enabled` after RIWAY approves launch opens public pages, keeps private/staff/checkout/distributor-link paths disallowed and advertises the sitemap; that path was verified on a local production build only. Per-locale hreflang awaits localized URLs.

## Previous live release - membership enrolment and Next.js 16.4.6

PR #15 merged as `28aefffa4e1265f4af4d1508a62317c303bcb6f8` from tested head `6fe628c`. Merge CI run `44004935400` passed the `verify` and `postgres-concurrency` jobs.

Hosted migration `20261117021010_membership_enrollment.sql` was applied before the merge. The rollback-only `tests/security/membership.sql` suite passed on the hosted database; a follow-up count found zero retained QA users or products, membership rules, enrolments, memberships, orders, reservations, membership notification jobs, Stripe events, commerce offers or staff roles. PH/SG/MY sales and payment gates remain false. Security advisors show only the pre-existing leaked-password-protection warning and the two documented INFO no-policy notices.

Artifact `14293693155` (19,563,865 bytes) matched SHA-256 `729bf1748d7cd37b8a76b0295ae76664fffe110fe60d12b2da6b8e6ec4afa929` before extraction and upload with `scripts/deploy-cloudflare-artifact.mjs`. Cloudflare returned deployment `3ba00f75d67c4d328af02a1a91e59069`, etag `26f2d0544fc8b629dc3a90082c5effc450e72cb3aabc5ef3e863ddd8755466c9`; the notification schedule was reapplied. Live checks on 17 November passed 53 HTTP/API cases and all 106 bundled static assets. `/membership` and `/membership/demo` serve the new content; `/account/membership` and `/admin/memberships` redirect signed-out visitors to login. Signed-in account and staff membership pages were not tested: the browser had no live session and the user chose to skip that test. No independent traffic-percentage query was made.

## Previous live release - manual audit catalogue and bag fixes

PR #13 is merged and published. Tested source `d0ac3d1d06482534cc6cf2a1c64e4bea26711471` and merge `efce884dc3018690e9c41a4a9d7c4a234c91b28d` have identical trees. Live browser checks reproduced repeated-query crashes, repeated/unknown collection selector mismatches, blank quantity edits removing products and quantities exceeding a market maximum. The release normalizes catalogue parameters, preserves quantity drafts, validates whole quantities against the offer limit, and keeps removal explicit. Existing oversized saved selections remain visible with correction feedback. Empty selections can now be explicitly saved to an account, and save/restore actions cannot overlap. The restored presentation remains unchanged.

Validation passed: 313 unit tests across 31 files, TypeScript, local production webpack build, 53 local and live HTTP/API checks, 12 product/market checks and 18 calendar checks. Push/PR/merge CI runs `43819865760`, `43819901298` and `43820116547` passed, including dependency audit, PostgreSQL rollback/concurrency suites and Linux Next/OpenNext/Worker packaging. Conditional CI browser steps were skipped because repository configuration was absent; these are not browser passes.

Artifact `14203694089` (19,547,191 bytes) matched SHA-256 `c93cb37a4d7526a6932270083562126bcd1731f57dc98feb59dde14978cca284` before upload. Cloudflare returned deployment `206f0803dc09453b9d07195d890926bc`, etag `0eef0e918cfc5781a448690237921450aa63d0af226321ceaa4be1e4d87ac5b8`. Live verification around 14:58 Asia/Shanghai passed all 105 assets, 47 route scenarios, two discovered links and 28 discovered assets without server/application errors. Five missing-record routes retained streamed HTTP 200 with 404/noindex/custom UI payloads, not literal HTTP 404 responses. The live cart references `/_next/static/chunks/0cq56l42hnom9.js`, matching artifact SHA-256 `0f372bdd616e778f91557246b0805886f84f6e4d546f7df3afd6d8e56a32be33`. Three restored-presentation markup checks and the unchanged stage-module integrity check passed. No independent traffic-percentage query was made.

Manual execution remains incomplete. Recorded passing subtests include search/empty/reset behavior, market persistence, wheel keyboard selection/expansion, menu Escape/focus, user-assisted login, profile rejection and address add/delete/persistence. Post-fix interactive retests and remaining account/staff/store workflows are pending: browser access became unavailable. The live database has no corporate staff roles, verified active distributors, orders or future published events, and only one store-owner membership; this is not sufficient for staff/operator/viewer, distributor, order-isolation or event acceptance. The current account has platform-admin/store-owner access and an enrolled authenticator, but its last observed browser session still required MFA verification. No privileges were granted. The QA address was removed, and no orders or support tickets were created. Supabase's existing leaked-password-protection warning remains. No migration or provider activation was introduced; payments/email remain disabled and Tax deferred. The full proposal and operational acceptance remain incomplete. Earlier entries below are historical.

## Previous live release - reference design restoration

The user's requested homepage/product presentation restoration is merged and published through PRs #11 and #12. The original event-photo row, italic product hero typography, PURTIER manifesto/cinema/detail/archive sections and CONSCIENTIOUS split/detail/ritual grids are restored. Approved catalogue/metadata gates and market notices remain. Archive photographs are labelled separately from confirmed event schedules. A final visual check found the paired CONSCIENTIOUS cartons covering the restored headline; desktop opening/next-frame placement and width fitting now reserve the caption column and update after a debounced resize. Duplicate jar canvas IDs were removed. Checkout, account, admin, provider and database functionality are retained.

Final tested source `cc75db49aef1fdd5d6b10ebb4283080bc9ca4f6e` merged as `fba4b0092113315d30f970cb3c60c6118d883e9a`; both have tree `7867865a2887a9135672444f9510728eae2d04f2`. Final push/PR/merge CI runs `43811297852`, `43811306808` and `43811607769` passed, including 292 tests across 29 files, TypeScript, audit, eight PostgreSQL rollback suites/concurrency and Linux Next.js/OpenNext/Worker packaging. Local production build, 49 HTTP/API cases and 12 product/market cases passed. Local dev hot reload was not counted as browser acceptance; rendered checks used the production build. Conditional CI browser steps remained skipped.

Verified artifact `14199853955` is 19,544,709 bytes and matched SHA-256 `7008e1efc98afa5a2b55cf6124d6af441bf6fdad065c4cb7378d59be863e857e` before upload. Final Cloudflare `deployment_id=2f0e9aff57c44b48adb61dafb99ad09c`, `etag=ddaf8ddc5b0e438f921dc5ef2131a0b837803d382b41ec02e71972ed6041c6c0`. This supersedes the initial PR #11 restoration upload `6e3f4209fe924a669d7f693e1210ea73`. Live verification at approximately 13:40 Asia/Shanghai on 16 November passed 49 HTTP/API cases, 12 product/market cases, 18 calendar/home cases, all 105 assets, and the restored markup checks for all three presentation routes. All 47 route scenarios had no server/application errors; 42 public/private status expectations matched, and the five missing-record URLs retain documented streamed HTTP 200 responses with 404/noindex/custom-not-found payloads. Two additional discovered links and 28 discovered assets had no failures. The new stage client module `/_next/static/chunks/3-7s7l5lbidk_.js` matches artifact SHA-256 `e94a2b405fc1ed9972edd7fcb1b36ce2a5dc6b184d90b47518c3c38d920b6a6f`. No independent traffic-percentage query was made.

Focused public presentation checks in the in-app browser verified desktop/mobile layouts and the CONSCIENTIOUS theme switch. The framing follow-up was checked at 1280, 1440, 1024 and 390 pixel widths, including resizing, with no horizontal overflow; corrected live framing and restored gallery were inspected and screenshots saved. Temporary viewports were reset and preview servers/tabs closed. This is not full authenticated browser UAT or provider acceptance. No migration, hosted write, new credential or provider activation was introduced; Supabase Auth/Storage remain active, payments/email disabled and Tax deferred. Earlier full-proposal and operational gaps remain. The dated sections below are historical.

## Previous live release - approved package and voucher checkout

PR #10 merged as `72028f573c7a481493a723f4e01f69a4d342c182`. Its tree `e870d220caf29ecf9f76721190db9bb1cf0c2f8b` exactly matches tested source `e482cfc4bef0e5354a711ffdf124ec2f06148324`. Final feature/PR CI runs `43796432487` and `43796437299`, and merge CI run `43797210241`, passed: 290 automated tests across 29 files, TypeScript, dependency audit, production Next.js/OpenNext builds, Worker packaging, eight real PostgreSQL rollback suites and concurrency acceptance. The latter covers last-voucher capacity, reuse after expiry, preparation/expiry coordination and the existing stock/payment/draft races. The initial run exposed an invalid lowercase voucher fixture; correcting that fixture preserved the production validation rule. Conditional browser steps remained skipped.

Artifact `14194965948` (19,536,839 bytes) independently matched SHA-256 `6e78412799204afd8f0b3e39b6028f13bcd00a35529a3885f34a1521d8f8de93` before extraction/upload. Cloudflare returned `deployment_id=6076725477584d269a39cfda43f10ce4` and `etag=38d57a55f2b006766d7a7a99da268ec79d94f9f0315b5657e2480e95f8fa7f7d`. Live checks at approximately 11:18 Asia/Shanghai on 16 November passed 49 HTTP/API cases, two additional discovered links, 12 product-publication cases across PH/SG/MY and all 105 artifact assets, with no asset retries needed. Of 47 route scenarios, 42 public/protected route status expectations matched; five deliberately missing record paths returned HTTP 200 and are not counted as HTTP 404 passes. The updated checkout module `/_next/static/chunks/3ypu5208edwfp.js` matches artifact SHA-256 `3ef6f58bc62af33de8659587bf772181951d00a8ac8dc50738d7d14751d61d6d`. These checks show the updated application is serving; no independent traffic-percentage query was made.

Hosted migration `20261116030711_approved_commerce_checkout.sql` is applied, and hosted history matches all 16 source migrations. The rollback-only commerce acceptance suite passed. Cleanup verified zero retained QA users, orders, reservations, approvals, physical snapshots or voucher redemptions. Five anonymous quote/order/approval/withdrawal/staff RPC calls were denied with `42501`; the separate public composition-shape check passed with an empty result. New public entry points are invoker wrappers. Security advisors show no new warning; the pre-existing leaked-password-protection warning remains: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . The two INFO no-policy notices remain for intentionally denied internal identity/notification tables.

This release adds immutable, revision-specific approvals and withdrawal history; reviewed server quotes; approved package component aggregation/reservation; exact one-voucher discounts and capacity lifecycle; net order history/Stripe snapshots; and legacy-order/expiry safeguards. See `COMMERCE-CHECKOUT.md` for contract semantics. No approved campaigns, prices, stock or business policies were invented. Runtime inspection confirms Supabase Auth/Storage, disabled payments/email and the existing dormant minute schedule; market sales/payment gates remain false and Tax remains deferred. Real payment-provider transactions and authenticated browser acceptance were not performed. Advanced promotions, bonus bottles, qualifying membership packages and the broader proposal scope remain incomplete. The dated sections below preserve earlier release evidence and are superseded where this release closes their pending work.

## Previous live release - regional calendar and commerce preparation

PR #9 merged as `89c8a423ff3d3471b85591a60ebb89953d9aa9ad`; its tree `4f0cc8c935ca7c32c3add75e651a5ee992c1c11d` matches tested source `f9dc5aca78ca6f9971816d12f9c1b1248291d82f`. CI runs `42779365300`, `42779376657` and `42779957971` passed, including 252 automated tests, TypeScript, audit, seven real PostgreSQL rollback suites and competing draft edits (one accepted, one conflict), plus the existing stock/payment races. Local standalone PostgreSQL could not start under the Windows restricted token; Linux CI supplies that concurrency acceptance. Browser steps remained skipped.

Artifact `13745731187` (19,513,928 bytes) independently matched SHA-256 `f4b21d502482950823f3102f5859a92adb33bed16d031676ff6f9628629aecd5` before deployment. Cloudflare returned `deployment_id=22187a3f12de47669dac96aaf4577d64`. Verified live at approximately 16:08 Asia/Shanghai on 10 November: 44 HTTP/API checks, 18 calendar/home checks across PH/SG/MY, 47 route scenarios and all 105 artifact assets pass. One image HEAD timed out; a targeted GET returned 200 and matched the artifact bytes. The draft client module `/_next/static/chunks/3t36i4uf0j9yn.js` matches artifact SHA-256 `faa71c1ab88e00f215a2f2e095b22a1c1b94fb3c0731c2b1027aea16b48d26a8`. No independent traffic-percentage query was made.

Hosted history now matches all 15 local migrations, including `20261110075101_stripe_rpc_hardening` and `20261110075752_commerce_drafts`. Hosted Stripe and draft rollback tests passed; cleanup verified zero retained QA users/products, orders, reservations or drafts. Anonymous Data API calls to both draft RPCs were denied with `42501`. Direct private-table grants remain absent, public entry points are invoker wrappers, and the two payment public-definer warnings are cleared. Health advisories are empty. The pre-existing leaked-password-protection warning remains: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . The two INFO no-policy notices concern previously denied internal identity/notification tables.

The public calendar/homepage now use actual published CMS events with market-local date handling and real detail links. Admin/compliance staff with MFA can prepare versioned package/promotion drafts. These drafts do not implement checkout package pricing, voucher redemption, bonus bottles or membership qualifications; see `COMMERCE-DRAFTS.md`. No business rules, events, prices or stock were invented. Runtime still uses Supabase Auth/Storage with payments/email disabled and Tax deferred; no provider credentials or new live transaction was introduced. Earlier sections preserve prior release evidence.

## Previous live release - product publication and referral continuity

PR #8 merged as `d4ad01c87b0d869faf563054810329e4eada0ebc`, whose tree matches tested source `de7d0045746c51e35d5d9617c390f45d8b4aff0d`. CI runs `42774327121`, `42774335080` and `42774956816` passed, including real PostgreSQL concurrency/security, 166 automated tests, TypeScript, dependency audit and Linux/OpenNext packaging. Artifact `13743077087` (19,478,689 bytes) independently matched SHA-256 `53cc0e7c0d00ab052883ee621bef87b7206672713aee7c639e64adc466b6f794` before upload. Cloudflare returned `deployment_id=7d49cc408deb42729df209f359ec9dff`.

Verified live on 10 November at approximately 15:29 Asia/Shanghai: all 42 HTTP/API cases, 45 route scenarios, 12 product publication cases across PH/SG/MY, and all 103 artifact assets passed. One asset HEAD request initially timed out; its targeted GET retry returned 200 and matched the artifact byte hash. The live referral client module `/_next/static/chunks/1a6nm935ros0g.js` matches artifact SHA-256 `223fff7aae36ecf08778a86d4893f0a4f100ba2daa1186cefea5c2c9f1214b0d`. These checks confirm the updated application is serving; no independent deployment traffic-percentage query was made. Local 42 HTTP checks and 12 market-content checks also passed. Browser interaction testing remains declined and is not counted as a pass.

Product brand routes and metadata now respect published catalogue records, with neutral presentation copy, shared market notices and corrected footer anchors. Guest referral continuity uses a revalidated, host-only HttpOnly 30-day functional cookie, explicit clearing and the existing immutable user-scoped claim before checkout or after sign-in. Simultaneous anonymous first visits can race before a cookie exists; this is not distributed atomic first-touch attribution. Full approved content migration and authoritative member/compensation integration remain pending.

Cloudflare login succeeded after the user completed the final authorization step. Supabase tools remain unavailable despite the user's intent to reconnect, so `20261106083403_stripe_rpc_hardening.sql` is still pending hosted application; no advisor clearance is claimed. This phase introduced no schema change, server credentials or provider activation. Runtime inspection confirms Supabase Auth/Storage, disabled payments/email and the existing minute schedule. Tax remains deferred. The sections below preserve older release evidence.

## Latest live release - Stripe Payments disabled

PR #7 merged as `6522b990faa74689bcf5b655b33c535b7b73d8d5`, with a tree identical to tested build `79ef39cc5bbcede779f7071aea5f76627204c48e`. CI runs `42189319675` and `42189327485` passed, including real PostgreSQL concurrency (one applied payment transition and nine duplicate acknowledgements), six SQL suites, 126 tests, TypeScript, audit and Linux/OpenNext packaging. Artifact `13489445790` matched SHA-256 `36908b2606053546a8439120c9b962d75332dc5af15dcd2ee35e6e37d948bd29` before deployment. Worker upload returned `deployment_id=6b44ff1d1f7a4750a43e62b1382048db`; live HTTP and client-module hashes confirm the new app is serving. The renewed OAuth scope did not allow an independent traffic-percentage query, so none is claimed from it.

Post-release checks passed 35 HTTP/API cases, 45 route scenarios and all 103 static assets. The user explicitly requested deployment disabled, credentials later and Tax deferred. `PAYMENT_PROVIDER=disabled`, `STRIPE_MODE=test`, `STRIPE_LIVE_APPROVED=false`; automatic tax is false. No Worker server secrets, Stripe webhook endpoint, real payment or false paid order was provisioned. Supabase Auth/Storage remain active and email disabled.

Hosted migration `20261106083056_stripe_checkout.sql` is applied. Its rollback-only Stripe suite passed, and cleanup verified no retained QA users/products, orders, reservations, attempts or events. Source migration `20261106083403_stripe_rpc_hardening.sql` is tested but pending hosted application because Supabase tools disconnected and the CLI has no login. It moves the two owner/market/MFA-checked read implementations behind private helpers/public invoker wrappers. The user said they would reconnect; at the last check the tools remained unavailable. Do not claim that advisor warning has been cleared remotely. The existing leaked-password-protection warning remains separate. Credentials and real provider acceptance remain pending; this is not the full proposal delivery. See `STRIPE.md`.

Older release sections below are historical.

## Current live release — QR follow-up and feature audit

PRs #4–#6 are merged. Current application merge revision is `0885d05a5d1d8da63aa0d91b6295a7c5e7b4035b`, whose tree exactly matches verified build source `2fb761adddf06ee005f2838a8118c43862ba7502`. Both CI runs `42178283974` and `42178319133` passed. Artifact `13484306364` independently matched SHA-256 `dc1fa8198c46741b5de7546a1334bc27b8e4885e6b242e5864947f3dedb7e9b6` before deployment. Cloudflare version `85b6f7b0-3b40-49e5-92d6-50c27aae8287` serves 100% of traffic, deployed at 15:06 Asia/Shanghai. Its live authenticator module byte hash matches the artifact.

Authenticator setup now draws an inline QR directly from the enrollment URI and includes a manual setup key. The user confirmed the QR and setup-key option appear. Completing authenticator verification and signed-in browser acceptance remain pending. Order/admin pagination now rejects fractional values. Local verification passed 97 tests and TypeScript; all five hosted rollback-only SQL suites passed. Post-deployment checks passed 30 HTTP/API cases, 45 route scenarios and all 103 static assets. Browser interaction testing was explicitly declined. Initial intermittent Cloudflare 1101 responses on two missing-record paths did not recur, but their original cause remains unconfirmed.

Runtime remains Supabase Auth/Storage with email/payments disabled and the minute cron dormant. Public DNS still returned NXDOMAIN for the three Resend verification records at inspection. Provider setup, content/store provisioning and commercial acceptance remain outstanding. No new migration was needed for this release. Earlier release sections below are historical.

## Previous live release — notification activation fixes

PR #3 is merged into `main` as `8a54bef0bcff237b40f504ebafc96cc8d08342d4`. That exact application's verified Linux artifact was deployed at 14:20 Asia/Shanghai on 6 November 2026. Cloudflare version `0fbdcdd1-f065-4bd6-b349-06eeedf87e1d` is serving 100% of traffic; deployment ID `3dd9b70d-129a-4882-a0b2-9a8a27b87838`. The prior version was `30d39e7c-416a-402a-831a-9fb04722d5ba`.

The twelfth migration, `20261106060000_notification_activation_window.sql`, is applied and recorded in hosted migration history. It starts the 23-hour retry safety window at first claim instead of creation, so messages queued while email is disabled are preserved. It recovers only expired jobs with zero attempts; attempted jobs retain their original conservative deadline, and previously sent messages remain terminal. Exclusive leases, the six-attempt limit and service-only access are preserved. Before applying it, the hosted history matched the eleven prior migrations and the queue had zero jobs/active leases. Afterward the new column/function and all twelve versions were verified, and anonymous/authenticated queue claims remained denied while service-role claims remained allowed.

The notification endpoint now checks sender, reply-to, worker credentials, website URL, timezone, report hour and test allowlist before claiming work. Resend's `concurrent_idempotent_requests` conflict is retried with the same key; changed-payload conflicts remain permanent errors. MFA-verified RIWAY super admins see delivery configuration and missing setup on `/operations`, including before the first store exists. No credential values or test-recipient addresses are rendered.

Local verification: 86 tests across 13 files, TypeScript and the production Next.js webpack build pass. The new tests cover the pre-fix failure, upgrade from an existing queue, retry deadlines/limits, stale leases, configuration failures, idempotency conflicts and dashboard access/secret isolation. Main-branch CI run `42173219266` passed for the exact merge revision, including real PostgreSQL concurrency/security checks, dependency audit, Next.js/OpenNext builds and Cloudflare bundle validation. Artifact `13481918366` independently matched SHA-256 `7cfd260954deb50ac7c8e27274904fdb86d0a24fe087ffa9542721463fb68a59` before extraction/upload. The merged application tree matched the locally tested tree. All 17 post-deployment HTTP checks passed against the actual live URL.

Live browser verification confirmed authenticated `/operations` still enforces authenticator verification. Full privileged stock workflows and the new admin-only email panel require the selected account to complete MFA. Conditional CI Playwright steps were skipped. The earlier blocked local preview is not counted as a browser pass. The existing Pages gateway, service binding, stored secrets and dormant minute notification schedule were preserved.

Provider inspection confirms Resend `beyondai.ph` remains unverified; DNS verification was started and is pending. Its current DKIM and two sending CNAME records match the previously saved sheet. The RIWAY Cloudflare hosting account exposes only itself and has no DNS zones. The user still needs the domain-owning account and live authenticator setup. Deployment access was renewed using existing account-read/Worker-script permissions without broadening access. Runtime inspection confirms Supabase Auth/Storage remain active and email/payments remain disabled. No DNS records, stock, orders or account roles were changed. Payments and R2 remain deferred.

The sections below preserve earlier release and implementation checkpoints. Their statements that this notification migration or release is pending are superseded by the live verification above.

## Earlier live release — inventory foundation

- Published the verified application from `166c508` to `https://riway-platform.pages.dev`. Worker version `34d85df6-5fa7-4bef-866f-31659f54a6a9` is serving 100% of traffic. Previous version: `4dd01165-3b00-4db7-a9fc-8d35a84a7b2e`.
- PR #2 was merged as `5512728`. Deployment tooling fix `c60b3e1` resolves the configured `custom-worker.js` CI entry. Both main-branch CI runs passed. The merged application tree matches the verified artifact revision; the tooling fix changes only the upload helper.
- Downloaded artifact `13468483324` from passing run `42143507034` and independently matched SHA-256 `5019ed70762a9b4f2dc81bfd194ee50f90d61fdd9e5100480740836d72fad99f` before publishing.
- All five pending migrations are applied. Hosted history now matches all eleven local migration versions. Existing native account identity was preserved; all seven inventory/identity public tables have RLS enabled. Anonymous stock mutations and browser notification-queue claims are denied.
- All 16 HTTP checks passed against the live URL after deployment. The inventory route redirects signed-out visitors to login rather than showing the previous 404.
- Runtime remains Supabase Auth and Supabase Storage; email and payment delivery remain disabled. The minute notification schedule is installed and dormant while email is disabled. Clerk credentials and Resend DNS/credentials remain pending; R2 remains explicitly deferred.
- The selected live administrator's email is verified and its RIWAY super-admin role is assigned. Privileged access remains MFA-gated; the user must enroll and verify the live authenticator before admin actions become available. No other account was promoted as a substitute, and no demo stores/accounts were seeded into production.

The implementation-time notes below describe earlier checkpoints; the live release above supersedes their statements that deployment and migrations were pending.

## Inventory dashboard follow-up

- Added `20261106010616_inventory_dashboard_controls.sql`. Missing-member access changes now fail without writing a misleading audit event. Owner-only low-stock threshold configuration enforces MFA, tenant boundaries and a 0–1,000,000 range.
- Dashboard shows stock totals, low-stock balance counts and configured thresholds. Movement history now identifies SKU, location and actor and pages through records in stable groups of 50.
- Native sign-in now waits for hydration and explicitly uses POST. This prevents submitting a client-only credential form before its handler is available.
- Current verification: 51 unit/database tests, typecheck, production build and 16 HTTP checks pass. Local migration replay includes eleven files; five newer migrations remain pending hosted application.
- Browser verification used an isolated app copy and in-memory database behind a loopback Auth/REST test adapter. Receipts, reservations, oversell rejection, threshold persistence/low-stock display, missing-member errors, 50-row history pagination, viewer read-only controls and RIWAY super-admin multi-store controls were exercised. Desktop and 390-pixel phone layouts were inspected. These checks do not verify real provider login, MFA challenges or hosted writes.
- `.env.local` presence checks still show no Clerk backend key, Resend API key or Supabase service key. Provider delivery remains disabled; R2 remains deferred. No hosted migration or production deployment was performed in this follow-up.

The sections below retain earlier setup details and historical verification counts.

## Account setup performed

- Clerk application `Riway`, development instance `ins_3LgCNWGu6adaE9BdZzukfoB7JuQ`, issuer `https://uncommon-hare-581.clerk.accounts.dev`.
- Authenticator application and backup codes enabled in the Clerk development instance. Production use is marked as a paid feature by Clerk; no upgrade was purchased.
- Public Clerk key and issuer saved in ignored `.env.local`; the backend development key is awaiting email verification in the Clerk dashboard. No secret was copied into source or chat.
- Resend organization `beyondai`: registered `beyondai.ph`, domain ID `550f2dd3-2fe3-4300-847a-ea04b99b503c`, Tokyo region. Domain verification is pending DNS changes.
- Temporary sender/reply-to: `sylvester@beyondai.ph`; test recipients restricted to this address. Actual email delivery is disabled.
- R2 is deferred by the user's explicit choice. No subscription was activated or bucket created. Existing Supabase Storage remains selected.

## Added notification flows

- Store owners receive an onboarding message when their owner membership is created or promoted. The job is queued in the membership transaction.
- Daily low-inventory reports default to 09:00 Asia/Shanghai. Each owner receives only their store's low SKU/location records, capped at 100 displayed rows with the full low-stock count.
- Reports deduplicate by date/store/owner. A delivery-time authorization check suppresses messages for revoked owner memberships and suspended stores.
- `20261105080306_tenant_notifications.sql` extends the durable outbox. It is pending hosted application along with the previous three provider migrations.

## Verification and rollout boundaries

- 48 unit/database tests and typecheck pass. Production Next.js build passes.
- Embedded PostgreSQL replays all ten migration files and the three existing security suites.
- A real PostgreSQL concurrency test and a disposable PostgreSQL 17 CI job were added. Local startup was blocked by Windows restricted-token creation (`pg_ctl` error 87). The Linux CI run `41996457266` passed the real PostgreSQL concurrency job, all migration/security replays, Next.js/OpenNext build and Wrangler bundle validation for release candidate `ad8cd51`. Conditional CI browser steps were skipped because repository variables were absent; local browser checks were verified separately.
- Supabase `riway` is healthy, with the original six hosted migrations. At inspection, profiles/orders/staff/media tables each had zero rows. No hosted migration or account role was changed.
- Supabase staging branch creation was rejected because branching requires Pro. No plan upgrade or charge was authorized.
- Cloudflare's existing CLI OAuth session could not refresh. Browser access works, but no deployment occurred.
- Public DNS confirms `beyondai.ph` is hosted by Cloudflare; the signed-in RIWAY hosting account has no domains and only one accessible account. DNS setup must occur in the domain-owning account.
- Clerk CLI authentication timed out without completing authorization. The dashboard key flow is waiting for user email verification instead.

## Safe configuration helper

`npm run setup:providers` opens a temporary, loopback-only credential form. It saves only allowlisted provider settings to ignored `.env.local`, keeps blank values unchanged, does not display saved credentials, and generates a random local notification worker secret. It has no deployed route. Provider activation flags remain unchanged. Stop it after configuration.

## Remaining actions

1. Complete the open Clerk email verification to create the explicitly approved `RIWAY development server` key, then save it through the local helper.
2. Enable Clerk's Supabase integration and configure the trusted issuer in the designated Supabase environment after staging migration verification.
3. Add the Resend DNS records through the Cloudflare account owning `beyondai.ph`, verify the domain, and configure a domain-restricted sending key.
4. Run Linux/OpenNext and real PostgreSQL concurrency verification for the exact release revision.
5. Apply reviewed migrations after the staging/backup checks, provision an approved RIWAY super admin, and complete authenticated tenant acceptance.
6. Enable email in allowlisted test mode and configure the notification worker scheduler. Production email, auth cutover, and deployment require the remaining provider and UAT checks. Keep commerce and R2 deferred.

## Scheduled worker

`custom-worker.ts` adds a scheduled handler to the generated OpenNext fetch handler, using the existing `WORKER_SELF_REFERENCE` service binding. The configured cron runs once per minute; it returns immediately while `EMAIL_PROVIDER=disabled`. When activated, it drains the durable outbox and enqueues one low-inventory report per owner/store/day after 09:00 Asia/Shanghai. The deploy helper preserves existing secret bindings and applies only this worker's cron schedules. No new Worker or paid R2 subscription is required for this scheduler. It is not deployed yet.

## Release candidate

The existing project's Git metadata denies writes despite scoped permission grants. A separate release checkout at `C:\Users\PC2\Documents\Codex\2026-11-05\ac\work\riway-release` contains the rollout branch `integration/riway-provider-rollout-20261105`. It is based on remote main and excludes the user's two unrelated UI edits. No environment file or credentials were included. The original project remains the working source directory.

Latest release candidate: `d0b331ba9fea446addc9349a29540260093e737e`. Linux CI run `41997340943` completed successfully for this revision, including the PostgreSQL concurrency and verification jobs. This revision includes the dormant cron handler and credential-preserving deployment helper. No merge, hosted migration, or deployment has been performed. The approved Clerk development key is still blocked by the open email-verification dialog; approval to create it does not mean it has been created.
