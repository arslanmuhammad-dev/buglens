import { it, expect, vi, afterEach } from "vitest";
import { PrivateBlobStorage, createStorage } from "../apps/web/lib/storage";
import { put, get, del } from "@vercel/blob";
vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
it("uses private Blob storage and stores only an opaque pathname", async () => {
  const store = new PrivateBlobStorage();
  vi.mocked(put).mockImplementation(
    async (path) =>
      ({
        pathname: path,
        url: "https://private-store.test/" + path,
      }) as Awaited<ReturnType<typeof put>>,
  );
  const key = await store.put(Buffer.from("pixels"));
  expect(key).toMatch(/^buglens\/[a-f0-9-]+\.png$/);
  expect(put).toHaveBeenCalledWith(
    key,
    expect.any(Buffer),
    expect.objectContaining({ access: "private", addRandomSuffix: false }),
  );
  vi.mocked(get).mockResolvedValue({
    statusCode: 200,
    stream: new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([1, 2]));
        c.close();
      },
    }),
  } as Awaited<ReturnType<typeof get>>);
  expect(await store.get(key)).toEqual(Buffer.from([1, 2]));
  expect(get).toHaveBeenCalledWith(key, { access: "private" });
  await store.delete(key);
  expect(del).toHaveBeenCalledWith(key);
});
it("denies arbitrary URLs and traversal before contacting Blob", async () => {
  const store = new PrivateBlobStorage();
  await expect(store.get("https://evil.test/file")).rejects.toThrow(
    "Invalid asset",
  );
  await expect(store.delete("../private")).rejects.toThrow("Invalid asset");
  expect(get).not.toHaveBeenCalled();
  expect(del).not.toHaveBeenCalled();
});
it("fails closed if Vercel deployment uses local files", () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("SCREENSHOT_STORAGE", "local");
  expect(() => createStorage()).toThrow("durable private screenshots");
  vi.stubEnv("SCREENSHOT_STORAGE", "vercel-blob");
  expect(createStorage()).toBeInstanceOf(PrivateBlobStorage);
});
