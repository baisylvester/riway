# Changelog

## Stripe Payments foundation - released disabled 2026-11-06

- Integrate hosted Checkout, exact raw-body SDK webhook verification, canonical session/amount matching, idempotent payment-stock transitions, customer resumption, a separate reconciliation worker and scoped payment operations status.
- Fix all-line expiry for non-Stripe orders and preserve stock under uncertain/pending Stripe sessions. Add six-suite SQL replay and concurrent duplicate-payment verification.
- Deploy PR #7's verified Linux artifact; 126 tests, TypeScript, 35 live API cases, 45 route scenarios and 103 assets pass. Credentials and Tax remain deferred. The final private-wrapper database hardening is CI-tested but awaiting restored Supabase access; see `ROLLOUT-STATUS.md`.

## Authenticator and live feature audit — released 2026-11-06

- Render authenticator QR modules locally from the enrollment URI and offer a manual setup key after the user still observed a broken image following the first data-URL correction. The user confirmed both now appear on the live site.
- Validate order/admin pagination as positive integer input. Expand HTTP and rollback-only hosted customer/inventory coverage.
- Merge PRs #4–#6 and deploy the verified Linux artifact for `2fb761a` (merged as `0885d05`). Cloudflare version `85b6f7b0-3b40-49e5-92d6-50c27aae8287` serves 100% of traffic.
- Verify 97 automated tests, TypeScript, five hosted SQL suites, 30 live HTTP/API cases, 45 route scenarios and 103 static assets. Browser interactions were excluded at the user's request; authenticator code verification and real provider delivery remain pending.

## Notification activation fixes — released 2026-11-06

- Preserve unattempted notifications during delayed email-provider activation; start the bounded retry window at first claim and recover only never-attempted expired jobs.
- Reject incomplete notification configuration before consuming queue retries, and retry Resend's in-progress idempotency conflicts without changing the key.
- Show email configuration and setup gaps to MFA-verified RIWAY super admins without exposing credentials or recipient lists.
- Add database-upgrade, notification-worker, configuration and admin-visibility regression coverage. All 86 local tests and main CI passed.
- Merge PR #3, apply and verify the twelfth hosted migration, and deploy the checksum-verified Linux artifact for `8a54bef`. All 17 live HTTP checks pass. Email activation and privileged inventory acceptance still await provider/MFA setup.

## 0.1.0 — 2026-11-02

- Reviewed proposal, development brief and existing official website; retained market/online-policy restrictions.
- Verified designated empty Supabase project and built the Next.js application in the exact required Windows directory.
- Implemented corporate/store/account/staff/community workflows, private editorial media, distributor introductions and QR links.
- Applied six versioned migrations with ownership RLS, market/MFA staff checks, audit metadata, rate limits, atomic reservations and idempotency.
- Corrected a rate-limit SQL ambiguity found by transaction tests and hardened membership price consistency.
- Passed typecheck, production build, 18 unit tests and three rollback-only SQL suites; inspected desktop/mobile storefront behavior.
- Prepared GitHub CI, Vercel settings, environment templates, architecture/security/API/database/deployment/testing and integration handover documents.
- Deferred payments and client APIs per user instruction. No external payment, commission, courier or messaging integration is represented as complete.

## Cloudflare deployment — 2026-11-02

Added OpenNext/Workers configuration, Linux CI artifact builds and a credential-safe deployment helper. Corrected CI variable precedence so public Supabase settings match runtime configuration. Deployed to https://riway-platform.ai-edu-web.workers.dev and passed all 11 live HTTP checks. Payments remain disabled.
