# Vercel testing deployment

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

Image upload and database commit cannot be one atomic transaction across services. Normal error paths clean up uploaded assets; process crashes can still require reconciliation. Local development uses the existing private filesystem adapter. The Blob adapter is unit-tested with mocked SDK calls; hosted access/deletion must also be checked against a real private store before claiming deployment verification.
