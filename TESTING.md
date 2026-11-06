# Testing

## Verified on 6 November 2026 — notification continuation candidate

All 86 tests across 13 files, TypeScript and the production Next.js webpack build pass. Tests include a demonstrated pre-fix failure for an unattempted three-day-old job, migration of an existing queue, conservative deadlines for attempted jobs, zero-attempt recovery, six-attempt exhaustion, stale-lease recovery, exclusive claims, forged completion rejection and browser-role denial. Endpoint tests verify invalid/unauthorized configuration cannot initialize or claim the queue. Render tests verify MFA and RIWAY super-admin restrictions and that no configured secrets or recipient lists reach the HTML. Resend fakes distinguish retriable in-progress idempotency conflicts from permanent changed-payload conflicts. No real email was sent.

For a linked dependency directory whose Vite cache is not writable, run `node node_modules/vitest/vitest.mjs run --configLoader native`. The normal `npm test` command remains valid for clean CI installations. The webpack production build was used locally; Cloudflare/OpenNext requires Linux verification.

Local browser acceptance remains unverified. Automatic approval review rejected launching the isolated production preview server because its approval category is disabled. The earlier development preview could not hydrate under the production CSP; that attempt is not counted as passing. The static render tests are not substitutes for browser or hosted MFA acceptance. No hosted migration, production stock write, provider activation or live deployment was performed for this candidate. See `ROLLOUT-STATUS.md`.

## Verified on 5 November 2026 — provider/tenant implementation

Typecheck and production build pass. All 41 automated tests pass across 7 files, including embedded PostgreSQL replay of every migration and the existing RLS/checkout/operations SQL scripts. New database tests cover tenant isolation, role escalation, stock limits, idempotency conflicts/replay, MFA, suspension/revocation, final-owner protection, Clerk UUID mapping/deletion, and durable queue leases/forged completion. Provider tests use fakes and send no external messages or objects. Fifteen local HTTP checks and four newly added desktop Chrome/mobile-emulation browser checks pass with confirmed process exit 0. Use `PLAYWRIGHT_EXTERNAL_SERVER=1` with `PLAYWRIGHT_PORT` when testing against a separately started production server to avoid Windows npm server teardown hangs.

Embedded PostgreSQL supplies minimal Supabase SQL interfaces; it does not verify hosted JWTs, actual Clerk login, real R2 transport, Resend delivery, multi-connection concurrency or Linux OpenNext SDK compatibility. Those require staging credentials and UAT. No hosted migrations, test identities or roles were created.

## UI integration verified on 2026-11-03

Typecheck, 20 unit tests, Next.js production build and all 11 HTTP checks pass. Full Playwright Chromium/mobile suite: 21 passed, one intentional desktop skip for the mobile-only menu. New coverage includes market failure feedback, category/empty states, quantity limits/removal, unknown-product UI, keyboard goals, reduced motion, WebGL failure/context loss, client-route cleanup and mobile-menu focus behavior. See DESIGN-INTEGRATION.md for the parity inventory.

Reference and application screenshots were reviewed at desktop (1440×1000), tablet (834×1112) and mobile (390×844). No recorded page JavaScript errors; both packaging sequences rendered in WebGL at all three widths.

OpenNext Cloudflare build was attempted but is blocked by the documented Windows esbuild/config-resolution limitation. Authenticated account/staff/distributor acceptance tests and SQL security fixtures were not run during the UI integration; no authorized test accounts were supplied. Earlier verification below is historical and does not imply those checks were rerun.


## Verified on 2026-11-02

- `npm run typecheck`: passed.
- `npm run build`: passed (Next.js 16.4.3 production compilation and route generation).
- `npm test`: 18 tests across four files passed: market gates, cart validation, checkout inputs, disabled providers, image-signature validation and valid/impossible event dates.
- `node scripts/verify-env.mjs`: expected project/key type, disabled integrations and site URL checks passed; values are not logged.
- `npm audit`: zero vulnerabilities after overriding the CLI's transitive tar dependency to a patched release.
- Supabase security advisor: no findings after schema hardening.
- `tests/security/rls.sql`: passed against the designated project in a rollback-only transaction. Checks anonymous denial, customer isolation, escalation denial, staff MFA, market scope, editorial publication control and unapproved checkout denial.
- `tests/security/checkout.sql`: passed in a rollback-only transaction. Checks server prices, atomic reservations, idempotent replay/conflict, duplicate lines, quantity limits, invalid-address rollback and expiry release. Temporary approval flags were rolled back.
- `tests/security/operations.sql`: passed in a rollback-only transaction. Checks verified distributor lookup, immutable sponsor links, support rate limiting, private media, stock adjustments, negative-stock rejection and support resolution.
- Browser: desktop homepage visual review, catalogue search, product navigation, add to bag, quantity persistence after reload and checkout-review notice verified. Mobile homepage checked at 390×844 without horizontal overflow.

- HTTP integration suite: 11 checks passed, including health, authenticated API access, staff endpoint denial, origin validation, market cookie, disabled webhook and private-page redirects.
- Final browser pass: country selection persisted to Singapore; eight public mobile pages fitted the viewport and the mobile menu opened correctly.

## Browser suite

`tests/e2e/storefront.spec.ts` contains desktop/mobile Playwright scenarios for catalogue/bag/reload, protected page redirects, origin rejection and viewport fit. CI is configured to run these when database environment variables are provided. The CLI Playwright suite has not yet been run locally; browser verification used the connected in-app browser. Do not report authored tests as passed execution.

```powershell
npm run build
npx playwright install chromium
npm run test:e2e
```

## SQL scripts

Run through an authorized privileged SQL connection against an approved test environment. Each script begins a transaction and rolls back its fixtures, including auth rows. On an assertion error, roll back the connection before retrying. No test users or orders were retained. Review fixtures and test assumptions before reusing against a database with operational data.

## Remaining verification

Real email confirmation/recovery delivery, authenticator enrollment from an actual staff account, Storage upload over the deployed Vercel path, full browser matrix, screen-reader/contrast audit, 4G performance, load/concurrency tests and backup restoration have not been independently verified. Payment/provider tests are deferred by instruction. SSO, membership activation, compensation submission, shipping and messaging cannot be verified without the client contracts.

Do not claim 99.9% availability, Core Web Vitals compliance, legal compliance or production readiness based solely on a passing build or these tests.

## Cloudflare verification

The Linux CI run 41417600082 passed typecheck, 18 unit tests, audit, Next.js build, OpenNext build and Wrangler bundle validation. Its checksum-verified artifact was deployed to Cloudflare. All 11 HTTP integration checks passed against https://riway-platform.ai-edu-web.workers.dev. The live homepage, catalogue and images rendered correctly. Browser auth email delivery and production SMTP remain outside the verified checks.
