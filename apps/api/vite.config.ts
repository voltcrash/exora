import { defineConfig, type Plugin } from "vite-plus";

// Rolldown inlines JSON as a pretty-printed object literal; a compact JSON.parse string is
// a third smaller and parses faster when the function starts.
const compactPlanetCatalog = (): Plugin => ({
  name: "exora:compact-planet-catalog",
  transform: {
    filter: { id: /planet-catalog[\\/]data[\\/][^\\/]+\.json$/ },
    handler: (code) => ({
      code: `export default JSON.parse(${JSON.stringify(JSON.stringify(JSON.parse(code)))});`,
      moduleType: "js",
    }),
  },
});

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
    plugins: [compactPlanetCatalog()],
    sourcemap: true,
  },
});
