# RIWAY integration working checklist

## Baseline / routes and protected behavior
- /shop: catalogue() published products + offers; q text, category, result count/empty state; currentMarket cookie PH/SG/MY.
- /shop/[slug]: notFound unknown; live name/subtitle/description/offers; review add uses existing StoreProvider. Confirmed slugs purtier-placenta, conscientious.
- /cart: riway-cart schema-validated localStorage, 1–24 quantities, removal, authenticated /api/cart save/restore; /checkout review validation; server checkout and payments fail closed.
- /auth/{register,login,reset,update-password,callback}; /account + addresses/orders/security use existing validated sessions/forms/MFA.
- /distributor and /d/[code]: verified active requirements, QR introductions, immutable referral rules unchanged.
- /stories/[slug], /events/[slug]: published and market-filtered data, event registration unchanged. /support: authenticated validated action. /legal/[slug]: existing content.
- /admin: staff market scopes + MFA; products/pricing/inventory/CMS/private media/orders/export/support/audit/integrations and pagination unchanged.
- Preserve loading, error, pending, success, unavailable, empty, not-found and unauthorized states. No database, policy, migration or action changes.

## Design mapping / decisions
- index.html → /; purtier.html → /shop/purtier-placenta; conscientious.html → /shop/conscientious. Other products retain generic dynamic route.
- Tokens porcelain #efece6/#e9e5dd, ink #141416, burgundy #9e1225, gold #b8923f, cinema #070708, ivory #ece7dd.
- Local font files, scoped brand CSS; shared functional styling. Supplied photos + procedural model factories adapted to ESM; React owns lazy loading, animation and disposal.
- Native scroll, keyboard buttons/chips, native snap track; no scroll locks or preloaders. Reduced motion uses static images. Product review controls precede cinema.
- Reference claims/dosages/laureate records/contact info not approved: preserve app copy/notices; visual archive imagery is not a scheduled event or approved product claim.

## Verification
Implemented and verified 2026-11-03. Typecheck, 20 unit tests, Next production build and 11 HTTP checks pass. Full Playwright: 21 passed, 1 intentional desktop skip for the mobile-only menu. Three-width reference/application screenshots and product WebGL renders reviewed. Cloudflare build attempted: blocked by documented Windows OpenNext/esbuild ancestor-directory/config resolution failure. Authenticated account/distributor/staff writes and SQL fixtures not run without authorized test accounts. No deployment or production writes.

Principal additions: src/app/brand.css; components/brand (editorial, motion, interactions, ProductStage, lazy rendering runtime and five adapted factories); public/design and local fonts. Shared chrome and form accessibility updated. StoreProvider, cart/domain/actions/data/proxy/services and security/deployment configuration unchanged. Detailed implementation report saved with the chat outputs.
