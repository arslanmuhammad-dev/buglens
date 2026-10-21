import { spawnSync } from "node:child_process";
if (process.env.VERCEL) {
  for (const key of [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BLOB_READ_WRITE_TOKEN",
  ])
    if (!process.env[key]) throw Error(`Missing deployment variable: ${key}`);
  if (process.env.SCREENSHOT_STORAGE !== "vercel-blob")
    throw Error("Vercel requires private Blob screenshot storage");
}
function run(script, extra = {}) {
  const result = spawnSync("npm", ["run", script], {
    env: { ...process.env, ...extra },
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("db:generate");
run("db:migrate", {
  DATABASE_URL:
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL,
});
run("build");
