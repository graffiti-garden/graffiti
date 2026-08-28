import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    setupFiles: ["fake-indexeddb/auto"],
    server: {
      deps: {
        inline: [
          "@graffiti-garden/api",
          "@graffiti-garden/implementation-local",
        ],
      },
    },
  },
});
