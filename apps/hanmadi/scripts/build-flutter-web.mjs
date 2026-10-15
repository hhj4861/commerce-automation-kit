// Build the common client and stage it beside the existing Next APIs. No production activation.
import { spawnSync } from "node:child_process";
import { cp, mkdir, realpath } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const client = resolve(root, "apps/hanmadi-flutter");
const output = process.env.HANMADI_FLUTTER_BUILD_OUTPUT;
if (!output) throw new Error("Set HANMADI_FLUTTER_BUILD_OUTPUT to the task artifact directory (CI: runner.temp).");
const destination = resolve(root, "apps/hanmadi/public/app");
if (resolve(output) === destination || !resolve(output).startsWith('/')) throw new Error("Build outside the source directory, then stage explicitly.");
const flutter = process.env.FLUTTER_BIN || "flutter";
const result = spawnSync(flutter, ["--suppress-analytics", "build", "web", "--base-href", "/app/", "--output", resolve(output)], { cwd: client, stdio: "inherit", env: { ...process.env, CI: "true", FLUTTER_SUPPRESS_ANALYTICS: "true", DART_SUPPRESS_ANALYTICS: "true" } });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
if (process.argv.includes("--stage")) {
  await mkdir(destination, { recursive: true });
  if (await realpath(destination) !== destination) throw new Error("Refusing to stage over a symlink.");
  await cp(resolve(output), destination, { recursive: true });
  console.log("Flutter client staged at /app/. Existing /study remains available.");
} else console.log("Built artifact only. Pass --stage before the Next/Vercel build to serve /app/.");
