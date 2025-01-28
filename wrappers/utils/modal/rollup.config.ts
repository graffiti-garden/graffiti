import typescript from "rollup-plugin-typescript2";
import terser from "@rollup/plugin-terser";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { importAsString } from "rollup-plugin-string-import";
import { visualizer } from "rollup-plugin-visualizer";

function makeConfig(input: string, output: string, format: "es" | "cjs") {
  return {
    input: "src/" + input,
    output: {
      file: "dist/" + output,
      format,
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
        browser: format === "es",
        preferBuiltins: format === "cjs",
      }),
      commonjs(),
      terser(),
      visualizer({ filename: `dist/index.stats.html` }),
    ],
  };
}

export default [
  makeConfig("browser/index.ts", "index.js", "es"),
  makeConfig("node/index.ts", "index.cjs.js", "cjs"),
];
