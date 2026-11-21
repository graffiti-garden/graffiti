import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Local's browser bundle includes the Node shims required by PouchDB.
  resolve: { alias: {
    "@graffiti-garden/implementation-local": fileURLToPath(new URL("../local/dist/browser/index.js", import.meta.url)),
  } },
  test: {
    include: ["test/**/*.spec.ts"],
    testTimeout: 45_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
