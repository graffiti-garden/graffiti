import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // PouchDB's Node shims are included in Local's browser build.
  resolve: { alias: {
    "@graffiti-garden/implementation-local": fileURLToPath(new URL("../../implementations/local/dist/browser/index.js", import.meta.url)),
    "@graffiti-garden/streaming": fileURLToPath(new URL("./dist/browser/index.js", import.meta.url)),
  } },
  test: {
    include: ["test/**/*.spec.ts"],
    testTimeout: 30_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } }),
      instances: [{ browser: "chromium" }],
    },
  },
});
