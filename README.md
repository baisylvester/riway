# RIWAY International platform

Live Cloudflare development deployment: https://riway-platform.ai-edu-web.workers.dev. See CLOUDFLARE.md for verified release details. Payments remain disabled.

Project BAI-RWY-2026-001. Built in the required directory:
`C:\Users\PC2\AndroidStudioProjects\PROJECTS\riway\riway_web_app`

**Status: working development application; payments deliberately deferred by the user. Not approved for public commercial launch.** The existing Supabase project is connected. Client APIs, final content, regulatory evidence and deployment destinations remain external dependencies.

## Run on Windows

Node.js 22 LTS is recommended. All package versions are pinned and the lockfile is included in the source tree.

```powershell
Set-Location C:\Users\PC2\AndroidStudioProjects\PROJECTS\riway\riway_web_app
$env:npm_config_cache = Join-Path (Get-Location) '.cache\npm'
npm ci
# A configured, ignored .env.local already exists on this machine.
# For another machine, copy .env.example to .env.local and fill the publishable key.
npm run build
npm run start -- --port 4173
```

Open http://127.0.0.1:4173. Use `npm run dev -- --port 4173` for development. Port 3000 was unavailable on the development machine.

## Included

- Responsive corporate website and two real product collections sourced from RIWAY's existing site.
- Supabase-backed catalogue, search, collection filters and product information.
- Browser-persisted bag, authenticated save/restore and checkout review; no payment collection.
- Email/password accounts, confirmation callback, recovery, profile, addresses and order history.
- Authenticator MFA and staff workspace with database authorization by role and market.
- Product editing, retail/member pricing, stock adjustments with history, content drafts/review/compliance publication.
- Private editorial image uploads, expiring staff previews, support requests/resolution, event registration and scoped CSV order export.
- Verified distributor introduction pages, immutable first referral and QR links. Distributor identities must come from RIWAY; no fabricated members are seeded.
- Versioned SQL migrations, RLS, audit metadata, rate limits, atomic order/stock routines, idempotency and reservation expiry.
- Unit tests, transactional SQL security/integration tests, Playwright specs and CI configuration.

## Deliberately unavailable

Payments, refunds, automatic membership activation, compensation synchronization, courier booking, messaging, subscriptions and SSO are not connected. The browser checkout endpoint returns an explicit unavailable response; setting an environment variable does not activate commerce. All market approval/payment flags remain false.

Legal and product information includes clearly marked review notices. No prices, membership tiers, stock, testimonials, event schedules, earnings or medical claims were invented.

## Operations

See `DEPLOYMENT.md` for staff provisioning and Vercel setup, `TESTING.md` for verified results, `INTEGRATIONS.md` for the API handoff contract and `IMPLEMENTATION_STATUS.md` for scope and outstanding work. Supabase is hosted in **eu-west-1 (Ireland)**; RIWAY must approve data location before production personal data is collected.
