import { build } from "esbuild";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const dir = fileURLToPath(new URL(".", import.meta.url)),
  out = path.join(dir, "public");
await mkdir(out, { recursive: true });
const noble = fileURLToPath(import.meta.resolve("@noble/ed25519"));
const observed = path.join(dir, "observed-noble.ts");
await writeFile(
  observed,
  `export * from ${JSON.stringify(noble)};import {verifyAsync as verify} from ${JSON.stringify(noble)};export function verifyAsync(...args){globalThis.__verificationCalls=(globalThis.__verificationCalls??0)+1;return verify(...args);}`,
);
const plugin = {
  name: "count-actual-verifications",
  setup(b) {
    b.onResolve({ filter: /^@noble\/ed25519$/ }, () => ({ path: observed }));
  },
};
for (const platform of ["browser", "node"])
  await build({
    entryPoints: [path.join(dir, "benchmark.ts")],
    bundle: true,
    format: "esm",
    platform,
    plugins: [plugin],
    outfile: path.join(
      out,
      platform === "browser" ? "benchmark.js" : "benchmark-node.mjs",
    ),
  });
for (const file of ["index.html", "frame.html"])
  await copyFile(path.join(dir, file), path.join(out, file));
const source = path.join(
  dir,
  "../../client/src/2-primitives/3-channel-attestations.ts",
);
await writeFile(
  path.join(out, "manifest.json"),
  JSON.stringify(
    {
      baseline: "e2b7451e2",
      sourceSha256: createHash("sha256")
        .update(await readFile(source))
        .digest("hex"),
      built: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log("Built synthetic channel-attestation benchmark");
