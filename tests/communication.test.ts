import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hashToken, newToken, validToken } from "../apps/web/lib/access";
import { payloadSchema } from "@buglens/core";
import { PrismaClient } from "@prisma/client";
const safe = /^buglens_test(?:_[a-z0-9]+)?$/.test(
  new URL(
    process.env.DATABASE_URL || "postgresql://localhost/invalid",
  ).pathname.slice(1),
);
describe("tracking capability and contact validation", () => {
  it("uses 256-bit random capabilities and irreversible hashes", () => {
    const first = newToken(),
      second = newToken();
    expect(validToken(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(hashToken(first)).toHaveLength(64);
    expect(hashToken(first)).not.toContain(first);
    expect(validToken("short")).toBe(false);
  });
  it("accepts only explicit, bounded contact fields", () => {
    const base = {
      projectKey: "test",
      title: "Issue",
      description: "Issue",
      steps: "",
      expected: "",
      pageUrl: "https://example.test/?secret=remove",
      browser: "Chrome",
      viewport: "800x600",
      events: [],
    };
    expect(payloadSchema.parse(base)).not.toHaveProperty("reporterEmail");
    expect(
      payloadSchema.parse({
        ...base,
        reporterEmail: "CUSTOMER@EXAMPLE.TEST",
        trackingToken: newToken(),
      }).reporterEmail,
    ).toBe("customer@example.test");
    expect(
      payloadSchema.safeParse({ ...base, reporterEmail: "invalid" }).success,
    ).toBe(false);
    expect(
      payloadSchema.safeParse({ ...base, reporterName: "a".repeat(101) })
        .success,
    ).toBe(false);
    expect(
      payloadSchema.safeParse({ ...base, trackingToken: "weak" }).success,
    ).toBe(false);
  });
});
(safe ? describe : describe.skip)("persisted customer communications", () => {
  const db = new PrismaClient();
  const owner = "communication-owner",
    developer = "communication-developer";
  let projectId: string, reportId: string, token: string;
  beforeAll(async () => {
    for (const id of [owner, developer])
      await db.user.upsert({
        where: { id },
        update: {},
        create: { id, name: id, email: id + "@example.test" },
      });
    const project = await db.project.create({
      data: {
        ownerId: owner,
        name: "Communication tests",
        origins: ["http://127.0.0.1:3000"],
        members: { create: { userId: developer } },
      },
    });
    projectId = project.id;
    token = newToken();
    const { createReport } = await import("../apps/web/lib/reports");
    const report = await createReport(projectId, {
      projectKey: project.key,
      trackingToken: token,
      reporterName: "Customer",
      reporterEmail: "customer@example.test",
      title: "Test report",
      description: "Customer issue",
      steps: "",
      expected: "",
      pageUrl: "https://example.test/",
      browser: "Chrome",
      viewport: "800x600",
      events: [],
    });
    reportId = report.id;
  });
  afterAll(async () => {
    await db.project.deleteMany({ where: { id: projectId } });
    await db.user.deleteMany({ where: { id: { in: [owner, developer] } } });
    await db.$disconnect();
  });
  it("stores hashes and strictly scopes expiring report capabilities", async () => {
    const { trackedReport, publicReport } =
      await import("../apps/web/lib/conversations");
    expect((await trackedReport(reportId, token))?.id).toBe(reportId);
    expect(await trackedReport(reportId, newToken())).toBeNull();
    expect(await trackedReport("another-report", token)).toBeNull();
    const exposed = await publicReport(reportId);
    expect(exposed).not.toHaveProperty("reporterEmail");
    expect(exposed).not.toHaveProperty("events");
    expect(exposed).not.toHaveProperty("notes");
    expect(exposed).not.toHaveProperty("trackingHash");
    await db.report.update({
      where: { id: reportId },
      data: { trackingExpiresAt: new Date(0) },
    });
    expect(await trackedReport(reportId, token)).toBeNull();
    await db.report.update({
      where: { id: reportId },
      data: { trackingExpiresAt: new Date(Date.now() + 86400000) },
    });
  });
  it("notifies owner and developer once and prevents duplicate replies", async () => {
    expect(
      await db.notification.count({ where: { reportId, kind: "NEW_REPORT" } }),
    ).toBe(2);
    const { addMessage } = await import("../apps/web/lib/conversations");
    const input = {
      clientId: crypto.randomUUID(),
      body: "Still fails <script>alert(1)</script>",
    };
    const replies = await Promise.all([
      addMessage(reportId, input, "REPORTER", "Customer"),
      addMessage(reportId, input, "REPORTER", "Customer"),
    ]);
    expect(replies[0].id).toBe(replies[1].id);
    expect(await db.reportMessage.count({ where: { reportId } })).toBe(1);
    expect(
      await db.notification.count({
        where: { reportId, kind: "CUSTOMER_REPLY" },
      }),
    ).toBe(2);
    await expect(
      addMessage(
        reportId,
        { ...input, body: "Different body" },
        "REPORTER",
        "Customer",
      ),
    ).rejects.toThrow("Message id already used");
  });
  it("allows team triage, keeps deletion owner-only, and removes revoked team access", async () => {
    const { ownedReport, updateTriage, deleteReport } =
      await import("../apps/web/lib/reports");
    expect(await ownedReport(reportId, developer)).not.toBeNull();
    expect(
      (await updateTriage(reportId, developer, { status: "RESOLVED" }))?.status,
    ).toBe("RESOLVED");
    expect(await deleteReport(reportId, developer)).toBe(false);
    await db.projectMember.deleteMany({
      where: { projectId, userId: developer },
    });
    expect(await ownedReport(reportId, developer)).toBeNull();
    expect(
      await updateTriage(reportId, developer, { status: "OPEN" }),
    ).toBeNull();
  });
  it("reopens only resolved reports with one history transition", async () => {
    const { reopenReport } = await import("../apps/web/lib/conversations");
    await reopenReport(reportId);
    await reopenReport(reportId);
    expect(
      (await db.report.findUniqueOrThrow({ where: { id: reportId } })).status,
    ).toBe("OPEN");
    expect(
      await db.reportStatusHistory.count({
        where: { reportId, status: "OPEN" },
      }),
    ).toBe(2);
  });
  it("bounds conversation pages and rejects cursors from other reports", async () => {
    const { conversationPage } = await import("../apps/web/lib/conversations");
    await db.reportMessage.createMany({
      data: Array.from({ length: 51 }, (_, i) => ({
        reportId,
        clientId: crypto.randomUUID(),
        authorRole: "REPORTER",
        authorName: "Customer",
        body: "Reply " + i,
      })),
    });
    const first = await conversationPage(reportId, null);
    expect(first.messages).toHaveLength(50);
    expect(first.nextCursor).toBeTruthy();
    const second = await conversationPage(reportId, first.nextCursor);
    expect(second.messages).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    await expect(conversationPage(reportId, "invalid-cursor")).rejects.toThrow(
      "Invalid conversation cursor",
    );
  });
  it("revokes reporter access and cascades conversation/notification cleanup on deletion", async () => {
    const { trackedReport } = await import("../apps/web/lib/conversations");
    await db.report.update({
      where: { id: reportId },
      data: { trackingHash: null },
    });
    expect(await trackedReport(reportId, token)).toBeNull();
    const { deleteReport } = await import("../apps/web/lib/reports");
    expect(await deleteReport(reportId, owner)).toBe(true);
    expect(await db.reportMessage.count({ where: { reportId } })).toBe(0);
    expect(await db.notification.count({ where: { reportId } })).toBe(0);
  });
});
