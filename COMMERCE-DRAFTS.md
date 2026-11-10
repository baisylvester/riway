# Packages and promotions: preparation workflow

`/admin/packages` and `/admin/promotions` let market administrators and compliance staff prepare proposed configurations. The database requires verified MFA and the matching market role for every read and save. Editors, operations staff and customers cannot manage these financial drafts.

Packages contain distinct catalogue products, quantities and optional proposed retail/member prices. Nested packages and archived/missing products are rejected. Promotions support percentage or fixed amounts, product targets, optional voucher codes, audience, minimum subtotal, percentage caps, UTC schedules and proposed redemption limits. Form amounts use ordinary two-decimal currency values; the server converts them to exact minor units. Currency comes from the selected market.

Only `draft`, `review` and `archived` states exist. Review is a preparation state, not approval or activation. Checkout, current prices, stock and public catalogue eligibility do not read these records. Applying package composition, discounts, vouchers or redemption limits to real orders, bonus-bottle rules and qualifying membership packages remains separate implementation work requiring approved policies.

The private table is inaccessible to browser roles. Public invoker wrappers call private helpers that recheck permissions, validate JSON directly and generate actor/revision/timestamps. Market and kind cannot change after creation. Updates require the displayed revision; a competing save fails rather than overwriting another staff member's work. Audits retain kind/market/revision without copying voucher definitions. Missing database setup appears explicitly rather than as an empty list.

Regression coverage includes direct SQL privilege/MFA/market checks, malformed definitions, decimal/date boundaries, optimistic concurrency, safe server-action errors and unchanged commerce gates. The rollback SQL suite leaves no hosted fixtures. Real PostgreSQL CI also races two edits with the same revision and requires one success and one conflict.

The event calendar is a separate public improvement using existing published CMS entries. Calendar dates and homepage/detail times use the selected market's named timezone. Draft, foreign-market and malformed entries are excluded; global entries remain visible. Homepage event lookup failures show an unavailable state while preserving the brand page.
