import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// Like the other Node test harnesses, bundle the browser-oriented workspace
// packages so their mixed ESM/CommonJS dependency entry points resolve together.
const [entry, ...args] = process.argv.slice(2);
const directory = await mkdtemp(join(tmpdir(), "graffiti-inbox-audit-"));
try {
  const output = join(directory, "audit.mjs");
  await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], outfile: output,
    platform: "node", format: "esm", target: "node24", bundle: true,
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  });
  const test = args[0] === "--test";
  const child = spawn(process.execPath, test ? ["--test", output] : [output, ...args], { stdio: "inherit" });
  process.exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
