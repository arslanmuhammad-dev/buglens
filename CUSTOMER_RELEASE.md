# Customer resolution loop

This release closes the in-app customer/developer feedback loop:

- Optional, voluntarily entered reporter name/email, labeled unverified.
- Private tracking capabilities, SHA-256 hashes at rest, 90-day expiry and owner revocation.
- Public report conversations, idempotent replies, bounded pagination and preserved failed replies.
- Customer-visible status/history and reopening of resolved reports.
- Persistent unread workspace notifications for reports, customer replies/reopening and teammate updates.
- Single-use, seven-day invitations for the intended email, explicit developer role and immediate server-side revocation.
- Owner-only project/team administration and report deletion; developer report/screenshot access, triage, replies and internal notes.

Private tracker responses use a field allowlist excluding screenshots, diagnostics, internal notes, contact email and tracking hashes. Capabilities are carried in URL fragments and Authorization headers. Tracking and invitation pages use noindex/no-referrer metadata. Reporter contact is not a verified identity. Anyone holding a private report link can read/reply; save and share it carefully.

Local validation: 35 unit/integration tests and 25 Chromium/mobile scenarios passed, along with lint, typecheck and production build. The positive invited-developer screenshot assertion is also checked separately after its addition. See `VALIDATION.md`.

## Executed hosted verification

Verified at https://buglens-tawny.vercel.app on 22 October 2026 (Pakistan time). Application commit: `c5b2405f16a0d2fa357f5c17d0d4d49a31eba50f`; production deployment: `dpl_5Zi3pC5bCvTcegbjHrbKvMPLCdd5`. The staged widget was compared byte-for-byte with the tested local bundle before promotion. Invitation HTML contained noindex/no-referrer metadata.

Both `scripts/hosted-communication-smoke.mjs` and the existing `scripts/hosted-smoke.mjs` passed on the public HTTPS origin. The new script verified actual database capability hashing, anonymous mobile tracking/replies, private-field exclusion, persisted notifications, developer response/status delivery, private-note separation, reopening, one-use team invitation acceptance, developer triage with owner-only deletion/settings, removal of developer access, tracking revocation and deletion cascades. The existing script reverified screenshot pixel redaction, authenticated private Blob delivery, unauthenticated/other-user denial, physical Blob deletion, external-origin mobile reporting, sanitized outgoing payloads, controlled invalid/oversized requests, status/notes persistence and login/logout/filter behavior. Only UUID-based fake accounts/data were created and cleaned up; the hosted database was never reset. The mobile tracking screenshot was visually reviewed. The post-release runtime error/fatal query returned zero records.

GitHub push and PR checks passed for the application commit:

- https://github.com/arslanmuhammad-dev/buglens/actions/runs/39675433297
- https://github.com/arslanmuhammad-dev/buglens/actions/runs/39675495009

PR: https://github.com/arslanmuhammad-dev/buglens/pull/10. Runtime dependency audit: zero vulnerabilities.

An initial staged build timed out on a Prisma advisory lock left by a manual migration through the pooled connection. The exact idle completed-migration session was identified and released; migrations were rechecked using `DATABASE_URL_UNPOOLED`, and the next staged build succeeded. `DEPLOYMENT.md` now explicitly requires direct connections for manual migrations. The public domain stayed on the prior working application until the successful build was promoted.

Email delivery is disabled: no sender domain is available. Customers use their saved private tracking link; invitations are shared manually. Email delivery, recipient verification, password recovery and live chat presence are not implemented in this release. LinkedIn material remains a review-only draft.
