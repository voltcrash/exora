import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // Vitest v4 compatibility: preserve mock call history.
    // Remove after tests no longer rely on calls from setup or earlier tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    // https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
    clearMocks: false,
  },
  run: {
    tasks: {
      dev: "node --env-file-if-exists=../../.env --use-system-ca --watch src/index.ts",
      start: {
        command: "node --use-system-ca dist/index.mjs",
        cache: {
          env: ["PORT"],
        },
      },
    },
  },
  pack: {
    entry: ["src/index.ts", "src/vercel.ts"],
    deps: {
      // Vercel cannot follow workspace source symlinks from the generated function.
      alwaysBundle: [/^hono(?:\/.*)?$/, "@exora/contracts"],
      onlyBundle: ["hono"],
    },
    format: ["esm"],
    platform: "node",
    sourcemap: true,
  },
});
