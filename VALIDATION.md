# Verification results

Executed on 21 October 2026. Local checks used Node 25.2.1, PostgreSQL 14 and Chromium; GitHub Actions used Node 22 and PostgreSQL 16. Hosted runtime uses Node 22, Neon PostgreSQL and private Vercel Blob.

| Check                                  | Actual result                             |
| -------------------------------------- | ----------------------------------------- |
| `npm run lint`                         | Passed                                    |
| `npm run typecheck`                    | Passed                                    |
| `npm test` with guarded test database  | 27 passed, no skips                       |
| `npm run build` (webpack)              | Passed                                    |
| Chromium E2E suite                     | 16 passed, including mobile core workflow |
| `npm audit --omit=dev`                 | Zero advisories                           |
| Fresh test database migration and seed | Passed                                    |
| Vercel production build and migrations | Passed                                    |
| Opt-in real hosted acceptance script   | Passed; see DEPLOYMENT.md                 |

The final complete local browser run took 14.3 seconds. Tests use a separate `buglens_test` database, temporary screenshot directory, unique fake accounts, local error endpoints and retained failure traces/screenshots. Reset guards reject non-test databases. Test fixtures clear only test-database rate counters between scenarios; production rate limits remain enabled.

## Coverage

The sixteen browser scenarios bundle the requested functionality:

- Signup, project creation and installation snippet.
- Widget loading, keyboard navigation, native required-field validation and style isolation.
- Failed fetch/XHR and controlled JavaScript errors in diagnostics, including an independent host origin.
- Real widget submission appears in its owner's dashboard; a new user's demo connects to their own project.
- Explicit capture, pointer/coordinate annotation, screenshot removal and reporting without capture.
- Password, ordinary input and marked-private pixel masking without changing live host input values.
- Opaque redaction pixels survive export, upload and authenticated image retrieval.
- Capture failure leaves reporting usable; failed submission preserves form data and permits retry.
- Lost-response retry produces one report through a stable idempotency key.
- Status and notes persist after reload; notes can be deleted and failed notes preserve text.
- Search, project/status/severity filters and pagination.
- A separate account cannot read, change, delete or retrieve another user's report/screenshot.
- Invalid keys/origins, malformed/oversized payloads and invalid API routes/verbs receive controlled errors.
- Actual outgoing JSON excludes input values, URL query values and request bodies.
- Mobile Chromium core reporting and collector teardown/frozen API tolerance.
- Deleting a report deletes its asset; repeated failed authentication is rate limited.

Unit/integration checks cover payload allowlists and limits, sanitization, bounded buffers, internal-request exclusion, rate limits, ownership, screenshot validation, real local storage, cleanup after injected database/storage failures, transactional status history, HTTP error behavior and the private Blob adapter.

## Hosted verification

[BugLens live deployment](https://buglens-tawny.vercel.app) passed the guarded `scripts/hosted-smoke.mjs` workflow against real PostgreSQL and private Blob storage. This includes HTTPS signup/logout/login, snippet generation, diagnostic ingestion, stored screenshot retrieval/redaction pixels, direct private Blob denial, cross-account access denial, persisted triage/notes after reload, physical Blob deletion, an independently hosted mobile embed, sensitive-field exclusion and controlled bad requests. Only fake data was used. See [DEPLOYMENT.md](DEPLOYMENT.md) for repetition instructions and the exact smoke scope.

## GitHub Actions evidence

The final launch application revision `55dc5c9e8bf20604a6a5189cc4a7e05ceebd67c7` passed [PR #8 checks](https://github.com/arslanmuhammad-dev/buglens/actions/runs/39650561192) and [branch checks](https://github.com/arslanmuhammad-dev/buglens/actions/runs/39650492194), including all 16 browser tests. It was staged, promoted and passed the expanded real hosted smoke suite, including anonymous submission, unconnected-user safeguards and public share assets. The subsequent evidence commit only scopes a smoke assertion to the widget's status message and records these results.

The application changes at `d5c539fe94aed706f3c13086664a5b5fc341be54` passed both [PR #7 checks](https://github.com/arslanmuhammad-dev/buglens/actions/runs/39632480044) and [branch checks](https://github.com/arslanmuhammad-dev/buglens/actions/runs/39632375962). These runs include install, database migration/seed, lint, TypeScript, unit/integration, production build and Chromium/mobile tests. Subsequent commits add the hosted smoke script, hosted seed URLs and evidence; their CI results are visible on PR #7.

## Boundaries

This verifies an MVP, not absence of every bug. Firefox/WebKit, load testing, crash-time asset reconciliation, backup restoration, email delivery and enterprise abuse controls have not been verified. Shared database-backed limits and real private storage have been implemented and exercised; a sustained distributed abuse test has not been run. Public Origin headers are spoofable and keys are public. html2canvas cannot reproduce every CSS feature, cross-origin image, iframe or browser-native surface. Mobile Chromium is not Safari. LinkedIn publication is awaiting draft review.
