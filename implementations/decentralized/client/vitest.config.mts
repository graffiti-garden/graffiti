import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/index.spec.ts", "src/3-protocol/outbox.spec.ts"],
    server: {
      deps: {
        external: ["@graffiti-garden/api"],
      },
    },
  },
});
