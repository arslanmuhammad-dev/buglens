# Verification results

Executed locally on 21 October 2026 using Node 25.2.1, npm 11.10.0, PostgreSQL 14 and Chromium 156. GitHub Actions also passed on Node 22 and PostgreSQL 16; remote run evidence is linked below.

| Check | Actual result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` with guarded test database | 15 passed, no skips |
| `npm run build` (webpack) | Passed, all routes generated |
| `npm run test:e2e` | 9 passed, including desktop Chromium and mobile Chromium |
| `npm audit` after dependency patching | Zero advisories |
| Final `npm audit --omit=dev` | Zero advisories |
| Fresh test database migration, seed and reset | Passed |

Browser checks run against a production server, a separate `buglens_test` database and `/private/tmp/buglens-test-screenshots`. The successful complete browser run took 22.5 seconds. Earlier failures were fixed: duplicate development widget initialization, stale diagnostics preview after an asynchronous request, readiness of demo actions before collection starts, generated non-strict Next TypeScript configuration, and a test locator which targeted a hidden select option. Turbopack’s CSS worker failed on this machine; the supported webpack backend builds successfully and is the documented default.

## Coverage

The nine browser tests bundle the requested scenarios:

- Signup, project creation and installation snippet.
- Widget loading, keyboard launcher/form navigation, native required-field validation and style isolation.
- Failed demo request in diagnostics; real submission visible in the dashboard.
- Explicit capture, pointer annotation, keyboard-coordinate redaction and screenshot removal; reporting without a screenshot.
- Pixel checks on a known marked private area; opaque black pixels verified in exported PNG and authenticated server-served PNG.
- Controlled canvas failure leaves reporting usable; failed ingestion retains entered text and permits retry.
- Status and internal notes persist after reload; notes can be deleted.
- Title search, project/status/severity filters and pagination.
- Separate authenticated user receives 404 for another user’s report, mutation, deletion and actual stored screenshot; unauthenticated requests receive 401.
- Invalid project keys, disallowed origins and oversized actual HTTP payloads are rejected.
- Actual outgoing JSON excludes demo field values and URL query secrets; diagnostics can be removed.
- Core reporting at an iPhone-sized Chromium viewport.
- Deleting a report reduces stored asset count and removes authenticated access.

Unit/integration checks exercise strict payload allowlists, string/array limits, URL sanitization, safe error URLs, bounded buffer copies, internal-request exclusion, rate-limit expiry, malformed/oversized screenshots, real local storage, ownership denial, transactional status history, cleanup failure retention and uploaded-file cleanup after an injected database failure.

## Boundaries

The MVP was subsequently pushed through feature pull requests on user request. No application deployment or site publication occurred. Remote CI results are recorded below when available. Firefox/WebKit, distributed rate limits/storage, crash-time file reconciliation, email delivery, and production load/security testing are not claimed. Pointer annotation was tested in desktop Chromium; mobile Chromium covers the core report flow without capture. See README for public-ingestion and html2canvas limitations.

## GitHub Actions verification

On 21 October 2026, both checks for commit `f503202184f0a9e5ad91d47086e98d8b4a4fffc0` completed successfully:

- [PR #6 checks](https://github.com/arslanmuhammad-dev/buglens/actions/runs/39625965113)
- [Feature branch push checks](https://github.com/arslanmuhammad-dev/buglens/actions/runs/39625904508)

These runs used Node 22 and PostgreSQL 16 and passed installation, migration/seed, lint, TypeScript, unit/integration tests, production build, and Chromium/mobile browser tests. The following documentation-only commit records this evidence; the links above refer to the exact tested source commit.
