import { db } from "./db";
// Shared, atomic fixed-window limits survive cold starts and multiple functions.
export async function consumeLimit(
  key: string,
  max: number,
  windowMs = 60_000,
  now = new Date(),
) {
  const expires = new Date(now.getTime() + windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
 INSERT INTO "RateLimitBucket" ("key","count","expiresAt") VALUES (${key},1,${expires})
 ON CONFLICT ("key") DO UPDATE SET
 "count"=CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN 1 ELSE "RateLimitBucket"."count"+1 END,
 "expiresAt"=CASE WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${expires} ELSE "RateLimitBucket"."expiresAt" END
 RETURNING "count"`;
  return rows[0].count <= max;
}
