import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/performance/*.spec.mjs"],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
