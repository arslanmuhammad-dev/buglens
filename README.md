# BugLens

A local, full-stack bug-reporting MVP: an embeddable privacy-first widget, a private developer workspace, and a deliberately broken fictional storefront. No paid services or deployment required.

## Fresh checkout

Prerequisites: Node.js 22.12+ (Node 22 LTS recommended), npm 10+, Docker with Compose. Ports 3000 and 5432 must be available.

```sh
npm ci
cp .env.example .env
cp .env.example apps/web/.env.local
docker compose up -d --wait
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://127.0.0.1:3000. The seeded account is `demo@buglens.local` / `BugLens-demo-2026`. The demo is http://127.0.0.1:3000/demo. Use fake data. You can also sign up and create an independent project. **Never use demo credentials or the example secret in a public environment.** Replace `BETTER_AUTH_SECRET` with a random secret for any shared environment. Root `.env` is read by Prisma; Next reads `apps/web/.env.local`. Keep their settings synchronized. Shell environment variables override file defaults.

`npm run build` builds the Vite IIFE widget into the dashboard’s public assets, then builds Next. `npm run start -w @buglens/web` serves the production build. Rebuild the widget after editing its source. There is no separate storefront server: the demo is a Next route.

## Installation

Create a project, enter exact allowed origins (including scheme and port, without trailing slash), then copy the snippet from Projects:

```html
<script src="http://127.0.0.1:3000/widget.js" data-project-key="YOUR_PUBLIC_PROJECT_KEY" defer></script>
```

Public keys identify a project; they are not authentication credentials. The demo connects signed-in users to their own project when its allowed origins include the current host. Users without a project can click “Connect demo to my workspace”. Anonymous visitors use `buglens-demo-public` and the optional seeded Form & Field project; these anonymous demo reports belong to its seeded owner. For embedding on a different site, allow its origin in Projects. Serve the widget/API over HTTPS when the host uses HTTPS. CSP must permit the script and API connection.

## Architecture and decisions

- npm workspaces: `apps/web` (Next.js App Router dashboard, demo and API); `packages/widget` (Vite self-contained IIFE with Shadow DOM); `packages/core` (shared Zod allowlist, URL sanitizer, bounded buffer and rate limiter).
- PostgreSQL and Prisma 6 provide persisted users, sessions, accounts, projects, reports, diagnostic events, internal notes, screenshot metadata, and status history. The migration includes foreign keys, cascades and indexes. Prisma 6 avoids the newer driver-adapter deployment requirement. Next uses the supported webpack backend for predictable local CSS builds (Turbopack’s build worker failed in this host environment). Prisma CLI transitive dependencies deepmerge-ts and effect are overridden to patched stable versions; migrations and generation are tested with those overrides. Actual stable dependency versions are recorded in `package-lock.json`.
- Better Auth manages password hashing, database sessions, secure cookie behavior and authentication endpoints. Every private API request checks a server session; every report/project operation scopes to its owner. State changes additionally check Origin. User text is rendered through React text nodes.
- `AssetStorage` is a replaceable interface. The local adapter writes random PNG filenames outside the public root. The Vercel adapter uses a private Blob store. Sharp normalizes images, and bytes are served only through an ownership-checked API route. No image base64 is stored in the database. Ingestion removes an uploaded asset if database creation fails. Deletion removes the file first, retaining a retryable record if file deletion fails.
- Status and history updates share a serializable transaction. Duplicate same-status requests do not create duplicate transitions. Serialization contention can return a retryable failure.
- The intentionally failing `POST /api/demo-order` always returns 503. A second button triggers a controlled JavaScript error; wishlist save is a successful local interaction.

## Privacy behavior

The diagnostics buffer retains at most 80 allowlisted events. Clicks include only tag and explicit role, never DOM text or field values. Navigation, unhandled errors/rejections and failed fetch/XHR record bounded fields. URLs lose credentials, queries and fragments. No keystrokes, input values, cookies, storage, headers, request/response bodies, console logs or full session replay are collected. `data-buglens-ignore` and `data-buglens-private` suppress click collection for their subtrees. Widget interactions and its ingestion fetch are excluded. `mount()` returns a `destroy()` function which restores owned wrappers and removes listeners; automatic embedding catches initialization failures.

Reporters can inspect the exact sanitized JSON (including the image data URL), exclude diagnostics, and remove the screenshot. Reports are never sent automatically. The collector is bounded and best effort. **URL paths and error messages can still contain sensitive data**, and freeform report text is reporter-supplied. Mark private content, review the payload, and avoid putting secrets in paths/errors. Ignore/private attributes cannot erase information already embedded in unrelated error messages. No claim of automatic secret detection is made.

Screenshots require a separate explicit click. html2canvas rasterizes a cloned DOM; the overlay is hidden and excluded. Inputs (including passwords), textareas, selects, contenteditable regions and `[data-buglens-private]` regions are masked in the clone before rendering and covered again with opaque pixels in the final capture. Rectangular redactions are opaque black pixels drawn into the exported PNG; highlights are outlines. Preview, retake and removal are available. Capture failure preserves the form and screenshot-free reporting. html2canvas is not a browser screenshot API: cross-origin images need suitable CORS headers, cross-origin iframes cannot be read, video/canvas content and complex CSS may be absent or inaccurate. This MVP captures the viewport, not an entire scrolling page. Pointer annotation supports touch; rectangles can be applied with a pointer or keyboard-operable pixel coordinate controls.

## Ingestion limits and operational limitations

Strict schema: title 160 characters, descriptions/steps/expected 4,000 each, 80 events, messages 300 and URLs 500. Request stream limit is 3,000,000 bytes, screenshot decoded input limit 2 MB, normalized output limit 4 MB and 16 million pixels; only actual PNG/JPEG images are decoded and re-encoded as PNG. SVG and malformed files are rejected. Private API JSON is limited separately. Form fields survive unsuccessful submissions. An in-flight guard prevents duplicate clicks, and a per-report UUID plus a database unique constraint makes retries idempotent even if the original response was lost. Reloading discards the unsent form and generates a new submission UUID.

Origin allowlisting reduces accidental ingestion from other websites; **Origin is spoofable by non-browser clients and is not authentication**. Shared atomic PostgreSQL limits allow 20 new reports/project/minute and 200 ingest attempts globally/minute. Better Auth uses database-backed authentication limits. This deliberately avoids trusting caller-controlled forwarding IP headers. Project-level quotas can still be exhausted by another caller. Limits survive function cold starts and multiple instances; a public service still needs monitoring, storage quotas and abuse response. Local files require a persistent volume and backups; use object storage for multiple instances. A process crash between writing an asset and committing its row can leave a file; a durable staging/reconciliation job is outside this MVP. File-first report deletion favors preventing orphaned private images but a database failure after deletion can leave metadata for a missing asset, repairable by retry. No email verification delivery, password-reset email, team roles or production administration is included.

## Automated checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Use a **separate** PostgreSQL test database and temporary screenshot directory for database/E2E checks. Never point the reset at development or production.

```sh
# With Compose running:
docker compose exec postgres createdb -U postgres buglens_test
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/buglens_test
export SCREENSHOT_DIR=/tmp/buglens-test-screenshots
export BETTER_AUTH_SECRET=test-only-secret-at-least-thirty-two-characters
export BETTER_AUTH_URL=http://127.0.0.1:3000
node scripts/test-db.mjs
npm run db:seed
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

