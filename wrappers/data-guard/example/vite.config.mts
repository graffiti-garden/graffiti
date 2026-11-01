import basicSsl from "@vitejs/plugin-basic-ssl";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), basicSsl()],
  build: {
    rollupOptions: {
      input: ["index.html", "flow-lab.html", "flow-lab-child.html"].map((page) =>
        fileURLToPath(new URL(page, import.meta.url))
      ),
    },
  },
});
