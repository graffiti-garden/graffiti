import typescript from "rollup-plugin-typescript2";
import terser from "@rollup/plugin-terser";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { importAsString } from "rollup-plugin-string-import";
import { visualizer } from "rollup-plugin-visualizer";

export default {
  input: "src/browser/index.ts",
  output: {
    file: "dist/index.js",
    format: "es",
    sourcemap: true,
  },
  plugins: [
    typescript({
      tsconfig: "tsconfig.json",
      useTsconfigDeclarationDir: true,
    }),
    importAsString({
      include: ["**/*.css", "**/*.html"],
    }),
    json(),
    resolve({
      browser: true,
      preferBuiltins: false,
    }),
    commonjs(),
    terser(),
    visualizer({ filename: `dist/index.stats.html` }),
  ],
};
