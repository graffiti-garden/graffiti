import * as esbuild from "esbuild";
import inlineImportPlugin from "esbuild-plugin-inline-import";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  platform: "browser",
  bundle: true,
  sourcemap: true,
  minify: true,
  format: "esm",
  target: "es2018",
  outdir: "dist",
  plugins: [
    inlineImportPlugin({
      filter: /\?raw$/,
    }),
  ],
});
