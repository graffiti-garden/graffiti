import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/index.spec.ts"],
    server: {
      deps: {
        external: ["@graffiti-garden/api"],
      },
    },
  },
});
