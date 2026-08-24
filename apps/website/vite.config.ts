import { defineConfig, type Plugin } from "vite-plus";
import react from "@vitejs/plugin-react";
import { playwright } from "vite-plus/test/browser-playwright";
import { NOTABLE_PLANET_NAMES, NOTABLE_STAR_NAMES } from "./src/search-discovery.ts";
import { FEATURED_ASTEROID_NAMES } from "./src/solar-asteroids.ts";
import { FEATURED_COMET_NAMES } from "./src/solar-comets.ts";
import { FEATURED_REGION_NAMES } from "./src/solar-regions.ts";
import { FEATURED_MISSION_NAMES } from "./src/solar-missions.ts";
import { FEATURED_BLACK_HOLE_NAMES } from "./src/black-holes.ts";

/**
 * Drops Babylon's WGSL shader sources from the bundle.
 *
 * Babylon ships every shader twice — GLSL under `Shaders/` for WebGL and WGSL under
 * `ShadersWGSL/` for WebGPU — and picks between them at runtime with
 * `if (engine.isWebGPU) await import("../ShadersWGSL/…") else await import("../Shaders/…")`.
 * Rolldown cannot know which branch runs, so it emits chunks for both.
 *
 * Exora only ever constructs `Engine`, which is WebGL2; `WebGPUEngine` appears nowhere in the
 * source. `isWebGPU` is therefore always false and the WGSL branch is unreachable, so resolving
 * those modules to nothing costs a dead import and saves shipping the shaders behind it.
 *
 * Scoped to Babylon's own imports so an unrelated package with a similarly named directory is
 * never emptied out from under itself.
 */
const dropWebGpuShaders = (): Plugin => {
  const stub = "\0exora:webgpu-shader-stub";

  return {
    name: "exora:drop-webgpu-shaders",
    enforce: "pre",
    resolveId(source, importer) {
      if (!source.includes("ShadersWGSL/")) return null;
      if (!importer?.includes("@babylonjs")) return null;
      return stub;
    },
    load(id) {
      // Babylon only awaits these for their side effect of registering into the shader store,
      // so an empty module satisfies the import shape.
      return id === stub ? "export {};" : null;
    },
  };
};

/**
 * Names the chunks that carry the bulk of the bundle.
 *
 * Left alone, Rolldown names a shared chunk after whichever member it happened to visit first, so
 * three quarters of a megabyte of Babylon shipped as `xr-console-model-*.js` — a file named after
 * a 368-line module that is a rounding error inside it. That makes the output impossible to read
 * and gives the vendor code an app-shaped cache key: editing one component rehashed all of it.
 *
 * Shader modules are deliberately excluded. Babylon imports those dynamically and on demand, and
 * folding them into the eager vendor chunk would trade a legible bundle for a slower first frame.
 */
const chunkFileName = ({ moduleIds }: { moduleIds: readonly string[] }): string => {
  const babylonRuntimeModules = moduleIds.filter(
    (moduleId) =>
      /[\\/]@babylonjs[\\/]/.test(moduleId) && !/[\\/]Shaders[^\\/]*[\\/]/.test(moduleId),
  );
  return babylonRuntimeModules.length >= 120
    ? "assets/babylon-vendor-[hash].js"
    : "assets/[name]-[hash].js";
};

const SITE_ORIGIN = "https://exora.voltcrash.com";

/**
 * Builds `sitemap.xml` from the curated landmark lists.
 *
 * A destination is a query parameter on one page, so left to itself a crawler sees exactly one
 * URL and none of the worlds behind it. Enumerating the whole archive would be neither honest nor
 * useful — six thousand near-identical entries for pages that are generated on request — so this
 * offers the objects Exora already treats as landmarks, the same list that backs search
 * correction. Generated rather than written out, so adding a landmark cannot leave the sitemap
 * describing a different set from the interface.
 *
 * `App.tsx` moves the canonical link to match the destination. Without that these entries would
 * announce themselves as duplicates of the root and be dropped, which is what the previous
 * hard-coded canonical did to every one of them.
 */
