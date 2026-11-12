import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const dir = fileURLToPath(new URL(".", import.meta.url));
await mkdir(path.join(dir, "public"), { recursive: true });
const wrapper = `import Actual from ${JSON.stringify(path.join(root, "node_modules/ajv/dist/ajv.js"))};
const instances = globalThis.__ajvInstances ??= [];
export default class ObservedAjv extends Actual {
 constructor(options) { super(options); instances.push(this); }
}
export * from ${JSON.stringify(path.join(root, "node_modules/ajv/dist/ajv.js"))};`;
await writeFile(path.join(dir, "observed-ajv.ts"), wrapper);
for (const mode of ["baseline", "patched"]) {
  const api =
    mode === "baseline"
      ? "api/benchmarks/schema-cache/baseline-utilities.ts"
      : "api/src/4-utilities.ts";
  const perms = "wrappers/data-guard/host/src/core/permissions.ts";
  const plugins = [
    {
      name: "source-alias",
      setup(b) {
        b.onResolve({ filter: /^fixture-api$/ }, () => ({
          path: path.join(root, api),
        }));
        b.onResolve({ filter: /^fixture-permissions$/ }, () => ({
          path: path.join(root, perms),
        }));
        b.onResolve({ filter: /^ajv$/ }, () => ({
          path: path.join(dir, "observed-ajv.ts"),
        }));
      },
    },
  ];
  await build({
    entryPoints: [path.join(dir, "kernel.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome120",
    outfile: path.join(dir, "public", `${mode}-kernel.js`),
    sourcemap: true,
    plugins,
  });
}
await build({
  entryPoints: [path.join(dir, "frame.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  outfile: path.join(dir, "public/frame.js"),
  sourcemap: true,
  plugins: [
    {
      name: "source-api",
      setup(b) {
        b.onResolve({ filter: /^@graffiti-garden\/api$/ }, () => ({
          path: path.join(root, "api/src/index.ts"),
        }));
      },
    },
  ],
});
for (const file of ["index.html", "runner.js", "frame.html"])
  await writeFile(
    path.join(dir, "public", file),
    await readFile(path.join(dir, file)),
  );
const hashes = {};
for (const file of ["baseline-kernel.js", "patched-kernel.js", "frame.js"])
  hashes[file] = createHash("sha256")
    .update(await readFile(path.join(dir, "public", file)))
    .digest("hex");
await writeFile(
  path.join(dir, "public", "manifest.json"),
  JSON.stringify(
    {
      version: "api-only-current-site-permissions",
      built: new Date().toISOString(),
      baseline: "e2b7451e22b5ed2c85ba46ac038a8f54379f6bd4",
      hashes,
    },
    null,
    2,
  ),
);
console.log(
  "Built actual-source browser fixture: baseline/patched AJV and real iframe RPC.",
);
