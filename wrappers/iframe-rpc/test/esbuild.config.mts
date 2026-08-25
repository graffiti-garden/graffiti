import * as esbuild from "esbuild";
import { polyfillNode } from "esbuild-plugin-polyfill-node";

await esbuild.build({
  entryPoints: ["test/host.ts"],
  platform: "browser",
  bundle: true,
  format: "esm",
  outfile: "test/public/host.js",
  plugins: [polyfillNode()],
});
