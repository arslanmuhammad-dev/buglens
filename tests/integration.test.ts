import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { LocalStorage, decodeImage } from "../apps/web/lib/storage";
const url = process.env.DATABASE_URL || "";
const databaseSuite = /^buglens_test(?:_[a-z0-9]+)?$/.test(
  new URL(url || "postgresql://localhost/invalid").pathname.slice(1),
)
  ? describe
  : describe.skip;
describe("screenshot validation and storage", () => {
  it("rejects unsupported, malformed and oversized screenshots", async () => {
    await expect(
      decodeImage("data:image/svg+xml;base64,AAAA"),
    ).rejects.toThrow();
    await expect(decodeImage("data:image/png;base64,AAAA")).rejects.toThrow();
    await expect(
      decodeImage(
        "data:image/png;base64," + Buffer.alloc(2_000_001).toString("base64"),
      ),
    ).rejects.toThrow();
  });
  it("decodes supported pixels and deletes files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "buglens-assets-"));
    try {
      const store = new LocalStorage(root);
      const original = await sharp({
        create: { width: 10, height: 10, channels: 3, background: "#000" },
      })
        .png()
        .toBuffer();
      const pixels = await decodeImage(
        "data:image/png;base64," + original.toString("base64"),
      );
      const key = await store.put(pixels);
      expect(await store.get(key)).toEqual(pixels);
      expect(() => store.get("../secret")).toThrow();
      await store.delete(key);
      expect(await readdir(root)).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
databaseSuite("real database ownership and history", () => {
  let db: typeof import("../apps/web/lib/db").db;
  let services: typeof import("../apps/web/lib/reports");
  let id: string;
  beforeAll(async () => {
    db = (await import("../apps/web/lib/db")).db;
    services = await import("../apps/web/lib/reports");
    await db.user.upsert({
      where: { id: "integration-owner" },
      update: {},
      create: {
        id: "integration-owner",
        name: "Test",
        email: "integration@example.test",
      },
    });
    const project = await db.project.create({
      data: {
        name: "Integration",
        ownerId: "integration-owner",
        origins: ["http://127.0.0.1:3000"],
      },
    });
    const report = await db.report.create({
      data: {
        projectId: project.id,
        title: "Test",
        description: "Test",
        steps: "",
        expected: "",
        pageUrl: "http://test/",
        browser: "Chrome",
        viewport: "800x600",
        history: { create: { status: "OPEN" } },
      },
    });
    id = report.id;
  });
  afterAll(async () => {
    await db?.project.deleteMany({ where: { ownerId: "integration-owner" } });
    await db?.user.deleteMany({ where: { id: "integration-owner" } });
    await db?.$disconnect();
  });
  it("denies another owner reads, updates, deletes", async () => {
    expect(await services.ownedReport(id, "other")).toBeNull();
    expect(await services.setStatus(id, "other", "RESOLVED")).toBeNull();
    expect(await services.deleteReport(id, "other")).toBe(false);
  });
  it("updates status and history together without duplicate transitions", async () => {
    await services.setStatus(id, "integration-owner", "RESOLVED");
    await services.setStatus(id, "integration-owner", "RESOLVED");
    const report = await db.report.findUniqueOrThrow({
      where: { id },
      include: { history: true },
    });
    expect(report.status).toBe("RESOLVED");
    expect(report.history.map((h) => h.status)).toEqual(["OPEN", "RESOLVED"]);
  });
  it("retains report when asset cleanup fails", async () => {
    await db.screenshot.create({
      data: { reportId: id, filename: "a.png", bytes: 4, mime: "image/png" },
    });
    const { storage } = await import("../apps/web/lib/storage");
    const spy = vi
      .spyOn(storage, "delete")
      .mockRejectedValueOnce(Error("Disk failure"));
    await expect(
      services.deleteReport(id, "integration-owner"),
    ).rejects.toThrow("Disk failure");
    expect(await services.ownedReport(id, "integration-owner")).not.toBeNull();
    spy.mockRestore();
    await db.screenshot.delete({ where: { reportId: id } });
  });
  it("removes newly uploaded files if report creation fails", async () => {
    const { storage } = await import("../apps/web/lib/storage");
    const put = vi
      .spyOn(storage, "put")
      .mockResolvedValueOnce("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png");
    const remove = vi.spyOn(storage, "delete").mockResolvedValueOnce();
    const create = vi
      .spyOn(db.report, "create")
      .mockRejectedValueOnce(Error("Controlled database failure"));
    const image = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#000" },
    })
      .png()
      .toBuffer();
    const report = await db.report.findUniqueOrThrow({ where: { id } });
    await expect(
      services.createReport(report.projectId, {
        projectKey: "test",
        title: "Fail",
        description: "Fail",
        steps: "",
        expected: "",
        pageUrl: "http://test/",
        browser: "Chrome",
        viewport: "800x600",
        events: [],
        screenshot: "data:image/png;base64," + image.toString("base64"),
      }),
    ).rejects.toThrow("Controlled database failure");
    expect(put).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png",
    );
    create.mockRestore();
    put.mockRestore();
    remove.mockRestore();
  });
});