Stop an existing development server before testing: Playwright builds and starts a production server with the test environment, keeping browser checks independent of hot reload. The reset script clears only a guarded direct temporary `buglens-test` screenshot directory and requires a database named `buglens_test` or `buglens_test_SUFFIX`. Integration DB tests skip explicitly when that guard is not met. Browser tests use unique signup accounts, controlled local errors, web-first assertions, a single worker and retained failure traces/screenshots. CI starts PostgreSQL, resets only its test DB and runs all checks and Chromium plus a mobile Chromium core flow. Mobile Chromium tests layout/interaction, not Safari compatibility. See `VALIDATION.md` for actual run results and coverage gaps.

## 60-second portfolio demo

- 0–8s: Open the dashboard. “BugLens turns vague feedback into actionable bug reports, without session replay.”
- 8–18s: Open Form & Field. Click Place order; show the intentional 503. “Here’s the problem our customer sees.”
- 18–33s: Open the widget, enter a short title/description, capture screenshot, point out the masked private region, draw a black redaction. Expand sanitized payload. “The reporter controls what leaves their browser.”
- 33–43s: Submit and return to the dashboard. Open the new report, show failed request status, duration, browser and reproduction steps.
- 43–53s: Add a note, mark resolved, reload and show persisted status. “One report, enough context to start fixing.”
- 53–60s: Show Projects and the embed snippet. “A small widget, private screenshots, and a complete local demo. Built with Next.js, PostgreSQL and TypeScript.”

## LinkedIn launch draft

I built BugLens, a self-hostable bug-reporting MVP with an embeddable widget and developer dashboard. Reporters can send reproduction steps, opt-in annotated screenshots and a bounded diagnostics timeline. The dashboard supports triage, notes and status history. Privacy defaults exclude input values and request bodies, strip URL queries, and mask form controls before screenshot capture. Includes an intentionally broken storefront for trying the full workflow. Built with TypeScript, Next.js, Prisma/PostgreSQL and Vite. This is a portfolio MVP; further operational monitoring, storage quotas, and abuse controls remain future work.

## Vercel and launch preparation

See [DEPLOYMENT.md](DEPLOYMENT.md) for private Blob/PostgreSQL setup, Node 22, required server-only variables, hosted acceptance checks and demo credentials. The Vercel project root must be `apps/web`. See [LAUNCH_POST.md](LAUNCH_POST.md) for the review-only LinkedIn draft; no post has been published or scheduled.
