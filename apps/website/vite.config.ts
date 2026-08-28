import { defineConfig, loadEnv, type Plugin } from "vite-plus";
import react from "@vitejs/plugin-react";
import { playwright } from "vite-plus/test/browser-playwright";
import { NOTABLE_PLANET_NAMES, NOTABLE_STAR_NAMES } from "./src/search-discovery.ts";
import { FEATURED_REGION_NAMES } from "./src/solar-regions.ts";
import { FEATURED_BLACK_HOLE_NAMES } from "./src/black-holes.ts";
import { VARIANT_LAUNCH_INITIALIZER } from "./variant-launch-embed.ts";

const dropWebGpuShaders = (): Plugin => {
  // Exora ships WebGL only; prevent Babylon's WGSL modules entering the bundle.
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
      return id === stub ? "export {};" : null;
    },
  };
};

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

const buildSitemap = (): string => {
  const destinations = [
    "/",
    ...FEATURED_BLACK_HOLE_NAMES.map((name) => `/?blackHole=${encodeURIComponent(name)}`),
    ...FEATURED_REGION_NAMES.map((name) => `/?region=${encodeURIComponent(name)}`),
    ...NOTABLE_PLANET_NAMES.map((name) => `/?planet=${encodeURIComponent(name)}`),
    ...NOTABLE_STAR_NAMES.map((name) => `/?star=${encodeURIComponent(name)}`),
  ];

  const entries = destinations
    .map((path) => {
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
    // Match the deployed sitemap route in development.
    server.middlewares.use("/sitemap.xml", (_request, response) => {
      response.setHeader("Content-Type", "application/xml");
      response.end(buildSitemap());
    });
  },
});

const variantLaunchSdk = (key: string): Plugin => ({
  name: "exora:variant-launch-sdk",
  transformIndexHtml: {
    order: "pre",
    handler: () =>
      key
        ? [
            {
              children: VARIANT_LAUNCH_INITIALIZER,
              injectTo: "head" as const,
              tag: "script",
            },
            {
              attrs: { src: `https://launchar.app/sdk/v1?key=${encodeURIComponent(key)}` },
              injectTo: "head" as const,
              tag: "script",
            },
          ]
        : [],
  },
});

const MAX_JAVASCRIPT_FILE_BYTES = 400_000;

export default defineConfig(({ mode }) => {
  const variantLaunchKey = loadEnv(mode, process.cwd(), "").VITE_VARIANT_LAUNCH_KEY?.trim() ?? "";

  return {
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
              instances: [
                { browser: "chromium", name: "desktop", viewport: { width: 1440, height: 900 } },
                { browser: "chromium", name: "mobile", viewport: { width: 390, height: 844 } },
                { browser: "webkit", name: "webkit", viewport: { width: 1440, height: 900 } },
              ],
            },
          },
        },
      ],
    },
    build: {
      chunkSizeWarningLimit: MAX_JAVASCRIPT_FILE_BYTES / 1_000,
      rolldownOptions: {
        output: {
          chunkFileNames: chunkFileName,
          strictExecutionOrder: true,
          codeSplitting: {
            groups: [
              {
                name: "babylon-vendor",
                test: (moduleId) =>
                  /[\\/]@babylonjs[\\/]/.test(moduleId) &&
                  !/[\\/]Shaders[^\\/]*[\\/]/.test(moduleId),
                maxSize: 350_000,
              },
            ],
          },
        },
      },
    },
    plugins: [variantLaunchSdk(variantLaunchKey), react(), dropWebGpuShaders(), emitSitemap()],
    server: {
      proxy: {
        "/api": {
          changeOrigin: true,
          target: "http://localhost:8787",
        },
      },
    },
  };
});
