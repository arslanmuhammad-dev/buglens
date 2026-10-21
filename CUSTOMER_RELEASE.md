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

Hosted checks and release references will be added after execution. The hosted scripts create UUID-based fake accounts/data and delete only their own records; they never reset the hosted database.

Email delivery is disabled: no sender domain is available. Customers use their saved private tracking link; invitations are shared manually. Email delivery, recipient verification, password recovery and live chat presence are not implemented in this release. LinkedIn material remains a review-only draft.
