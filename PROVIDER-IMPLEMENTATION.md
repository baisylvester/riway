# Provider implementation plan — 5 November 2026

1. Keep UUID application identities stable; map Clerk issuer/subject pairs to them in a private database table. Use Supabase third-party JWT verification and RLS for data access. Preserve the Supabase login path during rollout.
2. Add Resend delivery with actual SDK idempotency, validated templates, recipient restrictions in test mode, bounded retries, and redacted failures.
3. Integrate R2 with existing authorized editorial uploads and expiring previews. Record the storage backend per asset so historical Supabase media continues to work.
4. Extend inventory contracts and validate snapshots, stale/conflicting updates, idempotency and retries. Select the concrete store-owner adapter only after its API documentation is provided.
5. Add migrations as reviewable files, verify types/build/tests, and document provider setup, sandbox acceptance, cutover and rollback. Do not apply schema changes to the live database in this implementation pass.

Status and verification results will be recorded below as work completes.

## Implemented

- `/operations`: RIWAY super-admin oversight, tenant creation/suspension, owner/inventory/viewer roles, membership changes/revocation, locations, store SKUs, stock balances, low-stock display and movement history. All management requires MFA. RIWAY super-admin status is a private database assignment, separate from ordinary staff roles and Clerk organization claims.
- Database stock operations: receive, adjust, reserve, release, allocate, fulfill, damage, restore. Row locks and constraints prevent overcommitting stock; tenant/request UUIDs provide replay protection. Journal rows cannot be changed by browser roles. Composite foreign keys reject cross-store location/SKU references. A store must retain an owner.
- Clerk login/signup/recovery, sign-out, security and MFA reverification behind `AUTH_PROVIDER=clerk`. Supabase clients use Clerk session access tokens through the official third-party integration; they do not use a service key. Existing UUIDs are backfilled and foreign keys preserved against `app_users`.
- First Clerk login creates a private issuer/subject mapping and a default profile. No email-based automatic linking. Deletion webhook signature verification disables the mapping and records a tombstone so stale tokens cannot recreate it. Customer data is retained for the separately approved deletion/retention process.
- Resend typed support/event acknowledgements. Database triggers enqueue jobs in the same transaction as the business record. Service-only queue RPCs claim up to five jobs with leases, persist recipients, retry with backoff, and record sent/failed/suppressed states. Requests use Resend SDK idempotency options and a 5s timeout. Retries stop within 23h (before provider deduplication expires) or after six claims. Permanent API failures stop retrying.
- R2 editorial uploads validate bytes, size, key and MIME; check exact market permissions before touching the bucket; prevent overwrite; clean up failed metadata writes; and generate 60s private previews. Storage backend is recorded per asset, preserving old Supabase assets. Direct browser upload URLs are deliberately not exposed; all image uploads pass validation on the server.
- Configured Clerk and R2 origins are included in CSP. Secret values never enter client components. SDK versions are pinned.

## Migrations (files only; not applied to hosted Supabase)

1. `20261105073153_provider_identity_and_media.sql`: canonical UUID users, native identity trigger/backfill, Clerk trusted issuers/mapping/deletion handling, RLS/function identity update, MFA helper, per-asset storage backend and market upload check.
2. `20261105073650_tenant_inventory.sql`: tenant roles, locations/SKUs, stock balances, immutable movement journal, authorized RPCs and RLS.
3. `20261105074609_notification_outbox.sql`: private durable queue, transactional enqueue triggers, service-only worker RPCs and recipient/delivery persistence.

The identity migration changes FK targets and existing function/policy identity calls in a transaction. Take a backup and test on a staging clone before applying. Existing source migration files are unchanged. Clerk deletion disables access; it does not delete order/history records. Supabase user deletion now detaches the identity while retaining the canonical app user. Apply the approved privacy retention/deletion procedure separately.

## Provider setup

Populate the documented values in ignored environment files or the platform's secret manager. Never send secrets through chat.

