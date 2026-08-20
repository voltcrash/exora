import { defineConfig, type Plugin } from "vite-plus";
import react from "@vitejs/plugin-react";

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
  build: {
    chunkSizeWarningLimit: MAX_JAVASCRIPT_CHUNK_BYTES / 1_000,
    rolldownOptions: {
      // Naming from the finished graph keeps dynamic boundaries intact. Grouping by dependency
      // here would hoist Babylon into the entry chunk and add roughly 1.7 MB to first paint.
      output: { chunkFileNames: chunkFileName },
    },
  },
  plugins: [react(), dropWebGpuShaders(), enforceJavaScriptBudget()],
  server: {
    proxy: {
      "/api": {
        changeOrigin: true,
        target: "http://localhost:8787",
      },
    },
  },
});
