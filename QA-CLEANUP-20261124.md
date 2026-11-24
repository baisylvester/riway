# Reviewed QA cleanup scope — 24 November 2026

Status: **completed on 24 November 2026**, after the owner approved this reviewed cleanup in chat ("proceed"). Production and staging share Supabase project `skiimthwadramxdzhgoy`. The inventory below records the pre-cleanup state; completion evidence follows.

## Completion evidence

- Fresh inspection matched the reviewed identifiers and dependencies. A rollback-only rehearsal of the guarded database cleanup passed before deletion.
- The exact private photo was removed through the Storage API, and a follow-up folder listing returned zero objects. The database cleanup then ran in one transaction with row locks, exact-target checks and affected-row assertions.
- Removed one pending photo submission, one directory listing, two temporary distributor profiles and two PH compliance roles. Follow-up counts for each target category, including the storage object, are zero.
- Archived only `qa-checkout-test`; deactivated only `QA-CHECKOUT`; set PH `online_sales_approved` and `payments_ready` to false while retaining the QA policy reference as history; disabled only PH's test-mode Xendit routing. The routing row and its channel list remain. No application deployment was needed.
- Retained all three auth accounts and all three app identities. The older QA sponsor, its one attribution, both paid orders, two order items, four Xendit attempts, three Xendit events, the inventory row and two inventory movements remain. Before/after row fingerprints match for all seven transaction/history categories. In-transaction assertions also verified that every pre-existing audit record remains unchanged.
- An authenticated, rollback-only checkout attempt was refused with `Online sales not approved`; it created no order. The unmodified HTTP/API suite passed **53/53 on staging and 53/53 on production**, with the catalogue count back to 2 and no temporary assertion adjustment.
- Public product/store lookups no longer expose the QA product or sponsor; the direct pages contain Next.js's not-found fallback and `noindex` marker. Their streamed responses retain HTTP 200, so they are not recorded as HTTP 404 checks. The directory contains neither temporary distributor code.
- Production health remains commerce/payments/Xendit disabled. Staging health still describes its configured capability as commerce gated/Xendit test, but PH's database sales/payment gates and test routing are disabled.

The following sections preserve the reviewed scope and original values for reference. The cleanup is complete; do not rerun its deletion steps.

## November 24 fixtures

| Record | Exact target | Observed state |
| --- | --- | --- |
| Private storage object | Bucket `distributor-photo-submissions`, path `4451c293-bf4e-4800-b1a8-1adcb3d6a87a/c49ef9b0-0a3f-4a27-ac31-9ef7f70eb7be.png` | One object, id `074c743b-4dd9-4912-b794-28675f8be237`; no published copy found in the inspected distributor folders |
| Photo submission | `a38fb5c9-00e5-4a64-a24c-a5f97152fd53` | Pending; user `4451c293-bf4e-4800-b1a8-1adcb3d6a87a`; exact object path above |
| Directory listing | User `4451c293-bf4e-4800-b1a8-1adcb3d6a87a` | Quezon City |
| Main distributor profile | User `4451c293-bf4e-4800-b1a8-1adcb3d6a87a`, code `QA-MAIN-20261124`, external id `STAGING-QA-20261124-MAIN` | PH; zero sponsored orders and zero sponsor attributions |
| QA distributor profile | User `751685bc-376e-45b5-ad44-e4ba807fc733`, code `QA-DIST-20261124`, external id `STAGING-QA-20261124-DIST` | PH; zero sponsored orders and zero sponsor attributions |
| Temporary staff roles | PH compliance for users `4451c293-bf4e-4800-b1a8-1adcb3d6a87a` and `5463d446-91e1-498b-8699-4755e343d23a` | **Two** roles currently exist; the handover's reference to three roles does not match the database |

Approved procedure (completed):

1. Remove the exact storage object using the Storage API or dashboard. Do not delete only its SQL metadata. Verify the object no longer exists.
2. In one database transaction, lock the two distributor rows and verify the exact codes/external ids, zero sponsored orders and zero attributions. Stop on changed dependencies. Delete the exact pending submission and directory listing, then the two distributor profiles, then only the two listed PH compliance roles. Check counts before committing.
3. Confirm zero matching storage objects, submissions, directory rows, distributor profiles and temporary roles. Verify the main user's two customer orders still exist and are unchanged. Keep audit records.

Keep all three auth accounts and their app identities. This cleanup does not delete the owner's main account or the two QA auth accounts. Auth-account deletion would be a separate decision requiring session revocation and dependency review.

## November 23 checkout fixtures

The older checkout data is not safe to delete as a blanket fixture purge:

- Sponsor `QA-CHECKOUT` (`5e7a9000-0000-4000-8000-00000000a001`, external id `STAGING-QA-SPONSOR`) has **two paid sponsored orders and one sponsor attribution**.
- Those orders belong to the main user as a customer: `3c78911f-3faa-4850-bb1c-d94b7ec8f1ba` and `570418ce-114c-4a9c-97b0-65dac769ea66`. Retain their payment, inventory and audit history.
- Product `qa-checkout-test` (`5e7a9000-0000-4000-8000-00000000b001`) is still published.
- PH has `online_sales_approved=true`, `payments_ready=true`, policy reference `STAGING-QA-20261123`.
- PH Xendit test routing (`livemode=false`) is a MASTER account with payments enabled and channels `GCASH`, `PAYMAYA`, `QRPH`, `BPI_ONLINE_BANKING`, `CARDS`. No PH live routing row was returned.

The approved withdrawal, completed after a fresh state check, archived only that QA product, deactivated only that QA sponsor, closed PH's temporary sales/payment gates while its policy reference was still `STAGING-QA-20261123`, and disabled only PH's test-mode Xendit routing. The rows, attribution and transaction history were preserved. Live payment routing, other markets and real catalogue products were not targeted. These configuration changes can be reversed from the original values recorded above.

Afterwards, verify the QA product and sponsor are absent from public lookup, PH checkout refuses orders, PH test routing is disabled, both paid orders remain, and production `/api/health` still reports commerce/payments/Xendit disabled. Run the HTTP/API suite against staging and production with the catalogue count restored to the real published products.

## Other continuation blockers

Staff emailed-code delivery still needs custom SMTP for an owned, verified sender domain and an inbox-delivery check. No new provider account, email send or SMTP change was made during this continuation. The broader RIWAY API/content/UAT dependencies in `REMAINING-SCOPE.md` remain open.
