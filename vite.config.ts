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
