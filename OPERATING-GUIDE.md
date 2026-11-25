# RIWAY customer, distributor and staff guide

Candidate dated 25 November 2026. Features require the reviewed migrations and application to be deployed. Actual email/AI/provider services remain gated as described in `PROPOSAL-DELIVERY.md`. Use approved data only. A saved form is not proof of external delivery or payment.

## Customers and guests

1. Select the correct market, browse eligible published products and review the bag. A reorder link copies available products into the bag; review current price and stock before ordering.
2. At checkout, sign in or choose **Continue as a guest**. Verify the email link/code in the same browser. Guests receive a protected profile for that verified identity; existing customers use the same account. Account Security lets you choose/change a password. Never share a sign-in link/code.
3. Choose delivery or an approved available service centre. Review the current centre instructions and quote. If availability changes, refresh the selection and quote. An already-created order keeps its original centre instructions. Collection is not permission to pay at pickup.
4. Only approved markets and configured payment channels can proceed. A return from a payment page does not prove settlement. Check the order's verified status; use its Resume option if offered. Contact support for a paid cancellation/refund; the automated paid-refund workflow is not supplied by this release.
5. **Account → Consultations** shows your bookings. Follow a verified distributor's booking link, choose a displayed timezone/slot and confirm. Reschedule to that distributor's available slot or confirm cancellation. A conflict means someone booked first; reload and choose another time. Reload after an uncertain response before retrying.
6. **Account → Preferences** controls optional reorder email. It starts off. Save an opt-in or revoke it; the message's unsubscribe page also disables the reminder. Order/security messages are separate. SMS and messaging preferences are not available.
7. **Account → Privacy** provides an authenticated JSON export of your own records, limited to three downloads per hour. Keep the file private. Use the request form for correction/restriction/erasure; submitting a case does not automatically erase retained transactions.
8. **Account → Product assistant** may quote approved references or hand off to support. Private order support requires your own order ID. Health/medical questions go to support, not medical recommendations. Voice appears only when approved/configured and supported; consent is required before transcription. Uncheck either consent to stop capture and cancel a pending transcription request; audio already received by the provider follows its approved retention rules. Type instead if recording or local read-aloud is unavailable.
9. A published basic event allows one active registration subject to capacity. The event page shows your status/cancellation control. This release does not sell paid tickets or issue ticket refunds.

## Verified distributors

Use the distributor dashboard for your existing personal-store link/QR, attributed settled orders and privacy-limited customer summaries. Sponsor attribution is preserved; do not create a new identity to change sponsorship. Broader customer disclosure needs approved rules.

In **Account → Consultations**, create availability using the offered timezone. Review both local time and timezone before saving. Withdraw unused slots when unavailable. A booked slot must be managed through the booking change/cancel flow; editing availability cannot silently move an appointment. Customers and distributors see only their own consultation records.

In **Distributor → Content library**, filter current approved assets by market/language/type and search titles/campaigns. Open the sharing page and copy that page link. The link follows the current approved version and becomes unavailable after withdrawal. Old downloaded files and external direct URLs cannot be recalled; stop using them when withdrawn. Do not alter approved claims, disclaimers or testimonials.

## Staff and independent reviewers

Sign in using the approved staff identity, authenticator MFA and the configured second-step verification. Country/role checks also run in the database. If email codes are not delivered, escalate the sender/SMTP issue; do not bypass staff verification or assign yourself a role.

| Task | Procedure |
| --- | --- |
| Campaign asset draft | `/admin/library`: create a draft for the approved market/language/type with a permitted media URL, title/campaign/disclaimer and transcript for video. Save a revision. Editing creates a new draft and retains the current approved revision until review. |
| Review or withdraw | Another authorized market admin/compliance reviewer checks content/claims/accessibility, records the approval reference and confirms publish. The author cannot approve their own version. Withdrawal removes the sharing page and linked live story visibility. Reload before editing if a stale-version message appears. |
| Story media | In the existing CMS story form, link the approved library asset ID with appropriate market/disclaimer. Follow the existing editorial/compliance publication process. A library approval does not invent or approve the story's testimonial claims. |
| Event capacity | `/admin/events`: review the event, approve capacity with a reference and current revision. Capacity cannot undercut accepted attendance. Use the paginated scoped attendee list and confirm check-in. Duplicate/stale actions must be reloaded. There is no paid-ticket workflow here. |
| Service centres | `/admin/centres`: use authoritative address/instructions, correct market, approval reference and explicit no-additional-fee decision. Activate only approved available centres. Withdraw unavailable centres. Existing orders retain their frozen centre/address; arrange any required changes through support. |
| Reminder timing | Existing product/approved-cycle editing includes reminder lead days and approval reference. Do not invent usage schedules. Customer opt-in, latest paid purchase, current stock/registration and delivery-time checks determine whether a reminder can send. |
| Orders/fulfilment | Review verified payment and stock status before fulfilment. Use the order's frozen delivery/collection mode; the server refuses switching collection into courier dispatch and vice versa. Manual tracking remains manual; no courier label is generated. |
| Membership | Use existing audited confirmation/rejection with authoritative RIWAY references. Payment alone must not activate a member. Actual automated RIWAY enrolment/acknowledgement remains unavailable. |
| Privacy cases | Verify identity and authority through the existing case workflow, apply the approved legal/preservation process and record evidence. The export endpoint serves the signed-in subject only. Automated erasure/restriction and session revocation still require implementation. |
| Queue failures | Use the existing operations/notification views and worker runbooks. Check delivery provider and dead letters; queued is not delivered. Do not blindly replay settlements or disclose another recipient's data. Escalate uncertain state to the designated owner. |

## Training and acceptance exercise plan

This is a training outline, not a delivered training session or recorded video. Use isolated staging with approved synthetic identities and no real charges. Record instructor, participants, date, target version and sign-off.

- Customer exercise: verified guest link/code; secure own order access; unavailable centre refresh; booking/reschedule/cancel; reminder revocation; own export; other-order assistant refusal.
- Distributor exercise: profile/QR review; sponsor preservation; create timezone availability; resolve a booking conflict; share and then stop using a withdrawn campaign asset.
- Editor/reviewer exercise: draft, self-approval denial, separate reviewer publication, stale revision refusal, withdrawal and linked story removal.
- Event/operations exercise: concurrent capacity limit, attendee check-in, cancelled notification suppression, manual collection instruction review and notification failure escalation.
- Security/privacy exercise: customer/distributor/staff cross-role and cross-market denial, verified recovery, export isolation, case evidence and legal hold handling.
- Operator exercise: deploy reviewed artifact to isolated staging, inspect gates/migrations/advisors, simulate queue failure, rollback application and rehearse forward schema repair/isolated restore.

Capture short screen recordings only after approved content and isolated resources are available. Remove secrets/customer data, include captions/transcripts, review against the deployed version, and obtain the RIWAY role owners' acceptance. Deliver production credential ownership through the approved secret store, not recordings or this document.