const buildSitemap = (): string => {
  const destinations = [
    "/",
    ...FEATURED_BLACK_HOLE_NAMES.map((name) => `/?blackHole=${encodeURIComponent(name)}`),
    ...FEATURED_MISSION_NAMES.map((name) => `/?mission=${encodeURIComponent(name)}`),
    ...FEATURED_REGION_NAMES.map((name) => `/?region=${encodeURIComponent(name)}`),
    ...FEATURED_COMET_NAMES.map((name) => `/?comet=${encodeURIComponent(name)}`),
    ...FEATURED_ASTEROID_NAMES.map((name) => `/?asteroid=${encodeURIComponent(name)}`),
    ...NOTABLE_PLANET_NAMES.map((name) => `/?planet=${encodeURIComponent(name)}`),
    ...NOTABLE_STAR_NAMES.map((name) => `/?star=${encodeURIComponent(name)}`),
  ];

  const entries = destinations
    .map((path) => {
      // The root is the way in; a destination is one reading of a catalog row and no more
      // important than its neighbours.
      const priority = path === "/" ? "1.0" : "0.6";
      return `  <url>\n    <loc>${SITE_ORIGIN}${path}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
};

const emitSitemap = (): Plugin => ({
  name: "exora:sitemap",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "sitemap.xml", source: buildSitemap() });
  },
  configureServer(server) {
    // So the development server answers the same URL the deployment does.
    server.middlewares.use("/sitemap.xml", (_request, response) => {
      response.setHeader("Content-Type", "application/xml");
      response.end(buildSitemap());
    });
  },
});

/** A hard ceiling rather than Vite's advisory-only large-chunk warning. */
const MAX_JAVASCRIPT_CHUNK_BYTES = 800_000;

const enforceJavaScriptBudget = (): Plugin => ({
  name: "exora:javascript-size-budget",
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type !== "chunk") continue;
      const bytes = new TextEncoder().encode(output.code).byteLength;
      if (bytes <= MAX_JAVASCRIPT_CHUNK_BYTES) continue;

      this.error(
        `${output.fileName} is ${bytes.toLocaleString("en-US")} bytes; ` +
          `the JavaScript chunk budget is ${MAX_JAVASCRIPT_CHUNK_BYTES.toLocaleString("en-US")} bytes.`,
      );
    }
  },
});

export default defineConfig({
  optimizeDeps: {
    // The irregular-body route is lazy, but browser journeys open it after the dev server has
    // already started. Pre-bundling its loader/material modules prevents Vite from reloading the
    // entire test page halfway through a journey when that route is first visited.
    include: [
      "@babylonjs/core/Lights/Shadows/shadowGenerator.js",
      "@babylonjs/core/Loading/sceneLoader.js",
      "@babylonjs/core/Materials/PBR/pbrMaterial.js",
      "@babylonjs/loaders/dynamic.js",
    ],
  },
  /**
   * The two suites this package runs, kept as separate projects so neither pays for the other.
   *
   * `unit` is the bulk of the coverage and runs on Node, where it is fast enough to be worth running
   * on every save. `browser` exists for the things Node cannot answer: whether a control still has an
   * accessible name once the stylesheet has hidden its label, whether a dialog traps focus, whether
   * the layout holds at a phone width. Those need a real engine with real CSS, so `vp test` runs only
   * `unit` and the browser suite is asked for by name — nobody has to download a browser to run the
   * tests, and CI runs both.
   */
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["src/**/*.browser.test.ts", "src/**/*.browser.test.tsx"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.tsx"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            // Desktop and phone, because the defects this suite is here to catch are the ones
            // that only appear at one of those widths.
            instances: [
              { browser: "chromium", name: "desktop", viewport: { width: 1440, height: 900 } },
              { browser: "chromium", name: "mobile", viewport: { width: 390, height: 844 } },
            ],
          },
        },
      },
    ],
  },
  build: {
    chunkSizeWarningLimit: MAX_JAVASCRIPT_CHUNK_BYTES / 1_000,
    rolldownOptions: {
      // Naming from the finished graph keeps dynamic boundaries intact. Grouping by dependency
      // here would hoist Babylon into the entry chunk and add roughly 1.7 MB to first paint.
      output: { chunkFileNames: chunkFileName },
    },
  },
  plugins: [react(), dropWebGpuShaders(), emitSitemap(), enforceJavaScriptBudget()],
  server: {
    proxy: {
      "/api": {
        changeOrigin: true,
        target: "http://localhost:8787",
      },
    },
  },
});
