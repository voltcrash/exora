import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      dev: "node --env-file-if-exists=../../.env --use-system-ca --watch src/index.ts",
      start: {
        command: "node --use-system-ca dist/index.mjs",
        env: ["DATABASE_URL", "PORT"],
      },
    },
  },
  pack: {
    entry: ["src/index.ts", "src/vercel.ts"],
    deps: {
      alwaysBundle: [/^hono(?:\/.*)?$/, "postgres"],
      onlyBundle: ["hono", "postgres"],
    },
    format: ["esm"],
    platform: "node",
    sourcemap: true,
  },
});
