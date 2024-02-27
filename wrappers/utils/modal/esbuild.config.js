import * as esbuild from "esbuild";
import { polyfillNode } from "esbuild-plugin-polyfill-node";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  platform: "browser",
  bundle: true,
  sourcemap: true,
  minify: true,
  format: "esm",
  target: "es2018",
  outdir: "dist",
  plugins: [polyfillNode()],
});
