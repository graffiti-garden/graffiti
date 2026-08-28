import { defineConfig, type ProxyOptions, type ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";
import basicSsl from "@vitejs/plugin-basic-ssl";

const WRANGLER_PORT = "8787";
const SERVER_PREFIXES = ["/app/", "/s/", "/i/", "/.well-known/"];

export default defineConfig({
  root: "web",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    proxy: {
      ...SERVER_PREFIXES.reduce<Record<string, ProxyOptions>>((acc, prefix) => {
        acc[prefix] = {
          target: `http://localhost:${WRANGLER_PORT}`,
        };
        return acc;
      }, {}),
    },
  },
  plugins: [vue(), basicSsl()],
});
