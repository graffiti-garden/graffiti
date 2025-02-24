import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  platform: "browser",
  bundle: true,
  sourcemap: true,
  minify: true,
  splitting: true,
  format: "esm",
  outdir: "dist/browser",
});

for (const format of ["esm", "cjs"] as const) {
  await esbuild.build({
    entryPoints: ["src/index.ts"],
    platform: "neutral",
    sourcemap: true,
    minify: true,
    format,
    outdir: `dist/${format}`,
  });
}
