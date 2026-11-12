import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/index.spec.ts",
      "src/2-primitives/3-channel-attestations-cache.spec.ts",
    ],
    server: {
      deps: {
        external: ["@graffiti-garden/api"],
      },
    },
  },
});
