import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  platform: "browser",
  bundle: true,
  sourcemap: true,
  splitting: true,
  minify: true,
  format: "esm",
  outdir: "dist/browser",
});

for (const format of ["esm", "cjs"] as const) {
  await esbuild.build({
    entryPoints: ["src/*"],
    platform: "neutral",
    sourcemap: true,
    format,
    outdir: `dist/${format}`,
  });
}

await esbuild.build({
  entryPoints: ["tests/index.ts"],
  platform: "node",
  sourcemap: true,
  bundle: true,
  external: ["vitest", "@graffiti-garden/api"],
  format: "esm",
  outfile: "dist/tests.mjs",
});
