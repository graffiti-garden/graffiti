import { resolve } from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [vue(), dts()],
  build: {
    sourcemap: true,
    outDir: "dist/node",
    lib: {
      entry: resolve(__dirname, "src/plugin.ts"),
      name: "plugin",
      fileName: "plugin",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: ["vue", "@graffiti-garden/wrapper-synchronize"],
      output: {
        globals: {
          vue: "Vue",
        },
      },
    },
  },
});
