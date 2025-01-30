import typescript from "rollup-plugin-typescript2";
import terser from "@rollup/plugin-terser";

export default {
  input: "src/index.ts",
  output: {
    file: "../dist/tests/index.js",
    format: "es",
    sourcemap: true,
  },
  external: ["vitest", "@graffiti-garden/api"],
  plugins: [
    typescript({
      tsconfig: "tsconfig.json",
      useTsconfigDeclarationDir: true,
    }),
    terser(),
  ],
};