Clerk: `AUTH_PROVIDER=clerk`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_ISSUER_URL`, `CLERK_WEBHOOK_SIGNING_SECRET`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/auth/login`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/auth/register`. Enable the Clerk Supabase integration and register the exact issuer in Supabase third-party auth. Enable authenticator MFA in Clerk. Configure `user.deleted` events to `/api/webhooks/clerk`. Register each environment's exact trusted issuer (no trailing slash) through a privileged staging SQL connection:

```sql
insert into private.clerk_issuers(issuer) values ('https://YOUR-INSTANCE.clerk.accounts.dev');
```

For an existing native user, import the account through Clerk's supported migration process, verify ownership, and insert a reviewed issuer/subject mapping to that existing `app_users.id` before first Clerk login. Do not merge by email alone. If a user already received a new UUID through Clerk, resolve the records before attempting to link. Preserve native login until mappings, order ownership, addresses, carts, referrals, permissions and MFA have passed acceptance.

Resend: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, verified `RESEND_FROM_EMAIL`, optional `RESEND_REPLY_TO`, `EMAIL_DELIVERY_MODE=test`, `EMAIL_TEST_RECIPIENTS` (comma-separated exact test addresses). Test mode rejects all other recipients. Live mode requires `NODE_ENV=production` and `EMAIL_DELIVERY_MODE=live`.

Notifications: server-only `SUPABASE_SERVICE_ROLE_KEY` and a random `NOTIFICATION_WORKER_SECRET` of at least 32 characters. Configure an external scheduler to POST `/api/internal/notifications` with `Authorization: Bearer <secret>` every minute. No scheduler was created in this implementation. Only this worker and the signed Clerk deletion webhook use the privileged key. Other requests remain RLS-scoped. Monitor pending/failed jobs through a privileged operator connection to `private.notification_jobs`; appoint an owner before rollout. Missing/unverified recipient addresses suppress delivery. Outbox worker resolves Clerk addresses using the backend SDK, and native addresses only when confirmed. Clerk sends authentication emails through its configured provider; these transactional templates do not replace Clerk's authentication messaging.

R2: `STORAGE_PROVIDER=r2`, `R2_ACCOUNT_ID`, bucket-scoped `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Keep the editorial bucket private. Configure R2 values at both build (CSP) and runtime. `R2_PUBLIC_BASE_URL` is reserved and unused; public publishing requires a separate approval flow. Uploads are image-only, up to 3 MiB. No CORS upload grant is needed because uploads pass through the server. Scan/re-encode images before allowing richer content or untrusted public publishing.

Inventory: use the internal tenant portal. Keep `INVENTORY_PROVIDER=disabled`. The generic external adapter remains unavailable; no endpoint, webhook signature scheme, inventory ownership rule or provider account has been invented. Reservations are explicit manual journal movements; order-linked expiring tenant reservations and automatic POS sync remain future work. Existing corporate checkout reservations are separate.

## RIWAY administrator provisioning

Use an approved staging account with MFA. Native accounts retain their auth UUID. Clerk accounts receive their local UUID on first login; `/operations` shows it even before store assignment. A privileged operator assigns a known RIWAY administrator:

```sql
insert into private.platform_admins(user_id) values ('VERIFIED-LOCAL-UUID');
```

No administrator or store is seeded by this change. This role grants all-store access, not the legacy editorial/admin market roles. Use the existing staff-role process for editorial media access. From `/operations`, RIWAY creates each store with an existing owner's local account ID. Owners create locations/SKUs, invite existing account IDs and manage stock. Inventory staff can move stock; viewers can inspect it. Suspended stores deny tenant access while RIWAY keeps oversight.

## Storage migration and rollback

Export a manifest of Supabase assets (ID/key/size/MIME) and copy bytes to the private R2 bucket with the same keys. Verify counts and byte hashes, then update only verified asset rows to `storage_provider='r2'` through a reviewed operator script. Preserve the old bytes during the rollback window. Revert those rows to `supabase` to roll back previews; `STORAGE_PROVIDER=supabase` affects only new uploads. R2-created assets must be copied back before changing their metadata. No objects have been copied or deleted by this implementation.

