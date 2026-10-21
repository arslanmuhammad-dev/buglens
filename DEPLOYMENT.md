# Vercel testing deployment

Live: https://buglens-tawny.vercel.app · Demo: https://buglens-tawny.vercel.app/demo

Deployed on 21 October 2026 with Node 22, dedicated Neon PostgreSQL on its free plan and a **private** Vercel Blob store. Database migrations ran during the successful Vercel build. The anonymous demo project contains fake data; its randomly generated owner password is not published. Sign up to receive demo reports in your own workspace.

Use Node 22 and the project root directory **apps/web**. The checked-in `apps/web/vercel.json` installs the root npm workspaces, generates Prisma, applies committed migrations through the unpooled connection when provided, builds the widget and builds Next.js. Preview and production should use separate databases if previews can apply newer migrations.

## Required services

1. A hosted PostgreSQL database, for example the Neon free plan through Vercel Marketplace. Use a dedicated BugLens database; never a production database belonging to another application.
2. A **private** Vercel Blob store connected to the BugLens project. Public blobs are unsuitable for report screenshots.

The runtime fails closed on Vercel if screenshot storage is not configured as `vercel-blob`.

## Required environment

- `DATABASE_URL`: hosted PostgreSQL connection string; use a pooled connection appropriate for serverless functions.
- `BETTER_AUTH_SECRET`: a freshly generated random secret of at least 32 characters.
- `BETTER_AUTH_URL`: the exact canonical HTTPS application origin used during testing.
- `SCREENSHOT_STORAGE=vercel-blob`
- `BLOB_READ_WRITE_TOKEN`: injected by the connected private Blob store.

Keep these server-only. Do not prefix credentials with NEXT_PUBLIC, commit them, or paste them in a public post. Omit local `.env` and screenshot directories from uploads.

## Demo setup

The demo uses a signed-in user's own allowed project. A user without a project can click **Connect demo to my workspace**. Anonymous visitors use the optional seeded public demo project.

To seed a hosted demo, set a private `DEMO_PASSWORD`, `DATABASE_URL`, and the canonical `BETTER_AUTH_URL` in the shell, then run `NODE_ENV=production npm run db:seed`. The seed refuses to use the documented local password on a hosted deployment. Do not publish the hosted owner password. A publicly shared owner account would allow any visitor to read/delete its reports; invite testers to sign up instead.

## Hosted acceptance checks

The real hosted smoke run passed on 21 October 2026. It exercised HTTPS signup/session, project/snippet, demo failure diagnostics, real screenshot upload/download and exported redaction pixels, private Blob direct-access denial, second-user report/image/mutation denial, persisted status/notes after reload, note deletion, physical Blob deletion, external-origin mobile reporting without a screenshot, exclusion of host input/query/fragment values, invalid project/origin rejection, controlled malformed/oversized errors and logout/login. Mocked SDK tests were not used as a substitute for these live checks.

To repeat against a deployment you own, load its server-only `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` into your shell without committing them, then run:

```sh
RUN_HOSTED_CHECKS=1 BUGLENS_LIVE_URL=https://your-canonical-app.vercel.app node scripts/hosted-smoke.mjs
```

This is an explicit opt-in hosted mutation test, separate from the resettable local test database suite. It creates unique fake accounts/projects, only deletes reports/accounts created in that run, and leaves unrelated data untouched. Local temporary review screenshots are written to the OS temporary directory. Use a dedicated testing deployment for repeat runs. The remaining operational checks below are broader than the smoke script; load, crash recovery and non-Chromium testing have not been performed.

Before calling the deployment verified:

- Sign up, log in and log out over HTTPS; verify cookies work on the canonical origin.
- Create a project and copy its installation snippet.
- Connect the demo to that workspace, trigger the intentional 503, inspect diagnostics and submit.
- Capture a masked screenshot, add a redaction and submit; verify the stored image after reload.
- Open the report in the same account, add/delete a note, change severity/status and reload.
- Use a separate account to request the actual report and image IDs; expect 404.
- Embed the script on a second origin and test both allowed and disallowed origins.
- Delete the report and verify its Blob asset was deleted.
- Check rate limits across requests/functions, and controlled oversized/malformed errors.
- Check mobile reporting, capture failure and retry after a lost response.

## Operational boundaries

Shared PostgreSQL buckets enforce ingestion quotas across instances; Better Auth also uses database-backed rate limits. Public ingestion remains unauthenticated and can still be abused by a caller that knows a project key and spoofs Origin. A determined caller can exhaust a project or global quota. Production operation needs monitoring, storage quotas/retention, backups and abuse response.

Image upload and database commit cannot be one atomic transaction across services. Normal error paths clean up uploaded assets; process crashes can still require reconciliation. Local development uses the existing private filesystem adapter. The Blob adapter has both mocked SDK tests and the real hosted access/deletion verification described above.
