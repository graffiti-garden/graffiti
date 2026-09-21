/// <reference types="node" />

import * as esbuild from "esbuild";

const defaultHostUrl =
  process.env.DATA_GUARD_HOST_URL ?? "https://guard.graffiti.garden/";
const common = {
  entryPoints: ["src/index.ts"],
  sourcemap: true,
  define: {
    DATA_GUARD_DEFAULT_HOST_URL: JSON.stringify(defaultHostUrl),
  },
} satisfies esbuild.BuildOptions;
const options = [
  {
    ...common,
    platform: "browser",
    bundle: true,
    minify: true,
    splitting: true,
    format: "esm",
    outdir: "dist/browser",
  },
  ...(["esm", "cjs"] as const).map((format) => ({
    ...common,
    platform: "neutral" as const,
    format,
    outdir: `dist/${format}`,
  })),
] satisfies esbuild.BuildOptions[];

if (process.argv.includes("--watch")) {
  const contexts = await Promise.all(options.map((item) => esbuild.context(item)));
  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all(options.map((item) => esbuild.build(item)));
}
