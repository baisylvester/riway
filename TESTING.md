# Testing

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
