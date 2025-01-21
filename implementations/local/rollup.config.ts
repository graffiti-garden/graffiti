import typescript from "rollup-plugin-typescript2";
import terser from "@rollup/plugin-terser";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { visualizer } from "rollup-plugin-visualizer";
import nodePolyfills from "rollup-plugin-node-polyfills";

function createConfig(
  output: {
    file: string;
    format: string;
  },
  browser: boolean,
) {
  return {
    input: "src/index.ts",
    output: { ...output, sourcemap: true },
    plugins: [
      typescript({
        tsconfig: "tsconfig.json",
      }),
      json(),
      resolve({
        browser: browser,
        preferBuiltins: !browser,
      }),
      commonjs(),
      browser ? nodePolyfills() : undefined,
      terser(),
      visualizer({ filename: `dist/${output.format}-stats.html` }),
    ],
  };
}

export default [
  createConfig({ file: "dist/index.js", format: "esm" }, true),
  createConfig({ file: "dist/index.cjs", format: "cjs" }, false),
];
