# Customer resolution loop

1. Extend reports with optional, explicitly supplied reporter contact and a hashed, expiring tracking capability. Keep diagnostics and internal notes private.
2. Add a separate public conversation with idempotent replies, reporter reopening, status history, unread workspace notifications, and owner revocation of tracking access.
3. Add project invitations and developer membership. Owners retain project/team administration; developers can triage and reply. All routes check current membership server-side.
4. Build accessible tracking/invitation pages, widget tracking confirmation, dashboard conversations, notifications, and team settings.
5. Test token isolation, ownership/membership, public/private separation, retry handling, notifications and complete browser workflows; run existing regressions before release.

Email delivery remains disabled because there is no verified sender domain. The product must clearly say this: customers use their saved secure tracking link. Contact email is optional and unverified, never automatically collected. No pretend delivery confirmations or automatic emails to unverified addresses. Live email delivery can be added after sender-domain verification and recipient opt-in.
