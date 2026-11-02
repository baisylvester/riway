# Deployment and handover

## Current state

Local source and a successful optimized Next.js build are available. The designated Supabase schema and private Storage bucket are configured. GitHub Actions and `vercel.json` are prepared. **No GitHub remote, Vercel project, public deployment or domain change has been made.** Deployment destinations were not supplied. Payments remain disabled by user instruction.

## Environment

Use `.env.example` as the template. Local `.env.local` contains the project URL and public publishable key only and is excluded from source archives/Git. No service-role key or database password is present.

Required values:

- NEXT_PUBLIC_SUPABASE_URL: designated existing project URL.
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: active publishable key from Supabase.
- NEXT_PUBLIC_SITE_URL: exact local/preview/production URL for distributor links.
- PAYMENT_PROVIDER=disabled.
- RIWAY_INTEGRATION=disabled.

Use Node.js 22. Vercel selects Next.js automatically; build is `npm run build`, install is `npm ci`. Keep deployment protection enabled while this remains a development application. Do not point production RIWAY DNS at an unapproved deployment. Domain, deployment geography and Supabase's Ireland region require RIWAY review.

## Supabase Auth setup

Set the intended Site URL and explicitly allow `/auth/callback` on the local and approved preview/production hosts. Current local URL: `http://127.0.0.1:4173`. Configure custom SMTP and approved email templates before operational use. Confirm password and auth abuse policies. These hosted Auth settings have not been modified by this implementation.

## First staff account

No default password or administrator was created. The authorized staff member should register and confirm their own account. An authorized database operator can then assign only the approved market and role, substituting the actual user UUID:

```sql
insert into public.staff_roles(user_id,market,role)
values ('<confirmed-auth-user-uuid>','PH','admin');
```

Use `operations` for stock/support/order operations, `editor` for drafts and `compliance` for content/product publication. Grant multiple market rows only where approved. Sign in, open `/account/security`, enroll/verify the authenticator, then open `/admin`. AAL1 sessions cannot access staff data. Role revocation is checked from the database on subsequent operations; no user-editable role claims are used.

## GitHub/Vercel

1. Select the client-owned repository and Vercel team/project.
2. Push the inspected source and lockfile; never push `.env.local`, caches, `.next` or node_modules.
3. Add GitHub repository variables for the publishable URL/key to run browser CI against the designated approved test database. CI skips browser tests if these are absent; other checks still run.
4. Add environment variables separately for Preview and Production. A separate database environment needs explicit authorization; do not create one silently.
5. Deploy a protected preview and test auth redirects, RLS, staff MFA, uploads and browser flows there.
6. Review public content/asset rights, legal wording, data retention and operational ownership before publication.

## Release and rollback

Before release, run typecheck, unit tests, build, audit, SQL tests and Playwright. SQL tests must only run in an approved test environment; although fixtures roll back, they require privileged access. Confirm migration history matches tracked files. Apply reviewed additive migrations once.

For application rollback, redeploy the previous known-good Vercel build. Do not automatically reverse database migrations or restore live data over newer orders. Document the compatibility window and use a reviewed forward fix. Backup/restore testing is required before any production transactions.

## Monitoring and maintenance

Monitor `/api/health`, server errors, auth failures, storage capacity and later integration/payment queues. Appoint alert owners and incident contacts. Configure database and object-storage backups and test a restore; target retention is 30 days per proposal, subject to confirmed provider plan and RIWAY policy. Reservation expiry must be scheduled before checkout is enabled. No recurring monitor or cron was created without an agreed deployment target.

## Local Git limitation

Git repository initialization succeeded, but this sandbox could not create Git lockfiles even after filesystem access was granted. No initial commit or remote push was saved. The source archive is complete. From the project directory in your normal Windows shell, run git add . and git commit, then select the main branch and approved remote. This requires no application changes.

