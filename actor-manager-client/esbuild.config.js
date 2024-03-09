import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["index.ts"],
  platform: "browser",
  bundle: true,
  sourcemap: true,
  minify: true,
  format: "esm",
  target: "es2018",
  outdir: "dist",
});
