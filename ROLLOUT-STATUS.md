# RIWAY provider rollout — 10 November 2026

## Latest live release - regional calendar and commerce preparation

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
