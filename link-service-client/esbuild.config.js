import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/link-service.ts"],
  platform: "browser",
  bundle: true,
  sourcemap: true,
  minify: true,
  format: "esm",
  target: "es2018",
  outdir: "dist",
});
