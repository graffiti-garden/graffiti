import * as esbuild from "esbuild";

const entryPoints = {
  index: "index.ts",
  "client/index": "client/index.ts",
  "client/session-relay": "client/session-relay.ts",
  "host/index": "host/index.ts",
};

await esbuild.build({
  entryPoints,
  platform: "browser",
  bundle: true,
  splitting: true,
  minify: true,
  format: "esm",
  outdir: "dist/browser",
  sourcemap: true,
});

for (const format of ["esm", "cjs"] as const) {
  await esbuild.build({
    entryPoints,
    platform: "neutral",
    sourcemap: true,
    format,
    outdir: `dist/${format}`,
  });
}
