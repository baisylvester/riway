-- Support three-letter language codes such as Filipino without changing
-- publication, independent review, country permissions or existing content.
alter table public.product_market_content drop constraint product_market_content_locale_check;
alter table public.product_market_content add constraint product_market_content_locale_check
 check(locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$');
alter table private.library_versions drop constraint library_versions_locale_check;
alter table private.library_versions add constraint library_versions_locale_check
 check(locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$');
