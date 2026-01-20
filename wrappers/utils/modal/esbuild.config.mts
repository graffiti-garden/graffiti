import * as esbuild from "esbuild";

for (const format of ["esm", "cjs"] as const) {
  await esbuild.build({
    entryPoints: ["src/index.ts"],
    platform: "browser",
    bundle: true,
    sourcemap: true,
    minify: true,
    splitting: format === "esm",
    format,
    outdir: `dist/${format}`,
    loader: {
      ".css": "text",
      ".webp": "file",
      ".woff2": "file",
    },
  });
}
