import typescript from "rollup-plugin-typescript2";
import terser from "@rollup/plugin-terser";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { visualizer } from "rollup-plugin-visualizer";
import nodePolyfills from "rollup-plugin-node-polyfills";

export default {
  input: "src/index.ts",
  output: {
    file: "dist/index.js",
    format: "esm",
    sourcemap: true,
  },
  plugins: [
    typescript({
      tsconfig: "tsconfig.json",
    }),
    json(),
    resolve({
      browser: true,
    }),
    commonjs(),
    nodePolyfills(),
    terser(),
    visualizer({ filename: "dist/stats.html" }),
  ],
};
