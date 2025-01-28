import typescript from "rollup-plugin-typescript2";
import terser from "@rollup/plugin-terser";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import copy from "rollup-plugin-copy";
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
      format === "es" &&
        copy({
          targets: [
            { src: "src/browser/index.html", dest: "dist" },
            { src: "src/browser/style.css", dest: "dist" },
            { src: "src/browser/rock-salt.woff2", dest: "dist" },
            { src: "src/browser/graffiti.jpg", dest: "dist" },
          ],
        }),
      json(),
      resolve({
        browser: format === "es",
        preferBuiltins: format === "cjs",
      }),
      commonjs(),
      terser(),
      visualizer({ filename: `dist-stats/${format}.html` }),
    ],
  };
}

export default [
  makeConfig("browser/index.ts", "index.js", "es"),
  makeConfig("node/index.ts", "index.cjs.js", "cjs"),
];
