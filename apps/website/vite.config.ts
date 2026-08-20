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

export default defineConfig({
  plugins: [react(), dropWebGpuShaders()],
  server: {
    proxy: {
      "/api": {
        changeOrigin: true,
        target: "http://localhost:8787",
      },
    },
  },
});
