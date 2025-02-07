import { resolve } from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [vue(), dts()],
  build: {
    sourcemap: true,
    minify: true,
    lib: {
      entry: resolve(__dirname, "src/plugin.ts"),
      name: "plugin",
      fileName: "plugin",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: ["vue"],
      output: {
        globals: {
          vue: "Vue",
        },
      },
      plugins: [visualizer({ filename: "dist/stats.html" })],
    },
  },
});
