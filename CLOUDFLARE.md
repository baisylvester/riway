# Cloudflare Workers deployment

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

The intended workers.dev URL comes from the account's existing Workers subdomain. Confirm successful deployment and verify the homepage, catalogue, auth redirects, health route and disabled checkout before handing over the live URL. This file describes deployment preparation, not evidence of a completed deployment.
