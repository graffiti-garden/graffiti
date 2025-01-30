import typescript from "rollup-plugin-typescript2";
import terser from "@rollup/plugin-terser";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { visualizer } from "rollup-plugin-visualizer";
import nodePolyfills from "rollup-plugin-node-polyfills";

function createConfig(
  inputFile: string,
  format: "es" | "cjs",
  browser: boolean,
) {
  const external: string[] = [];
  // on browser everything is external
  if (!browser) {
    // externalize the api so
    // instanceof checks work for errors
    external.push("@graffiti-garden/api");
    // And these because they can be big
    external.push("ajv");
    external.push("ajv-draft-04");
    external.push("@repeaterjs/repeater");
    external.push("fast-json-patch");
    if (format === "cjs") {
      // don't externalize pouchdb for esm
      // because it may not build properly
      external.push("pouchdb");
    }
  }
  const outputFile =
    inputFile +
    (format === "es" ? (browser ? ".browser.js" : ".js") : ".cjs.js");
  return {
    input: "src/" + inputFile + ".ts",
    output: {
      file: "dist/" + outputFile,
      format,
      sourcemap: true,
    },
    external,
    plugins: [
      typescript({
        tsconfig: "tsconfig.json",
        useTsconfigDeclarationDir: true,
      }),
      json(),
      resolve({
        browser: format === "es",
        preferBuiltins: format === "cjs",
      }),
      commonjs(),
      ...(format === "es" ? [nodePolyfills()] : []),
      terser(),
      visualizer({ filename: `dist-stats/${outputFile}.html` }),
    ],
  };
}

const inputs = [
  "index",
  "database",
  "session-manager",
  "synchronize",
  "utilities",
];

const output: ReturnType<typeof createConfig>[] = [];
for (const inputFile of inputs) {
  for (const format of ["es", "cjs"] as const) {
    output.push(createConfig(inputFile, format, false));
    if (format === "es") {
      output.push(createConfig(inputFile, format, true));
    }
  }
}

export default output;
