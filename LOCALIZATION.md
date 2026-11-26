# Regional language support

Candidate updated 26 November 2026. Routing, shared navigation, catalogue/bag
controls, language selection and translated-content selection are implemented.
This does not certify complete professional translation of the website. English
remains the only language enabled by default. Existing payment, content,
membership and commercial-launch approvals remain separate.

## Implemented behavior

- English URLs retain their existing paths. Candidate locales use `/fil`, `/ms`
  and `/zh-CN` prefixes. `/en/...` redirects to the original English URL.
- Each market has an explicit enabled-language list. The picker preserves the
  current path, query, filter values and fragment. Changing country falls back
  to English if the selected language is unavailable there. Shopping-bag state
  is preserved; language changes never authorize an order or payment.
- Typed dictionaries cover shared navigation, catalogue/search/category controls,
  bag controls/statuses, add-to-bag controls and product-information headings.
  Catalogue categories remain canonical API values rather than translated values.
- The standard App Router localized entrypoint delegates only an explicit list
  of existing public/customer pages. It reuses their data access and the original
  account permission layout. APIs, callbacks, staff and operations routes have
  no localized aliases. Authentication checks use the normalized underlying path
  for both native and Clerk auth. Incoming locale/path headers are overwritten.
- Auth success, sign-out and native verification/recovery links preserve a
  supported selected language. Callback return destinations are restricted to
  approved local account, checkout and password-update paths; arbitrary redirects
  are refused. Real hosted Auth/email acceptance is still required.
- Localized links preserve the language within customer journeys. Crossing into
  an English staff workspace reloads the root layout. Language changes use a
  document navigation so HTML `lang`, server content and the client dictionary
  agree. The picker waits for hydration before accepting a change.
- CMS sections select a published market/language entry first, then the published
  English fallback. Sections identify their actual language. A draft never replaces
  the fallback. Product content has independent per-product/market/locale records;
  staff can prepare/review each through `/admin/product-content`.
- Three-letter language codes such as `fil` are supported by product content and
  the campaign library. The migration changes locale validation only; publication,
  independent library review, country permissions and MFA remain in force.
- Original-route mutations also invalidate the localized page entrypoint, so
  account changes and content withdrawal do not leave a separate stale locale
  view. The returns Terms of Sale link now targets the existing `/legal/terms`.

## Review and activation

The Filipino, Malay and Simplified Chinese dictionary text is candidate copy.
RIWAY's language/compliance owners must review it before enabling a market. This
is not approval of product claims, medical statements, legal terms or income copy.
No machine translation of those materials is published automatically.

In the existing authorized environment, configure an actual review reference and
only the accepted language codes:

```text
UI_TRANSLATION_APPROVAL_REFERENCE=<approved review record>
UI_LOCALES_PH=en,fil
UI_LOCALES_SG=en,zh-CN
UI_LOCALES_MY=en,ms
```

The values above illustrate configuration, not an instruction to activate those
markets. Supported codes are `en`, `fil`, `ms`, `zh-CN`. Unknown codes are ignored;
English remains available. Without a review reference of at least five characters,
only English is enabled. Staff routes stay English and do not offer the picker.

For CMS sections, retain the existing naming convention:

```text
support-contacts-ph-fil    Philippine Filipino section
support-contacts-fil       General Filipino section
support-contacts-ph        Philippine English fallback
support-contacts           General English fallback
```

Only published, currently scheduled-live and correct-market content is selected.
Use the existing editorial/compliance workflow. For product content choose the
market and language, save the translation, obtain its specific approval and publish
it. Editing one language does not overwrite another language. Source videos,
transcripts and legally required statements still need approved translations.

## Search indexing

UI translation approval is not proof that a complete page has been translated.
Non-English pages default to `noindex` and the English canonical. After reviewing
the complete page, operators may explicitly list its exact English path:

```text
LOCALIZED_SEO_PATHS={"fil":["/shop"],"ms":["/about"]}
```

Only an enabled PH/default-crawler-market locale with that exact reviewed path is
added to sitemap/hreflang. Approved localized pages use their own canonical and
reciprocal language alternates. There is no wildcard publication. Account, cart,
checkout and other private routes remain excluded. Global `SEARCH_INDEXING` remains
disabled unless separately approved. Country is still selected by the existing
cookie; this increment does not invent country-specific SEO URLs or publish
SG/MY-only stories to a cookieless PH crawler.

## Remaining work and verification limits

Many account/authentication/checkout screens, brand presentation copy and staff
workspaces remain English. Their language is marked as English, and a translated
notice explains content fallback. Completing those screens still requires code
and reviewed dictionaries; approved CMS content alone does not complete them.
English regulatory/legal text is preserved rather than presented as a translated
legal statement. Professionally approved content and whole-site language coverage
remain a proposal gap.

Unit tests cover dictionary completeness, query/fragment preservation, local-only
auth return destinations, route allowlists, header spoofing, both auth guards,
session-cookie forwarding, POST preservation, SEO gates and cache invalidation.
The database suite checks translated drafts/publication, MFA and country isolation,
and independent original/translated records. Desktop/mobile tests exercise real
database routines behind synthetic Auth/REST. They are not actual Supabase/Clerk
or email-provider acceptance, physical-device coverage or a full WCAG audit.

For rollback, disable the affected market languages and remove their reviewed SEO
paths, then deploy the prior reviewed application if required. Preserve approved
content and the broader locale-validation constraint. Do not delete translations,
rewrite an applied migration or alter financial/member records to roll back UI.
