import { defineConfig } from "vite-plus";

/**
 * Third-party bundles served verbatim.
 *
 * Babylon's KTX2 decoder and Basis transcoder are vendored minified, and they have to stay byte
 * for byte what upstream published: formatting them rewrites an artifact this repository did not
 * author and inflates it by half, and linting them reports on code nobody here can fix.
 */
const VENDORED_PATTERNS = ["apps/website/public/ktx2/**"];

export default defineConfig({
  // The root command is the fast, non-browser test entry point across every workspace. Browser
  // journeys need the website's Playwright-backed `browser` project; if the default root glob
  // discovers them, Vitest tries to import `vite-plus/test/browser/context` in its forks pool and
  // fails before collecting a test. Keep those files exclusively behind `website#test:browser`.
  test: {
    include: [
      "apps/*/src/**/*.test.{ts,tsx}",
      "apps/*/tests/**/*.test.{ts,tsx}",
      "packages/*/src/**/*.test.{ts,tsx}",
      "packages/*/tests/**/*.test.{ts,tsx}",
    ],
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
