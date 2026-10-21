import { z } from "zod";
export const MAX_BODY = 3_000_000;
export function sanitizeUrl(raw: string, base = "http://localhost") {
  try {
    const u = new URL(raw, base);
    if (!["http:", "https:"].includes(u.protocol)) return "[invalid URL]";
    u.username = "";
    u.password = "";
    u.search = "";
    u.hash = "";
    return u.toString().slice(0, 500);
  } catch {
    return "[invalid URL]";
  }
}
export function safeMessage(raw: string) {
  return raw
    .replace(/https?:\/\/[^\s)]+/g, (s) => sanitizeUrl(s))
    .slice(0, 300);
}
export const eventSchema = z
  .object({
    type: z.enum(["click", "navigation", "error", "rejection", "request"]),
    time: z.number().finite(),
    tag: z.string().max(30).optional(),
    role: z.string().max(40).optional(),
    url: z
      .string()
      .max(500)
      .transform((v) => sanitizeUrl(v))
      .optional(),
    message: z.string().max(300).transform(safeMessage).optional(),
    method: z.string().max(10).optional(),
    status: z.number().int().min(0).max(599).optional(),
    duration: z.number().min(0).max(86_400_000).optional(),
  })
  .strict();
export const payloadSchema = z
  .object({
    submissionId: z.string().uuid().optional(),
    projectKey: z.string().min(1).max(100),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(4000),
    steps: z.string().max(4000),
    expected: z.string().max(4000),
    pageUrl: z
      .string()
      .max(500)
      .transform((v) => sanitizeUrl(v)),
    browser: z.enum(["Firefox", "Edge", "Chrome", "Safari", "Other"]),
    viewport: z.string().regex(/^\d{1,5}x\d{1,5}$/),
    events: z.array(eventSchema).max(80),
    screenshot: z.string().max(2_800_000).nullable().optional(),
  })
  .strict();
export type Diagnostic = z.infer<typeof eventSchema>;
export class BoundedBuffer {
  private items: Diagnostic[] = [];
  constructor(private limit = 80) {}
  push(event: unknown) {
    const parsed = eventSchema.safeParse(event);
    if (parsed.success) {
      this.items.push(parsed.data);
      if (this.items.length > this.limit) this.items.shift();
    }
  }
  snapshot() {
    return this.items.map((x) => ({ ...x }));
  }
}
export function internalRequest(url: string, endpoint: string) {
  try {
    return (
      new URL(url, endpoint).origin === new URL(endpoint).origin &&
      new URL(url, endpoint).pathname.startsWith("/api/ingest")
    );
  } catch {
    return true;
  }
}
export class RateLimiter {
  private hits = new Map<string, { count: number; until: number }>();
  constructor(
    private max = 20,
    private window = 60000,
  ) {}
  allow(key: string, now = Date.now()) {
    for (const [k, v] of this.hits) if (v.until <= now) this.hits.delete(k);
    const v = this.hits.get(key);
    if (!v) {
      if (this.hits.size >= 10000) return false;
      this.hits.set(key, { count: 1, until: now + this.window });
      return true;
    }
    return ++v.count <= this.max;
  }
}

export const projectSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    origins: z
      .array(
        z
          .string()
          .max(300)
          .refine((value) => {
            try {
              const u = new URL(value);
              return (
                ["https:", "http:"].includes(u.protocol) &&
                u.origin === value &&
                !u.hostname.includes("*")
              );
            } catch {
              return false;
            }
          }, "Use an exact http(s) origin without a path"),
      )
      .min(1)
      .max(20),
  })
  .strict();
export const triageSchema = z
  .object({
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).optional(),
    severity: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.status || v.severity),
    "Choose a status or severity",
  );
