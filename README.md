# BugLens

A local, full-stack bug-reporting MVP: an embeddable privacy-first widget, a private developer workspace, and a deliberately broken fictional storefront. No paid services or deployment required.

[Live dashboard](https://buglens-tawny.vercel.app) · [Intentional-bug demo](https://buglens-tawny.vercel.app/demo). Create your own account to see and triage your reports. The published demo login below is for local development only.

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
<script
  src="http://127.0.0.1:3000/widget.js"
  data-project-key="YOUR_PUBLIC_PROJECT_KEY"
  defer
></script>
```

Public keys identify a project; they are not authentication credentials. The demo connects signed-in users to their own project when its allowed origins include the current host. Signed-in users without a matching project must click “Connect demo to my workspace” before reporting; workspace lookup failures stop the widget until retry. Anonymous visitors see an explicit shared-workspace notice. Anonymous visitors use `buglens-demo-public` and the optional seeded Form & Field project; these anonymous demo reports belong to its seeded owner. For embedding on a different site, allow its origin in Projects. Serve the widget/API over HTTPS when the host uses HTTPS. CSP must permit the script and API connection.

## Customer follow-up and developer teams

1. A website owner signs up, creates a project and installs its snippet. End customers do not need an account.
2. The reporter may explicitly enter a name/email. These are voluntary, unverified contact details, not authenticated customer identity. The optional name appears as the reporter’s conversation display name; email is visible only to the project team. The widget explains this before submission. The collector never reads the host application's logged-in user or form data.
3. After submission the widget displays a private tracking link. Save it before leaving. The link grants access to this report's description, status history and public conversation only; it never exposes screenshots, diagnostics, internal notes or contact email.
4. The project team receives an unread workspace notification for the report and customer replies. Notifications persist, can be marked read and refresh every 30 seconds while the dashboard is visible. The inbox shows the latest 50; all reports remain searchable.
5. Developers write **Public reply** to communicate with the reporter; **Internal notes** stay private. Both parties use Refresh conversation to see updates. Status updates appear on the tracking page after Refresh report status/reload. A reporter can reopen a resolved report if the issue remains.
6. Owners use Projects → Manage project team to create an invitation for a developer's exact email. Share the private link yourself; no invitation email is sent. The recipient signs up/signs in with that email and accepts. Invitations expire after seven days, work once, can be revoked, and grant access only to that project. Developers can triage, reply and manage notes, but cannot administer the project/team or delete reports. Removing a developer denies future reads and writes, including screenshot requests.

Tracking uses a 256-bit browser-generated random capability stored only as a SHA-256 hash in PostgreSQL. Its secret travels in the URL fragment and an Authorization header, not URL query/path; tracking and invitation pages use no-referrer/noindex metadata. Links expire after 90 days and owners can revoke them permanently. Anyone holding a full link can read/reply: share carefully. Losing a link currently requires contacting the site owner; there is no email-based recovery. New links are available only for new widget submissions, not historical reports. Replies are plain text, limited to 4,000 characters, idempotent by message UUID, and paginated in groups of 50. Tracking reads have a shared 1,000/minute limit; reporter replies 20/report/minute, developer replies 30/user/minute, and invitations 10/owner/minute. Project teams support up to 20 developers. These are practical MVP limits, not a replacement for operational abuse monitoring.

Password recovery is implemented through an encrypted email outbox and Better Auth. Local delivery uses Mailpit; production delivery can use a configured Gmail sender without buying a website domain. Customer conversation updates still use the saved tracking link until email subscriptions are enabled. Reporter contact remains unverified until mailbox confirmation.

## Email delivery and password recovery

Docker Compose includes a **real local Mailpit inbox** at http://127.0.0.1:8025. With `EMAIL_PROVIDER=mailpit` and `MAILPIT_URL=http://127.0.0.1:8025`, all outgoing emails are captured locally and never delivered to external recipients. Mailpit is rejected on Vercel and its URL must be loopback. Ports are bound to loopback; do not expose the inbox publicly. If another project owns PostgreSQL port 5432, use `POSTGRES_PORT=5433 docker compose up -d --wait` and update both local database URLs accordingly. Never stop/reset another project's database.

For production without a custom domain, set **server-only Vercel Production variables** `EMAIL_PROVIDER=gmail`, `GMAIL_USER` (your sender account), and `GMAIL_APP_PASSWORD` (a Secret). Create a Google App Password with 2-Step Verification enabled; never use the normal account password or paste credentials into chat/Git. See [Google's app-password guide](https://support.google.com/accounts/answer/185833). Gmail SMTP uses authenticated TLS on port 465 with certificate validation. It is suitable for a small MVP, subject to Google's quotas/filtering; it does not guarantee inbox placement or bulk-email capacity. The application caps Gmail delivery attempts at 400/day. `.vercel.app` remains the free website URL; sender authentication is a separate concern. Resend provisioning remains unused because it requires an owned sender domain.

Choose **Forgot password?** on sign-in. Recovery requests return the same message for existing and missing accounts. Links use a URL fragment, expire after 30 minutes, and can be consumed once; resets sign out previous sessions. Invalid/expired/reused links show a controlled error. Global and per-recipient limits bound requests; a request acceptance is not proof of delivery. Email contents and links are AES-256-GCM encrypted in PostgreSQL using a key derived from `BETTER_AUTH_SECRET`; delivered/expired payloads are cleared. Keep the auth secret stable, backed up and server-only. Rotating it makes old queued ciphertext unreadable.

Requests trigger a bounded background outbox drain. Failures retry with increasing delays (at most five attempts), with sanitized status codes. `npm run mail:worker` processes due jobs from a shell that has the correct database/auth/provider variables. A scheduled worker is needed for retries when there is no application traffic; never imply a durable queue runs itself without a worker. SMTP acknowledgement loss can cause duplicate delivery on retry; links are still single-use. Delivery state records server acceptance, not human receipt.

## Architecture and decisions

- npm workspaces: `apps/web` (Next.js App Router dashboard, demo and API); `packages/widget` (Vite self-contained IIFE with Shadow DOM); `packages/core` (shared Zod allowlist, URL sanitizer, bounded buffer and rate limiter).
- PostgreSQL and Prisma 6 provide persisted users, sessions, accounts, projects, reports, diagnostic events, internal notes, screenshot metadata, and status history. The migration includes foreign keys, cascades and indexes. Prisma 6 avoids the newer driver-adapter deployment requirement. Next uses the supported webpack backend for predictable local CSS builds (Turbopack’s build worker failed in this host environment). Prisma CLI transitive dependencies deepmerge-ts and effect are overridden to patched stable versions; migrations and generation are tested with those overrides. Actual stable dependency versions are recorded in `package-lock.json`.
- Better Auth manages password hashing, database sessions, secure cookie behavior and authentication endpoints. Every private API request checks a server session; report access scopes to the project owner or an explicitly invited developer. Only owners can edit project settings, manage the team, revoke tracking links or delete reports. State changes additionally check Origin. User text is rendered through React text nodes.
- `AssetStorage` is a replaceable interface. The local adapter writes random PNG filenames outside the public root. The Vercel adapter uses a private Blob store. Sharp normalizes images, and bytes are served only through an ownership-checked API route. No image base64 is stored in the database. Ingestion removes an uploaded asset if database creation fails. Deletion removes the file first, retaining a retryable record if file deletion fails.
- Status and history updates share a serializable transaction. Duplicate same-status requests do not create duplicate transitions. Serialization contention can return a retryable failure.
- The intentionally failing `POST /api/demo-order` always returns 503. A second button triggers a controlled JavaScript error; wishlist save is a successful local interaction.

## Privacy behavior

The diagnostics buffer retains at most 80 allowlisted events. Clicks include only tag and explicit role, never DOM text or field values. Navigation, unhandled errors/rejections and failed fetch/XHR record bounded fields. URLs lose credentials, queries and fragments. No keystrokes, input values, cookies, storage, headers, request/response bodies, console logs or full session replay are collected. `data-buglens-ignore` and `data-buglens-private` suppress click collection for their subtrees. Widget interactions and its ingestion fetch are excluded. `mount()` returns a `destroy()` function which restores owned wrappers and removes listeners; automatic embedding catches initialization failures.

Reporters can inspect the exact sanitized JSON (including the image data URL), exclude diagnostics, and remove the screenshot. Reports are never sent automatically. The collector is bounded and best effort. **URL paths and error messages can still contain sensitive data**, and freeform report text is reporter-supplied. Mark private content, review the payload, and avoid putting secrets in paths/errors. Ignore/private attributes cannot erase information already embedded in unrelated error messages. No claim of automatic secret detection is made.

Screenshots require a separate explicit click. html2canvas rasterizes a cloned DOM; the overlay is hidden and excluded. Inputs (including passwords), textareas, selects, contenteditable regions and `[data-buglens-private]` regions are masked in the clone before rendering and covered again with opaque pixels in the final capture. Rectangular redactions are opaque black pixels drawn into the exported PNG; highlights are outlines. Preview, retake and removal are available. Capture failure preserves the form and screenshot-free reporting. html2canvas is not a browser screenshot API: cross-origin images need suitable CORS headers, cross-origin iframes cannot be read, video/canvas content and complex CSS may be absent or inaccurate. This MVP captures the viewport, not an entire scrolling page. Pointer annotation supports touch; rectangles can be applied with a pointer or keyboard-operable pixel coordinate controls.

## Ingestion limits and operational limitations

Strict schema: title 160 characters, descriptions/steps/expected 4,000 each, 80 events, messages 300 and URLs 500. Request stream limit is 3,000,000 bytes, screenshot decoded input limit 2 MB, normalized output limit 4 MB and 16 million pixels; only actual PNG/JPEG images are decoded and re-encoded as PNG. SVG and malformed files are rejected. Private API JSON is limited separately. Form fields survive unsuccessful submissions. An in-flight guard prevents duplicate clicks, and a per-report UUID plus a database unique constraint makes retries idempotent even if the original response was lost. Reloading discards the unsent form and generates a new submission UUID.

Origin allowlisting reduces accidental ingestion from other websites; **Origin is spoofable by non-browser clients and is not authentication**. Shared atomic PostgreSQL limits allow 20 new reports/project/minute and 200 ingest attempts globally/minute. Better Auth uses database-backed authentication limits. This deliberately avoids trusting caller-controlled forwarding IP headers. Project-level quotas can still be exhausted by another caller. Limits survive function cold starts and multiple instances; a public service still needs monitoring, storage quotas and abuse response. Local files require a persistent volume and backups; use object storage for multiple instances. A process crash between writing an asset and committing its row can leave a file; a durable staging/reconciliation job is outside this MVP. File-first report deletion favors preventing orphaned private images but a database failure after deletion can leave metadata for a missing asset, repairable by retry. Live presence/typing indicators and production administration are not included. Gmail delivery requires the sender’s configured app password and Google 2-Step Verification; local Mailpit delivery does not prove production inbox delivery. The UI distinguishes unconfigured delivery from a generic accepted recovery request.

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
npm test
npx playwright install chromium
npm run test:e2e
```

Stop an existing development server before testing: Playwright builds and starts a production server with the test environment, keeping browser checks independent of hot reload. The reset script clears only a guarded direct temporary `buglens-test` screenshot directory and requires a database named `buglens_test` or `buglens_test_SUFFIX`. Integration DB tests skip explicitly when that guard is not met. Browser tests use unique signup accounts, controlled local errors, web-first assertions, a single worker and retained failure traces/screenshots. CI starts PostgreSQL, resets only its test DB and runs all checks and Chromium plus a mobile Chromium core flow. Mobile Chromium tests layout/interaction, not Safari compatibility. See `VALIDATION.md` for actual run results and coverage gaps.

## 60-second portfolio demo

- 0–8s: Open the dashboard. “BugLens turns vague feedback into actionable bug reports, without session replay.”
- 8–18s: Open Form & Field. Click Place order; show the intentional 503. “Here’s the problem our customer sees.”
- 18–33s: Open the widget, enter a short title/description, capture screenshot, point out the masked private region, draw a black redaction. Expand sanitized payload. “The reporter controls what leaves their browser.”
- 33–43s: Submit and return to the dashboard. Open the new report, show failed request status, duration, browser and reproduction steps.
- 43–53s: Send a public reply, add a private note and mark resolved. Open the saved customer tracking link: show the reply/status and explain that internal notes remain private.
- 53–60s: Show Projects and the embed snippet. “A small widget, private screenshots, and a complete local demo. Built with Next.js, PostgreSQL and TypeScript.”

## LinkedIn launch draft

I built BugLens, a self-hostable bug-reporting MVP with an embeddable widget and developer dashboard. Reporters can send reproduction steps, opt-in annotated screenshots and a bounded diagnostics timeline. The dashboard supports triage, notes and status history. Privacy defaults exclude input values and request bodies, strip URL queries, and mask form controls before screenshot capture. Includes an intentionally broken storefront for trying the full workflow. Built with TypeScript, Next.js, Prisma/PostgreSQL and Vite. This is a portfolio MVP; further operational monitoring, storage quotas, and abuse controls remain future work.

## Vercel and launch preparation

See [DEPLOYMENT.md](DEPLOYMENT.md) for private Blob/PostgreSQL setup, Node 22, required server-only variables, hosted acceptance checks and demo credentials. The Vercel project root must be `apps/web`. See [LAUNCH_POST.md](LAUNCH_POST.md) for the review-only LinkedIn draft; no post has been published or scheduled.
