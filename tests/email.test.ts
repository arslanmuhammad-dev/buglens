import nodemailer from "nodemailer";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  seal,
  unseal,
  mailEnabled,
  sendMail,
  enqueueMail,
  drainMailQueue,
} from "../apps/web/lib/mail";
import { db } from "../apps/web/lib/db";
const safe = /^buglens_test(?:_[a-z0-9]+)?$/.test(
  new URL(
    process.env.DATABASE_URL || "postgresql://localhost/invalid",
  ).pathname.slice(1),
);
describe("email privacy and transport configuration", () => {
  it("uses authenticated Gmail TLS and a fixed verified sender", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "gmail");
    vi.stubEnv("GMAIL_USER", "sender@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "test-app-password");
    const send = vi
      .fn()
      .mockResolvedValue({
        accepted: ["customer@example.test"],
        messageId: "gmail-id",
      });
    const transport = vi
      .spyOn(nodemailer, "createTransport")
      .mockReturnValue({ sendMail: send } as unknown as ReturnType<
        typeof nodemailer.createTransport
      >);
    try {
      expect(mailEnabled()).toBe(true);
      await sendMail(
        { to: "customer@example.test", subject: "Update", text: "Safe body" },
        "mail-id",
      );
      expect(transport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
        }),
      );
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: { name: "BugLens", address: "sender@gmail.com" },
        }),
      );
    } finally {
      transport.mockRestore();
      vi.unstubAllEnvs();
    }
  });
  it("authenticates encryption and never stores a raw recovery capability", () => {
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "test-only-secret-at-least-thirty-two-characters",
    );
    const value = {
      secret: "recovery-capability",
      email: "private@example.test",
    };
    const ciphertext = seal(value);
    expect(ciphertext).not.toContain(value.secret);
    expect(ciphertext).not.toContain(value.email);
    expect(unseal(ciphertext)).toEqual(value);
    const parts = ciphertext.split(".");
    parts[3] = "A" + parts[3].slice(1);
    if (parts.join(".") === ciphertext) parts[3] = "B" + parts[3].slice(1);
    expect(() => unseal(parts.join("."))).toThrow();
    vi.unstubAllEnvs();
  });
  it("cannot enable the local mailbox on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("EMAIL_PROVIDER", "mailpit");
    expect(mailEnabled()).toBe(false);
    await expect(
      sendMail({ to: "a@example.test", subject: "Test", text: "Test" }, "test"),
    ).rejects.toThrow("MAIL_NOT_CONFIGURED");
    vi.unstubAllEnvs();
  });
});
(safe ? describe : describe.skip)("durable email outbox", () => {
  const prefix = "email-test:" + crypto.randomUUID();
  beforeAll(() => {
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "test-only-secret-at-least-thirty-two-characters",
    );
    vi.stubEnv("EMAIL_PROVIDER", "mailpit");
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await db.emailJob.deleteMany({
      where: { dedupeKey: { startsWith: prefix } },
    });
  });
  it("enqueues retries once, leases concurrent workers, and clears delivered secrets", async () => {
    const input = {
      kind: "TEST",
      dedupeKey: prefix + ":once",
      expiresAt: new Date(Date.now() + 60000),
      mail: {
        to: "outbox@example.test",
        subject: "Outbox test",
        text: "Private capability",
      },
    };
    const [a, b] = await Promise.all([enqueueMail(input), enqueueMail(input)]);
    expect(a.id).toBe(b.id);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ID: "provider-id" }), { status: 200 }),
      );
    try {
      await Promise.all([drainMailQueue(), drainMailQueue()]);
      expect(fetch).toHaveBeenCalledOnce();
      const row = await db.emailJob.findUniqueOrThrow({ where: { id: a.id } });
      expect(row.state).toBe("SENT");
      expect(row.content).toBeNull();
      expect(row.attempts).toBe(1);
    } finally {
      fetch.mockRestore();
    }
  });
  it("retains failed jobs for bounded retry and expires sensitive contents", async () => {
    const job = await enqueueMail({
      kind: "TEST",
      dedupeKey: prefix + ":failure",
      expiresAt: new Date(Date.now() + 60000),
      mail: { to: "retry@example.test", subject: "Retry", text: "Secret" },
    });
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(
        Error("sensitive transport details must not be logged"),
      );
    try {
      await drainMailQueue();
      const row = await db.emailJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(row.state).toBe("PENDING");
      expect(row.lastError).toBe("DELIVERY_FAILED");
      expect(row.nextAt.getTime()).toBeGreaterThan(Date.now());
      await db.emailJob.update({
        where: { id: job.id },
        data: { expiresAt: new Date(0) },
      });
      await drainMailQueue();
      const expired = await db.emailJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(expired.state).toBe("CANCELLED");
      expect(expired.content).toBeNull();
    } finally {
      fetch.mockRestore();
    }
  });
});
