# Architecture

## Decisions

The supplied proposal suggests AWS, Medusa and Payload as a discovery baseline. The subsequently supplied development brief explicitly requires Next.js, Supabase and Vercel. This application follows the latter stack while retaining the proposal's functional scope and approval restrictions.

Next.js App Router provides server-rendered corporate/store pages, protected member/staff pages, Server Actions for forms and Route Handlers for JSON/upload endpoints. React client components manage the local bag, authentication and MFA. Tailwind's PostCSS integration and a shared CSS design system provide the responsive interface.

Request flow: browser → Next.js → request-scoped Supabase client with the user's cookie session → RLS-protected PostgreSQL/Storage. No service-role key is needed or installed. Account, admin and API routes refresh sessions through `src/proxy.ts`; authorization calls validated `getUser()`, not user-editable metadata.

## Boundaries

- `src/lib/domain.ts`: shared validation, money, market and cart rules.
- `src/lib/supabase`: separate browser and server clients.
- `src/lib/data.ts`: catalogue/content/session queries and staff-access checks.
- `src/app/actions.ts`, `src/app/admin/actions.ts`: validated application operations.
- `src/services/integrations.ts`: provider-neutral interfaces and explicit unavailable adapters.
- `supabase/migrations`: schema, permissions, constrained privileged functions and transactional order logic.
- `tests`: pure rules, browser specifications and rollback-only database integration/security scripts.

## Commerce boundary

The web checkout endpoint does not create orders while payments are deferred. The database's `create_order` RPC is built and transaction-tested, but requires approved market policy, payment readiness, registered products, official prices, stock and a verified sponsor. Only a later, reviewed payment orchestration service should call it as part of a hosted-payment flow. RIWAY continues to own authoritative member, sponsor, placement and commission records.

## Environments and delivery

The existing designated project is used; no other Supabase project was created. Production data must not be mixed into local tests. SQL tests run in transactions and roll back all fixtures. A separate staging environment requires user authorization. Vercel configuration and GitHub CI are prepared; no external repository or deployment was created without a destination.

## Known design limits

Content is plain text to avoid unsafe HTML. Only English content is implemented; database locale fields prepare for later translation work. Scheduling, promotions, tax/shipping calculations and durable integration workers require additional implementation once business rules and provider contracts are agreed. This is a modular development application, not a claim that the full commercial programme is complete.
