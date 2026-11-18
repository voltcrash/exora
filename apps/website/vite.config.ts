import { defineConfig, loadEnv, type Plugin } from "vite-plus";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { playwright } from "vite-plus/test/browser-playwright";
import { discoveryPages } from "./discovery/plugin.ts";
import { VARIANT_LAUNCH_INITIALIZER } from "./variant-launch-embed.ts";

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
          optimizeDeps: {
            include: [
              "react/compiler-runtime",
              "three/addons/controls/OrbitControls.js",
              "three/addons/loaders/GLTFLoader.js",
            ],
          },
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
      manifest: true,
      chunkSizeWarningLimit: MAX_JAVASCRIPT_FILE_BYTES / 1_000,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: "three-core",
                test: /three[\\/]build[\\/]three\.core\.js$/,
                includeDependenciesRecursively: false,
              },
            ],
          },
        },
      },
    },
    plugins: [
      variantLaunchSdk(variantLaunchKey),
      react(),
      // The compiler memoises components and hooks, so a scene readout or search keystroke
      // re-renders only what it changed instead of whole destination trees.
      babel({ presets: [reactCompilerPreset()] }),
      discoveryPages(),
    ],
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
