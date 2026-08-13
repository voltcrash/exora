import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      dev: "node --use-system-ca --watch src/index.ts",
      start: {
        command: "node --use-system-ca dist/index.mjs",
        env: ["PORT"],
      },
    },
  },
  pack: {
    entry: ["src/index.ts"],
    format: ["esm"],
    platform: "node",
    sourcemap: true,
  },
});
