# Cloudflare Workers deployment

## Verified deployment — 2026-11-02

Live URL: https://riway-platform.ai-edu-web.workers.dev

Cloudflare deployment ID: `d488088349a74f3ba45fbb372955aa91`.
Application build source: `56a2b2551c0333d6d91dedbc9c1913555680e4bd` on `main`.
Linux CI run: https://github.com/baisylvester/riway/actions/runs/41417600082
Verified artifact SHA-256: `8f0f305f14a6f17c603d88f8707b07f495ca821a319afcce78c38bc09abbb477`.

The Linux Next.js/OpenNext build, unit tests, typecheck and dependency audit passed. All 11 live HTTP integration checks passed, including Supabase health, origin checks, protected-route redirects and disabled payment webhooks. Homepage, catalogue and images were also checked in the live browser.

Deployment used the checksum-verified Linux artifact and Cloudflare's official assets/script upload APIs, authenticated through Wrangler OAuth. `scripts/deploy-cloudflare-artifact.mjs` records the repeatable upload path for Windows. No OAuth token is stored in source or GitHub.

**GitHub builds are automatic; Worker deployment is currently manual.** The Cloudflare GitHub Builds connection was not established. A GitHub push alone does not update the live Worker. Obtain the matching CI artifact, verify its published SHA-256 digest, extract it, set `CLOUDFLARE_ACCOUNT_ID`, then run the deployment helper with the extracted directory. Use Wrangler's normal deploy command from Linux if preferred.

Supabase email confirmation/recovery redirect allowlists and production SMTP still need operational configuration for the deployed URL. Payments and external RIWAY APIs remain deferred.

Cloudflare is the requested deployment target as of 2026-11-02. Supabase remains the database; payments and RIWAY integration stay disabled.

## Configuration

- Worker: `riway-platform`
- Runtime: Next.js 16.4.3 through `@opennextjs/cloudflare` 1.20.15.
- Build command: `npm run build:cloudflare`.
- Deploy command: `npx opennextjs-cloudflare deploy` (after build).
- Build platform: Linux. Native Windows OpenNext/esbuild config resolution failed in the desktop sandbox; WSL is not installed. GitHub CI and Cloudflare Workers Builds provide the Linux environment.
- Assets are served directly with Next Image optimization disabled only during the Cloudflare build; no paid Images binding or R2 cache is requested. All customer pages remain request-rendered with private account responses.
- `wrangler.jsonc` holds runtime environment configuration. The Supabase publishable key is intentionally public and will also be visible in browser code. No service-role key, Cloudflare token or database password is committed.

## Workers Builds

Connect the client-owned `baisylvester/riway` repository and choose `main`. Set the Worker name to `riway-platform`, build command to `npm run build:cloudflare`, and deploy command to `npx opennextjs-cloudflare deploy`. Use Node.js 22 and repository root `/`. The build wrapper supplies public environment values from Wrangler configuration, and runtime values use the same variables.

Approve GitHub repository access only if requested by Cloudflare's official installation flow. No production RIWAY domain or existing Worker should be replaced.

The workers.dev URL uses the account's existing Workers subdomain. Current deployment verification is recorded above; repeat the same checks for subsequent releases.
