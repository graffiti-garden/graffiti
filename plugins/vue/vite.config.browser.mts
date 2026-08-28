import { resolve } from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    sourcemap: true,
    minify: true,
    outDir: "dist/browser",
    lib: {
      entry: resolve(__dirname, "src/plugin.ts"),
      name: "plugin",
      fileName: "plugin",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["vue"],
      output: {
        globals: {
          vue: "Vue",
        },
      },
    },
  },
});
