import typescript from "rollup-plugin-typescript2";
import terser from "@rollup/plugin-terser";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { visualizer } from "rollup-plugin-visualizer";
import nodePolyfills from "rollup-plugin-node-polyfills";

function createConfig(
  outputFile: string,
  formatFormat: "es" | "cjs",
  browser: boolean,
) {
  return {
    input: "src/index.ts",
    output: {
      file: "dist/" + outputFile,
      format: formatFormat,
      sourcemap: true,
    },
    // When using the browser, everything is external.
    // Otherwise, all modules are external.
    ...(browser
      ? {}
      : { external: (id: string) => id.includes("node_modules") }),
    plugins: [
      typescript({
        tsconfig: "tsconfig.json",
        useTsconfigDeclarationDir: true,
      }),
      json(),
      resolve({
        browser,
        preferBuiltins: !browser,
      }),
      commonjs(),
      ...(browser ? [nodePolyfills()] : []),
      terser(),
      visualizer({ filename: `dist-stats/${outputFile}.html` }),
    ],
  };
}

export default [
  createConfig("index.js", "es", false),
  createConfig("index.browser.js", "es", true),
  createConfig("index.cjs.js", "cjs", false),
];
