ALTER TABLE "Report" ADD COLUMN "submissionId" TEXT;
CREATE UNIQUE INDEX "Report_projectId_submissionId_key" ON "Report"("projectId", "submissionId");
CREATE TABLE "RateLimitBucket" ("key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "RateLimit" ("id" TEXT PRIMARY KEY, "key" TEXT NOT NULL, "count" INTEGER NOT NULL, "lastRequest" BIGINT NOT NULL);
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");
