import * as esbuild from "esbuild";

for (const format of ["esm", "cjs"] as const) {
  await esbuild.build({
    entryPoints: ["src/index.ts"],
    platform: "neutral",
    bundle: true,
    sourcemap: true,
    minify: true,
    format,
    outfile: `dist/${format === "esm" ? "index.mjs" : "index.cjs"}`,
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
