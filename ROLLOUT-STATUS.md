# RIWAY provider rollout — 6 November 2026

## Current live release

- Published the verified application from `166c508` to `https://riway-platform.pages.dev`. Worker version `34d85df6-5fa7-4bef-866f-31659f54a6a9` is serving 100% of traffic. Previous version: `4dd01165-3b00-4db7-a9fc-8d35a84a7b2e`.
- PR #2 was merged as `5512728`. Deployment tooling fix `c60b3e1` resolves the configured `custom-worker.js` CI entry. Both main-branch CI runs passed. The merged application tree matches the verified artifact revision; the tooling fix changes only the upload helper.
- Downloaded artifact `13468483324` from passing run `42143507034` and independently matched SHA-256 `5019ed70762a9b4f2dc81bfd194ee50f90d61fdd9e5100480740836d72fad99f` before publishing.
- All five pending migrations are applied. Hosted history now matches all eleven local migration versions. Existing native account identity was preserved; all seven inventory/identity public tables have RLS enabled. Anonymous stock mutations and browser notification-queue claims are denied.
- All 16 HTTP checks passed against the live URL after deployment. The inventory route redirects signed-out visitors to login rather than showing the previous 404.
- Runtime remains Supabase Auth and Supabase Storage; email and payment delivery remain disabled. The minute notification schedule is installed and dormant while email is disabled. Clerk credentials and Resend DNS/credentials remain pending; R2 remains explicitly deferred.
- The user selected `sylvester@beyondai.ph` for live super-admin access. Provisioning must verify this exact live account, confirmed email and a verified authenticator. No existing account is promoted as a substitute, and no demo stores/accounts are seeded into production.

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
