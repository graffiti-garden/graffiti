import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [
    wasm(),
    vue(),
    nodePolyfills({
      include: ["events"],
    }),
  ],
});
