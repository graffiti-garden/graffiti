import * as esbuild from "esbuild";
import { polyfillNode } from "esbuild-plugin-polyfill-node";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  platform: "browser",
  bundle: true,
  sourcemap: true,
  minify: true,
  format: "esm",
  target: "esnext",
  outfile: "dist/index.browser.js",
  plugins: [polyfillNode()],
});

for (const format of ["esm", "cjs"] as const) {
  await esbuild.build({
    entryPoints: ["src/*"],
    platform: "neutral",
    sourcemap: true,
    minify: true,
    format,
    target: "esnext",
    outdir: `dist/${format}`,
  });
}
