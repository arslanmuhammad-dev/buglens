# Launch audit findings and verification

## Fixed findings

- Strict resource/subresource routing: unknown report actions no longer fall through to report reads, deletion or triage operations. Unsupported verbs return 405.
- Malformed JSON returns 400; unsupported request content types return 415; stream and declared body-size overflows return 413. Pagination and filters are validated instead of allowing decimal offsets to reach Prisma.
- UUID submission keys and a per-project unique index make lost-response retries idempotent, including concurrent requests. Ordinary failures still clean up uploaded files.
- Status and severity are updated together with status history in a serializable transaction.
- Ingestion limits now use atomic shared PostgreSQL counters, and Better Auth uses its database rate-limit adapter. Cold starts no longer clear limits.
- A private Vercel Blob adapter supports durable serverless screenshots; Vercel fails closed if configured to use local files.
- Screenshot privacy uses opaque final-pixel masking as well as cloned-DOM masking. Input values in the live host are unchanged. Tests verify password, email-input and marked-private pixels.
- The widget consumes and validates the acceptance response, disables form controls while submitting, keeps a stable retry UUID, prevents submit/capture races, and handles destroyed instances and cancelled pointer gestures.
- Diagnostics tolerate frozen host APIs, preserve native fetch/XHR behavior, bound outstanding XHR listeners and stop collecting after teardown. Real cross-origin browser coverage exercises fetch, XHR, JavaScript errors and sensitive-field exclusion.
- Dashboard session failures become visible errors, stale search responses are ignored, pagination clamps after deletion, failed internal notes retain text and show a retryable error, and form mutations guard duplicate clicks.
- Signed-in demo visitors now report into their own allowed project, with an explicit connect action when no matching project exists. Hosted seeding refuses the published local demo password.

## Executed checks

- Lint and TypeScript: passed after the fixes.
- Unit/integration suite: 27 passed against a freshly migrated isolated PostgreSQL database.
- Production build: passed.
- Browser suite: 15 passed in desktop/mobile Chromium (16.7 seconds). An additional strengthened pixel test then passed, covering password and ordinary input masking without mutating the host values.
- Private Blob SDK calls are covered by mocked unit tests. A real private Blob store has been provisioned for the hosted acceptance tests; live application checks are tracked in DEPLOYMENT.md.

## Boundaries

This is a focused MVP audit, not a guarantee that every possible bug is absent. Public ingestion remains unauthenticated and can be quota-exhausted. Storage/database crash-time reconciliation, backups/retention policy, email verification/reset delivery, team roles, enterprise abuse controls, load testing and non-Chromium browser coverage remain outside the verified scope.

The LinkedIn post is a review-only draft. No public post or scheduled publication is authorized until the user reviews it.
