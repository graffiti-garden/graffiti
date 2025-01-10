import typescript from "rollup-plugin-typescript2";
import terser from "@rollup/plugin-terser";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import commonjs from "@rollup/plugin-commonjs";
import { visualizer } from "rollup-plugin-visualizer";

export default {
  input: "src/index.ts",
  output: {
    file: "dist/index.js",
    format: "esm",
    sourcemap: true,
  },
  plugins: [
    typescript(),
    json(),
    commonjs({}),
    nodeResolve({
      preferBuiltins: true,
    }),
    terser(),
    visualizer({ filename: "dist/stats.html" }),
  ],
};
