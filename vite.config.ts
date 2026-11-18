import { defineConfig } from "vite-plus";

// Written one planet per line by apps/api/scripts/build-planet-catalog.ts.
const GENERATED_PATTERNS = ["packages/planet-catalog/data/**"];

export default defineConfig({
  test: {
    include: [
      "apps/*/src/**/*.test.{ts,tsx}",
      "apps/*/tests/**/*.test.{ts,tsx}",
      "packages/*/src/**/*.test.{ts,tsx}",
      "packages/*/tests/**/*.test.{ts,tsx}",
      "scripts/**/*.test.mjs",
    ],
    // Browser tests require the website's Playwright project.
    exclude: ["apps/*/src/**/*.browser.test.{ts,tsx}"],
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: { ignorePatterns: GENERATED_PATTERNS },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["apps/api/**"],
        env: { node: true },
        rules: { "no-console": "off" },
      },
    ],
  },
  run: {
    cache: true,
  },
});
