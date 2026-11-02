# Implementation status

Updated 2026-11-02. Live Cloudflare deployment is verified at https://riway-platform.ai-edu-web.workers.dev; 11 live HTTP checks passed. User confirmed platform development, then explicitly deferred payments and client APIs. Work is in the mandatory project directory. Existing Supabase project is connected; no extra project was created.

| Area                                                                | Status                                                       | Practical limit                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Architecture, Next.js/React/TypeScript/Tailwind                     | Implemented; production build passes                         | Not equivalent to commercial launch approval                                                  |
| Corporate website / responsive visual design                        | Implemented; desktop/mobile inspected                        | Brand guidelines and final content require RIWAY approval                                     |
| Catalogue / product details / search / filters                      | Implemented against Supabase                                 | Only confirmed product identities seeded; labels and claims need approved content             |
| PH/SG/MY market/currency model                                      | Implemented                                                  | All sales gates closed; only English UI/content is implemented                                |
| Local and account-saved bag / restore                               | Implemented; browser persistence verified                    | No live order placed                                                                          |
| Checkout form and guarded transactional order database              | Implemented; SQL transaction tests pass                      | Web ordering deliberately unavailable; no taxes/shipping/gateway orchestration                |
| Authentication / recovery / profile / addresses                     | Implemented                                                  | Hosted email/redirect setup and real-account acceptance testing remain                        |
| Member status / order history                                       | Implemented for synced records                               | No invented members; authoritative client synchronization pending                             |
| Distributor verification gate / introductions / QR / first referral | Implemented; SQL rules tested                                | Client sponsor reconciliation, placement and dashboard disclosure contract pending            |
| Staff roles, market access, MFA                                     | Implemented; RLS tests pass                                  | First real administrator must be provisioned by an authorized operator                        |
| Products / pricing / inventory adjustments                          | Implemented                                                  | Approved prices and actual stock not supplied                                                 |
| CMS draft/review/publication / stories / events                     | Implemented; compliance rules tested                         | Entries await approved content; scheduled publishing and translation editor not implemented   |
| Private editorial media library                                     | Implemented                                                  | Public approved-media publishing pipeline and deployed upload test remain                     |
| Support requests / resolution / event registration                  | Implemented                                                  | Notifications and client service processes pending                                            |
| Order list and market-scoped CSV export                             | Implemented                                                  | Fulfilment, cancellation, refunds, invoices and tax workflows await policy/provider contracts |
| RLS / audit / rate limits / validation                              | Implemented; three SQL suites pass                           | WAF, external penetration testing and operational security review remain                      |
| Unit tests / browser specs / CI                                     | 18 unit tests pass; SQL suites pass; browser flows inspected | Full Playwright CLI, auth and cross-browser suites remain unexecuted                          |
| Cloudflare / GitHub deployment                                      | Deployed and verified; remote main published                 | Manual deployment from verified Linux CI artifact; see CLOUDFLARE.md                          |
| Payments / refunds                                                  | Deferred by user                                             | No gateway chosen; all handlers fail closed                                                   |
| RIWAY membership/compensation, SSO                                  | Awaiting client API                                          | Interfaces prepared; no endpoints or commission rules invented                                |
| Courier / email / SMS / CRM                                         | Awaiting provider contract                                   | Not connected                                                                                 |
| Promotions / subscriptions / automated reorders                     | Deferred pending business rules                              | Not implemented as official RIWAY policies                                                    |
| SEO migration / translations / consented analytics                  | Pending final content/domain plan                            | Development is noindex; no tracking enabled                                                   |
| Backups / restore / load / accessibility / monitoring               | Runbooks and health endpoint prepared                        | Operational setup and acceptance tests remain                                                 |

## Database changes

Six additive migrations installed the application schema, RLS, functions and private Storage library. Two product identities and three blocked markets were seeded. All test fixtures and temporary approval flags were rolled back. Current market flags remain disabled and there are no operational users, orders or assigned staff roles.

## Known limitations and launch dependencies

The application is ready for the next client integration phase, not a completed production commercial system. Items marked pending above require implementation and/or acceptance work; they are not hidden behind claims of readiness. Obtain approved product labels, prices, registration/policy references, package qualification rules, shipping/tax/return terms, API documentation, legal wording, asset rights, deployment destinations and named operating owners. Confirm the existing Ireland database location before using real personal data.

## Next session

1. Read README, ARCHITECTURE, INTEGRATIONS and this status file.
2. Inspect Git/source and remote migration history before modifying anything.
3. Keep payments and sales disabled unless the user explicitly changes the scope and all approval gates are met.
4. Integrate only documented client APIs; implement pending workflows, then run sandbox/UAT/security/performance checks.
5. Update status with implemented, tested, sandbox-verified and production-integrated states separately.

Local Git metadata was initialized, but lockfile writes remained blocked by the execution environment. Remote main was published through the GitHub connector; sync the local Git metadata from the user's normal shell when needed. The source archive excludes all Git metadata and credentials.
