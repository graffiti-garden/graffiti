import * as esbuild from "esbuild";

for (const format of ["esm", "cjs"] as const) {
  await esbuild.build({
    entryPoints: ["src/index.ts"],
    platform: "neutral",
    bundle: true,
    sourcemap: true,
    minify: true,
    format,
    target: "esnext",
    outfile: `dist/${format === "esm" ? "index.js" : "index.cjs.js"}`,
  });
}

await esbuild.build({
  entryPoints: ["tests/index.ts"],
  platform: "node",
  sourcemap: true,
  bundle: true,
  minify: true,
  external: ["vitest", "@graffiti-garden/api"],
  format: "esm",
  target: "esnext",
  outfile: "dist/tests.js",
});
