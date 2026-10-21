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
export const storage = new LocalStorage();
export async function decodeImage(value: string) {
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
