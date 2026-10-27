import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      "planet-catalog": {
        command: "vpx scripts/build-planet-catalog.ts",
        cache: false,
      },
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
      alwaysBundle: [/^hono(?:\/.*)?$/, "@exora/contracts", /^@exora\/planet-catalog(?:\/.*)?$/],
      onlyBundle: ["hono"],
    },
    format: ["esm"],
    platform: "node",
    sourcemap: true,
  },
});
