import { rmSync } from "fs";
import * as esbuild from "esbuild";

// Clean dist folder
rmSync("dist", { recursive: true, force: true });

await esbuild.build({
  entryPoints: ["src/browser/index.ts"],
  platform: "browser",
  bundle: true,
  sourcemap: true,
  minify: true,
  splitting: true,
  format: "esm",
  target: "esnext",
  outdir: "dist/browser",
  loader: {
    ".html": "text",
    ".css": "text",
    ".jpg": "dataurl",
    ".woff2": "dataurl",
  },
});

await esbuild.build({
  entryPoints: ["src/node/index.ts"],
  platform: "node",
  sourcemap: true,
  minify: true,
  format: "cjs",
  target: "esnext",
  outdir: "dist/node",
});
