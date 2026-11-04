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
- Actual reference folder inspected: riway_ui_design/riway, including all three HTML pages, shared/site CSS, motion scripts and procedural models.
- index.html → /; purtier.html → /purtier; conscientious.html → /conscientious. Existing /shop/[slug] routes retain live product review, market selection and bag actions.
- Reference HTML translated to React JSX; original CSS scoped under .reference-design and per-brand attributes. Existing functional chrome is shown outside the three reference routes.
- Exact reference Lenis 1.1.18 (lerp 0.085, wheelMultiplier 0.95), GSAP 3.12.5 and SplitType 0.3.4. Source cursor quickTo duration 0.18, magnetic strength 0.35, preloader 1500/1600ms, wipe power4.inOut, scrub text, clip reveals, counters, stagger and horizontal tracks retained.
- Complete landing manifesto, houses, both four-beat unboxings, Six Goals, track, sixteen laureates, events marquee and footer.
- Complete product sections and source product copy/ingredient dosages. Dedicated experiences are presentation routes; original commerce/auth/account/admin/API safeguards remain.
- Source model factories reused with reference PMREM/DPR restored inside the new runtime. Offscreen/hidden canvases pause; event listeners, contexts, timelines, RAF, rendering resources and Lenis ticker clean up.
- Keyboard controls and focus equivalents supplement source pointer interactions. Mobile commerce menu links remain accessible. Touch disables the custom cursor; reduced motion skips loader/smooth scrolling and supplies static product imagery.
- 52 reference images reused with matching SHA-256 hashes. Local Instrument Serif, Inter Tight and Cinzel fonts reused.

## Verification (2026-11-04)
- Production build, typecheck, 20 unit tests and 11 HTTP/security boundary checks pass.
- Playwright source/application comparisons: /, /purtier, /conscientious at 1440x900, 1024x768 and 390x844. Every measured section top and height matches the source at each size; no horizontal overflow.
- Dedicated interaction script verifies desktop cursor Drag label/difference blend, menu Escape/focus, wheel caption, six unboxing progress screenshots, HIM/HER theme, wipe navigation, destination preloaders and reduced-motion touch fallback on all three routes. No console or page errors in that script.
- Full browser regression suite also exercises catalogue/search/market/bag/private areas and WebGL fallback/context loss. Final results recorded in the accompanying chat report.
- Lazy fallback photos beneath successful offscreen WebGL scenes can remain unloaded until needed; these are not missing assets. All referenced source assets exist and match.
- Original contact links connect to /support. A small commerce link group was added to the source menu. Animation screenshots differ with idle animation time, pointer position and adaptive GPU tier.
- No deployment, database migrations, live orders or authenticated staff writes performed.
