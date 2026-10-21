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
- Browser suite: 15 passed in desktop/mobile Chromium in the final complete local run (15.5 seconds), including strengthened password and ordinary input pixel masking checks.
- GitHub Actions passed for the application changes in [PR #7](https://github.com/arslanmuhammad-dev/buglens/actions/runs/39632480044) on Node 22/PostgreSQL 16.
- Real hosted checks passed at https://buglens-tawny.vercel.app against Neon PostgreSQL and private Vercel Blob: signup, snippet, intentional failure diagnostics, screenshot capture/export/upload, authenticated retrieval, redaction pixels, direct Blob denial, second-user report/image/mutation denial, persisted triage/notes after reload, note deletion, actual asset deletion, external-origin mobile submission, sensitive-field exclusion, invalid origins/keys, malformed/oversized requests, logout and login.
- Hosted checks use unique fake accounts and clean up their reports/accounts. See `scripts/hosted-smoke.mjs` and DEPLOYMENT.md for the guarded opt-in command and scope.

## Boundaries

This is a focused MVP audit, not a guarantee that every possible bug is absent. Public ingestion remains unauthenticated and can be quota-exhausted. Storage/database crash-time reconciliation, backups/retention policy, email verification/reset delivery, team roles, enterprise abuse controls, load testing and non-Chromium browser coverage remain outside the verified scope.

The LinkedIn post is a review-only draft. No public post or scheduled publication is authorized until the user reviews it.
