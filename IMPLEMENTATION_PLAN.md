# Implementation plan
1. Scaffold npm workspaces, shared strict payload validation, Prisma schema/migration, Better Auth.
2. Implement ownership-scoped dashboard APIs, bounded ingestion, transactional report history, private local image storage.
3. Implement isolated accessible widget with privacy-first diagnostics, explicit screenshot capture and pixel annotations.
4. Build a polished dashboard and deliberately broken fictional storefront.
5. Add deterministic seeds, unit/integration and browser coverage, CI and exact local instructions. Run checks and report limitations factually.

Decisions: Next.js App Router, stable npm releases pinned by package-lock, Prisma 6 (classic PostgreSQL engine), Better Auth credentials, Vite IIFE widget, html2canvas with documented browser limitations. Local-only, no deployment.
