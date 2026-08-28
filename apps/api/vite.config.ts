import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      dev: "node --env-file-if-exists=../../.env --use-system-ca --watch src/index.ts",
      start: {
        command: "node --use-system-ca dist/index.mjs",
        env: ["PORT"],
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
