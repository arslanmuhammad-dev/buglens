import { rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
const url = process.env.DATABASE_URL || "";
const parsed = new URL(url);
if (!/^buglens_test(?:_[a-z0-9]+)?$/.test(parsed.pathname.slice(1)))
  throw Error(
    "Refusing reset: database name must be buglens_test or buglens_test_SUFFIX",
  );
if (
  process.env.SCREENSHOT_DIR &&
  !process.env.SCREENSHOT_DIR.includes("buglens-test")
)
  throw Error("Use a dedicated buglens-test screenshot directory");
if (process.env.SCREENSHOT_DIR) {
  const directory = path.resolve(process.env.SCREENSHOT_DIR);
  const allowedParents = [path.resolve(tmpdir()), "/tmp", "/private/tmp"];
  if (
    !allowedParents.includes(path.dirname(directory)) ||
    !/^buglens-test[-a-zA-Z0-9]*$/.test(path.basename(directory))
  )
    throw Error(
      "Screenshot reset requires a direct temporary buglens-test directory",
    );
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
}
const result = spawnSync(
  "npx",
  ["prisma", "migrate", "reset", "--force", "--skip-seed"],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
