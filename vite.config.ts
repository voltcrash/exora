import { defineConfig } from "vite-plus";

// Preserve vendored KTX2 artifacts byte-for-byte.
const VENDORED_PATTERNS = ["apps/website/public/ktx2/**"];

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
  fmt: { ignorePatterns: VENDORED_PATTERNS },
  lint: {
    ignorePatterns: VENDORED_PATTERNS,
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
