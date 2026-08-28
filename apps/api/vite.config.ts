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
      // Vercel traces the generated entry point, not the original monorepo. If a workspace
      // dependency remains external, the function contains a symlink to source that is absent
      // from /var/task and every API route fails during module loading.
      alwaysBundle: [/^hono(?:\/.*)?$/, "@exora/contracts"],
      onlyBundle: ["hono"],
    },
    format: ["esm"],
    platform: "node",
    sourcemap: true,
  },
});
