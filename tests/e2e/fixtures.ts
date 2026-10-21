import { test as base, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
const url = process.env.DATABASE_URL || "";
if (
  !/^buglens_test(?:_[a-z0-9]+)?$/.test(
    new URL(url || "postgresql://localhost/invalid").pathname.slice(1),
  )
)
  throw Error("Browser fixtures require an isolated test database");
const db = new PrismaClient();
// Keep production rate limits enabled, but isolate their test-only buckets.
export const test = base.extend<{ isolatedLimits: void }>({
  isolatedLimits: [
    async ({ baseURL }, use) => {
      if (baseURL !== "http://127.0.0.1:3000")
        throw Error("Use the isolated local browser server");
      await db.rateLimit.deleteMany();
      await db.rateLimitBucket.deleteMany();
      await use();
    },
    { auto: true },
  ],
});
test.afterAll(async () => {
  await db.$disconnect();
});
export { expect };