## Sandbox acceptance and production cutover

1. Back up the database; replay migrations on a staging clone; run database advisors and restore tests.
2. Configure provider sandbox keys, trusted issuer, Clerk/Supabase integration, verified email sender and private R2 bucket. Keep email allowlisted.
3. Provision one RIWAY super admin and two independent stores. Test owner/inventory/viewer accounts, role revocation, last-owner protection, suspension and cross-store object references.
4. Test stock receipt, adjustments, reserve/release, allocate/fulfill, damaged stock, duplicate idempotency keys and conflicting requests across real concurrent database connections. Verify journal/balance consistency and alert ownership.
5. Migrate one existing native user to Clerk. Confirm the same UUID, order/address/cart/referral ownership, MFA, sign-out, password recovery and deleted-user webhook behavior. Verify Clerk CSP in real desktop/mobile browsers.
6. Confirm support and event inserts atomically enqueue jobs. Run the worker with test recipients. Simulate timeout, 429, permanent failure, crash after send, lease expiry, duplicate worker calls and stale jobs. Check sender DNS and provider suppression. Confirm no unapproved recipients receive messages.
7. Upload/preview invalid, oversized, valid and cross-market images; verify metadata failures clean up storage; inspect private signed URL expiration and denied bucket access. Test storage manifest rollback.
8. Build the exact revision in Linux/OpenNext CI, validate the Worker bundle including SDK runtime compatibility, run authenticated UI/UAT, record artifact digest and prior Worker version, then obtain launch acceptance.
9. Configure production build/runtime secrets consistently, apply approved migrations, enable providers independently, schedule the queue worker and monitor failed jobs/role changes/stock journals. Commerce remains gated by its own unfinished integrations.

Rollback: disable the email worker/provider to pause jobs; restore `AUTH_PROVIDER=supabase` only for accounts with native identities (Clerk-only accounts need the agreed recovery/migration path). Return new uploads to Supabase and restore per-asset metadata only after byte verification. Roll back the application artifact while retaining additive tables/journals. Do not drop identity or inventory tables as an application rollback. Keep the previous environment configuration and database backup available.

## Verification on 5 November 2026

- Typecheck and Next.js production build pass.
- 41 automated tests pass across 7 files. Embedded PostgreSQL replays all migrations and all three historical SQL security suites. New tests cover tenant isolation, stock constraints, replay/conflicts, read-only roles, MFA, super-admin suspension, owner retention, revocation, Clerk first-login/deletion, queue leases, recipient persistence, forged job completion tokens, and oversized webhook streams.
- 15 local HTTP integration checks pass against a fresh production server.
- Four new Playwright desktop Chrome/mobile-emulation checks passed with confirmed process exit 0. On Windows, use `PLAYWRIGHT_EXTERNAL_SERVER=1` and `PLAYWRIGHT_PORT` with a separately running fresh production server to avoid the npm web-server teardown hang. Authenticated Clerk/tenant workflows were not exercised with provider accounts.
- Dependency audit reports zero vulnerabilities. No production schema change, provider send, object upload, user migration, role assignment or deployment was performed.

Remaining launch dependencies: staging provider credentials/configuration; real multi-connection load/concurrency tests; authenticated UI acceptance; Linux OpenNext runtime verification; Clerk account migration/retention operations; independent security/accessibility/performance acceptance; alerting and backup/restore ownership. The new inventory is an internal tenant-management foundation and does not connect the disabled corporate commerce checkout to store stock.

## References

- Clerk/Supabase third-party auth: https://supabase.com/docs/guides/auth/third-party/clerk
- Clerk MFA claims: https://clerk.com/docs/guides/sessions/session-tokens
- Clerk CSP: https://clerk.com/docs/guides/secure/best-practices/csp-headers
- Resend idempotency: https://resend.com/docs/dashboard/emails/idempotency-keys
- R2 AWS SDK: https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
