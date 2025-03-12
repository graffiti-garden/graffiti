import * as esbuild from "esbuild";
import { polyfillNode } from "esbuild-plugin-polyfill-node";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  platform: "browser",
  bundle: true,
  sourcemap: true,
  minify: true,
  splitting: true,
  format: "esm",
  outdir: "dist/browser",
  plugins: [polyfillNode()],
});

for (const format of ["esm", "cjs"] as const) {
  await esbuild.build({
    entryPoints: ["src/index.ts"],
    platform: "neutral",
    sourcemap: true,
    format,
    outdir: `dist/${format}`,
  });
}
