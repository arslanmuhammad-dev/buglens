import { describe, it, expect } from "vitest";
import {
  sanitizeUrl,
  safeMessage,
  payloadSchema,
  BoundedBuffer,
  RateLimiter,
  internalRequest,
} from "../packages/core/src";
export const valid = {
  projectKey: "test",
  title: "Checkout broken",
  description: "Cannot order",
  steps: "Click",
  expected: "Success",
  pageUrl: "https://shop.test/path?token=SECRET#private",
  browser: "Chrome",
  viewport: "1200x800",
  events: [],
};
describe("privacy and limits", () => {
  it("strips query, fragment and credentials", () =>
    expect(
      sanitizeUrl("https://me:secret@shop.test/a?email=secret#token"),
    ).toBe("https://shop.test/a"));
  it("rejects unsafe URLs", () =>
    expect(sanitizeUrl("javascript:alert(1)")).toBe("[invalid URL]"));
  it("sanitizes error URLs and caps messages", () => {
    expect(safeMessage("Failed https://shop.test/?token=secret")).not.toContain(
      "secret",
    );
    expect(safeMessage("x".repeat(1000))).toHaveLength(300);
  });
  it("sanitizes actual parsed report", () =>
    expect(payloadSchema.parse(valid).pageUrl).toBe("https://shop.test/path"));
  it("rejects arbitrary sensitive fields", () => {
    for (const key of [
      "inputValue",
      "cookies",
      "authorization",
      "body",
      "console",
    ])
      expect(
        payloadSchema.safeParse({
          ...valid,
          events: [{ type: "click", time: 1, [key]: "secret" }],
        }).success,
      ).toBe(false);
  });
  it("bounds event arrays and strings", () => {
    expect(
      payloadSchema.safeParse({ ...valid, title: "x".repeat(161) }).success,
    ).toBe(false);
    expect(
      payloadSchema.safeParse({
        ...valid,
        events: Array(81).fill({ type: "click", time: 1 }),
      }).success,
    ).toBe(false);
  });
  it("bounds buffer and returns copies", () => {
    const b = new BoundedBuffer(2);
    [1, 2, 3].forEach((time) => b.push({ type: "click", time }));
    expect(b.snapshot().map((e) => e.time)).toEqual([2, 3]);
    const copy = b.snapshot();
    copy[0].time = 999;
    expect(b.snapshot()[0].time).toBe(2);
    b.push({ type: "console", time: 4 });
    expect(b.snapshot()).toHaveLength(2);
  });
  it("excludes own requests", () => {
    expect(internalRequest("/api/ingest", "https://lens.test/api/ingest")).toBe(
      true,
    );
    expect(
      internalRequest(
        "https://shop.test/api/order",
        "https://lens.test/api/ingest",
      ),
    ).toBe(false);
  });
  it("rate limits independently and expires", () => {
    const r = new RateLimiter(2, 100);
    expect(r.allow("a", 0)).toBe(true);
    expect(r.allow("a", 1)).toBe(true);
    expect(r.allow("a", 2)).toBe(false);
    expect(r.allow("b", 2)).toBe(true);
    expect(r.allow("a", 101)).toBe(true);
  });
});
