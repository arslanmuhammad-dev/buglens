import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
export interface AssetStorage {
  put(bytes: Buffer): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
export class LocalStorage implements AssetStorage {
  constructor(
    private root = process.env.SCREENSHOT_DIR || "../../storage/screenshots",
  ) {}
  private file(key: string) {
    if (!/^[a-f0-9-]+\.png$/.test(key)) throw Error("Invalid asset");
    return path.join(this.root, key);
  }
  async put(bytes: Buffer) {
    await mkdir(this.root, { recursive: true });
    const key = randomUUID() + ".png";
    try {
      await writeFile(this.file(key), bytes, { flag: "wx" });
      return key;
    } catch (error) {
      // A failed filesystem write can leave a partial file behind.
      if ((error as NodeJS.ErrnoException).code !== "EEXIST")
        await unlink(this.file(key)).catch(() => {});
      throw error;
    }
  }
  get(key: string) {
    return readFile(this.file(key));
  }
  async delete(key: string) {
    await unlink(this.file(key)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}

async function decodeImageBytes(value: string) {
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value))
    throw Error("Unsupported screenshot");
  const bytes = Buffer.from(value.split(",")[1], "base64");
  if (bytes.length > 2_000_000) throw Error("Screenshot too large");
  const image = sharp(bytes, { limitInputPixels: 16_000_000 });
  const meta = await image.metadata();
  if (
    !["png", "jpeg"].includes(meta.format || "") ||
    !meta.width ||
    !meta.height
  )
    throw Error("Invalid screenshot");
  const normalized = await image.png().toBuffer();
  if (normalized.length > 4_000_000)
    throw Error("Normalized screenshot too large");
  return normalized;
}

// Vercel functions cannot use their local filesystem as durable storage.
export class PrivateBlobStorage implements AssetStorage {
  private valid(key: string) {
    if (!/^buglens\/[a-f0-9-]+\.png$/.test(key)) throw Error("Invalid asset");
    return key;
  }
  async put(bytes: Buffer) {
    const { put } = await import("@vercel/blob");
    const key = "buglens/" + randomUUID() + ".png";
    const blob = await put(key, bytes, {
      access: "private",
      contentType: "image/png",
      addRandomSuffix: false,
    });
    return this.valid(blob.pathname);
  }
  async get(key: string) {
    const { get } = await import("@vercel/blob");
    const result = await get(this.valid(key), { access: "private" });
    if (!result || result.statusCode !== 200)
      throw Object.assign(Error("Screenshot not found"), { code: "ENOENT" });
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  async delete(key: string) {
    const { del } = await import("@vercel/blob");
    await del(this.valid(key));
  }
}

export function createStorage(): AssetStorage {
  if (process.env.SCREENSHOT_STORAGE === "vercel-blob")
    return new PrivateBlobStorage();
  if (process.env.VERCEL)
    throw Error(
      "Configure SCREENSHOT_STORAGE=vercel-blob for durable private screenshots",
    );
  return new LocalStorage();
}
// Resolve lazily so builds do not require production storage credentials.
export const storage: AssetStorage = {
  put: (bytes) => createStorage().put(bytes),
  get: (key) => createStorage().get(key),
  delete: (key) => createStorage().delete(key),
};

export class InvalidScreenshotError extends Error {}
export async function decodeImage(value: string) {
  try {
    return await decodeImageBytes(value);
  } catch {
    throw new InvalidScreenshotError("Invalid or oversized screenshot");
  }
}
