import * as esbuild from "esbuild";
import { writeFile } from "node:fs/promises";

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

for (const format of ["esm", "cjs"] as const) {
  await esbuild.build({
    entryPoints: ["src/index.ts", "src/signaling.ts"],
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
