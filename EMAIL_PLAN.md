# Transactional email and password recovery

1. User selected Gmail SMTP on 29 October 2026 to keep the website on free .vercel.app without buying a sender domain. Use authenticated Gmail TLS with user-provided Vercel secrets; use real loopback Mailpit for local testing. Resend terms were accepted, but no resource is provisioned because an owned sender domain is required. Never pretend queued or local mail was externally delivered.
2. Add a durable encrypted email outbox, bounded retries/idempotency, expiration, delivery status, and a guarded worker. Provide an offline local capture adapter for testing without paid services.
3. Use Better Auth's reset tokens, 30-minute expiry, single-use consumption and session revocation. Build accessible request/reset pages with generic anti-enumeration responses and safe fragment-based reset links.
4. Add explicit reporter email opt-in, mailbox confirmation, unsubscribe, developer reply/status emails and verified developer notification preferences. Keep screenshots/diagnostics/internal notes out of emails and suppress updates after tracking revocation/deletion.
5. Test actual local mailbox flows, failures/retries, token expiry/reuse, session invalidation, verification/unsubscribe, private-data exclusion and existing reporting regressions; document real production delivery status.
