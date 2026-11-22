import * as esbuild from "esbuild";
import { copyFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  platform: "browser",
  target: "es2022",
  bundle: true,
  sourcemap: true,
  minify: true,
  format: "esm",
  outdir: "dist/browser",
});

// MoQ's Opus polyfill loads its worker and WASM relative to the browser bundle.
const libav = dirname(fileURLToPath(import.meta.resolve("@libav.js/variant-opus-af")));
for (const file of await readdir(libav)) {
  if (file.endsWith(".wasm.mjs") || file.endsWith(".wasm.wasm")) {
    await copyFile(join(libav, file), join("dist/browser", file));
  }
}

for (const format of ["esm", "cjs"] as const) {
  await esbuild.build({
    entryPoints: ["src/index.ts"],
    platform: "neutral",
    bundle: true,
    packages: "external",
    target: "es2022",
    sourcemap: true,
    format,
    outdir: `dist/${format}`,
  });
}
await writeFile("dist/cjs/package.json", '{"type":"commonjs"}\n');
