# Privacy requests (G25)

Customers can submit access/copy, correction, erasure or restriction requests at `/account/privacy`. Each case has a conversation and status history. Customers can add information or withdraw an open case. There is at most one open case of each type per account/market; replaying identical intake returns that case. Five new cases per hour and twenty customer messages per hour bound abuse. All lists and conversations are paginated in groups of 25.

Market administrators and compliance staff use `/admin/privacy` after the existing second sign-in step. Their queue contains only their authorized market and excludes their own requests. Editors and operations staff cannot read or review other customers' privacy cases. Public RPC wrappers use invoker security; private implementations repeat ownership, role, market and second-step checks. The private tables have RLS and no direct customer/service-role grants.

The review flow is submitted → in review → completed/declined, with a request-for-information branch. A customer reply to a needs-information case returns it to submitted. Completion requires a previously recorded identity-verification reference (or one recorded with completion), a resolution reference, and a customer-visible message. Declining requires a resolution reference and explanation. Closed requests cannot be edited or reopened. Expected revisions and row locks prevent lost updates; every accepted update adds an event and an audit entry. Verification/resolution references and staff identities are excluded from RPC responses and audit messages.

This is manual case management. It does not export or erase account data, revoke sessions, send emails or schedule retention. Staff must use RIWAY's approved identity checks and fulfilment process before marking a request complete. Do not put identity documents, passwords, payment details or sensitive internal notes in case conversations. No legal deadline, entitlement decision or retention period is invented by the application.

## Database and release

Migration: `supabase/migrations/20261124075021_privacy_requests.sql`, generated with the pinned Supabase CLI. It adds two private tables, indexes, RLS and four RPCs; existing tables, policies, launch gates and data are unchanged.

The rollback-only suite `tests/security/privacy_requests.sql` covers ownership, roles, market isolation, MFA, self-review rejection, forged fields, invalid inputs, duplicate intake, workflow and verification requirements, stale writes, closure, withdrawals, pagination and rate limits. It runs through PGlite and the real PostgreSQL CI script. The latter also tests four parallel identical intakes and two conflicting edits. Unit tests cover server-action authorization, error handling, input validation and safe HTML rendering.

Before rollout: run all tests, typecheck, Next/OpenNext builds and the PostgreSQL concurrency job; rehearse migration plus acceptance SQL inside a transaction ending with rollback; merge; apply the reviewed migration; deploy the CI artifact to staging; test signed-in customer and privacy-staff flows; then follow the production release process. Staging and production share a database. Browser visual checks used a temporary local development preview with synthetic data; that route is excluded from the change and removed after verification.

Remaining G25 work: approved identity-verification procedure and response handling; any automated export, deletion/session revocation and statutory exceptions; retention periods, holds, scheduled retention and audit retention policy. Configuration alone does not finish these features.
