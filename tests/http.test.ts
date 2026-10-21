import { describe, it, expect } from "vitest";
import { readJson } from "../apps/web/lib/http";
import {
  projectSchema,
  triageSchema,
  payloadSchema,
} from "../packages/core/src";
describe("request validation regressions", () => {
  it("malformed JSON gets a controlled client error", async () => {
    await expect(
      readJson(
        new Request("http://test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        }),
        100,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("rejects oversized streamed bodies without content-length", async () => {
    const request = new Request("http://test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '"' + "x".repeat(101) + '"',
    });
    await expect(readJson(request, 100)).rejects.toMatchObject({ status: 413 });
  });
  it("rejects unsupported content types", async () => {
    await expect(
      readJson(new Request("http://test", { method: "POST", body: "{}" }), 100),
    ).rejects.toMatchObject({ status: 415 });
  });
  it("rejects opaque, wildcard, credentialled and path origins", () => {
    for (const origin of [
      "null",
      "file://",
      "ftp://host.test",
      "https://*.test",
      "https://me:secret@shop.test",
      "https://shop.test/path",
    ])
      expect(
        projectSchema.safeParse({ name: "Store", origins: [origin] }).success,
      ).toBe(false);
    expect(
      projectSchema.safeParse({ name: "Store", origins: ["https://shop.test"] })
        .success,
    ).toBe(true);
  });
  it("rejects no-op and unexpected triage properties", () => {
    expect(triageSchema.safeParse({}).success).toBe(false);
    expect(
      triageSchema.safeParse({ status: "RESOLVED", ownerId: "other" }).success,
    ).toBe(false);
  });
  it("accepts only UUID idempotency keys", () => {
    const base = {
      projectKey: "p",
      title: "t",
      description: "d",
      steps: "",
      expected: "",
      pageUrl: "http://test/",
      browser: "Chrome",
      viewport: "800x600",
      events: [],
    };
    expect(
      payloadSchema.safeParse({ ...base, submissionId: "arbitrary" }).success,
    ).toBe(false);
  });
});
