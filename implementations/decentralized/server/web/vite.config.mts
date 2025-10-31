import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  root: "web",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    // During dev, proxy API to Wrangler (default 8787)
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
