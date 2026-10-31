import { defineConfig, loadEnv, type Plugin } from "vite-plus";
import react from "@vitejs/plugin-react";
import { playwright } from "vite-plus/test/browser-playwright";
import { discoveryPages } from "./discovery/plugin.ts";
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

const browserInstances =
  process.env.BROWSER_PROFILE === "desktop"
    ? [{ browser: "chromium" as const, name: "desktop", viewport: { width: 1440, height: 900 } }]
    : [
        { browser: "chromium" as const, name: "desktop", viewport: { width: 1440, height: 900 } },
        { browser: "chromium" as const, name: "mobile", viewport: { width: 390, height: 844 } },
      ];

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
              instances: browserInstances,
            },
          },
        },
      ],
    },
    build: {
      chunkSizeWarningLimit: MAX_JAVASCRIPT_FILE_BYTES / 1_000,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: "scene",
                test: /@babylonjs[\\/]core[\\/]scene\.pure\.js$/,
                includeDependenciesRecursively: false,
              },
            ],
          },
        },
      },
    },
    plugins: [variantLaunchSdk(variantLaunchKey), react(), dropWebGpuShaders(), discoveryPages()],
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
