# RIWAY provider rollout — 5 November 2026

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

- 45 unit/database tests and typecheck pass. Production Next.js build passes.
- Embedded PostgreSQL replays all ten migration files and the three existing security suites.
- A real PostgreSQL concurrency test and a disposable PostgreSQL 17 CI job were added. Local startup was blocked by Windows restricted-token creation (`pg_ctl` error 87); this is not a passed concurrency run.
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
