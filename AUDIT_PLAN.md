# Launch-readiness audit

1. Review every dashboard, widget and API operation for validation, ownership, privacy, retries and failure states; add regression tests for concrete findings.
2. Replace single-process ingestion limits with shared PostgreSQL buckets, add retry idempotency, tighten routing and make triage updates atomic.
3. Add a private Vercel Blob storage adapter while preserving local-only development and authenticated image serving. Configure reproducible Vercel builds and safe environment/bootstrap instructions.
4. Fix dashboard loading/race/error behavior, improve embedded-widget collection teardown and cross-origin verification.
5. Execute lint, typecheck, unit/integration and expanded browser suites. Deploy to Vercel only with durable database/storage configured, then exercise the real hosted workflow.
6. Prepare an honest LinkedIn launch post using the verified hosted URL and test results. Publish/schedule only when the deployment passes live checks and the requested account/time are available.

No audit can guarantee absence of all bugs. Record executed coverage, open risks and deployment blockers explicitly.
