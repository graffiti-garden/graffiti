import * as esbuild from "esbuild";

for (const format of ["esm", "cjs"] as const) {
  await esbuild.build({
    entryPoints: ["src/browser/index.ts"],
    platform: "browser",
    bundle: true,
    sourcemap: true,
    minify: true,
    splitting: format === "esm",
    format,
    outdir: `dist/browser/${format}`,
    loader: {
      ".html": "text",
      ".css": "text",
      ".webp": "dataurl",
      ".woff2": "dataurl",
    },
  });

  await esbuild.build({
    entryPoints: ["src/node/index.ts"],
    platform: "node",
    format,
    sourcemap: true,
    minify: true,
    outdir: `dist/node/${format}`,
  });
}
