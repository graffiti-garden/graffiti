import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    restoreMocks: true,
    testTimeout: 10_000,
  },
});
