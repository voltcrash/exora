import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";

/**
 * Generic memoizing cache: the same `path` always resolves to the same created value, so callers
 * that ask for the same immutable asset from multiple places (e.g. several rocky planets reusing
 * the same basalt detail map) never trigger a duplicate load or a duplicate GPU allocation. A
 * synchronous factory failure is caught once, the path is marked failed, and every subsequent
 * (and the failing) request receives `fallback()` instead of retrying a known-bad load.
 *
 * Kept free of Babylon types so the dedup/fallback behavior is unit-testable without a WebGL
 * context.
 */
export const createKeyedCache = <T>(
  factory: (path: string) => T,
  fallback: (path: string) => T,
): { get: (path: string) => T; size: () => number } => {
  const cache = new Map<string, T>();
  const failed = new Set<string>();

  return {
    get(path: string): T {
      if (failed.has(path)) return fallback(path);

      const existing = cache.get(path);
      if (existing) return existing;

      try {
        const created = factory(path);
        cache.set(path, created);
        return created;
      } catch {
        failed.add(path);
        return fallback(path);
      }
    },
    size: () => cache.size,
  };
};

export type SurfaceDetailFamily = "basalt" | "cracked" | "granite" | "ice" | "regolith";

export interface SurfaceDetailMaps {
  normal: Texture;
  roughness: Texture;
}

export const SURFACE_DETAIL_FAMILIES: readonly SurfaceDetailFamily[] = [
  "granite",
  "basalt",
  "cracked",
  "regolith",
  "ice",
];

const detailTexturePath = (family: SurfaceDetailFamily, map: "normal" | "roughness"): string =>
  map === "normal" ? `/textures/${family}/normal.png` : `/textures/${family}/roughness.jpg`;

/** Flat-up normal map pixel (128, 128, 255) used when a detail normal map fails to load. */
const FALLBACK_NORMAL_PIXEL = new Uint8Array([128, 128, 255, 255]);
/** Mid-gray roughness pixel used when a detail roughness map fails to load. */
const FALLBACK_ROUGHNESS_PIXEL = new Uint8Array([128, 128, 128, 255]);

let fallbackNormalTexture: RawTexture | undefined;
let fallbackRoughnessTexture: RawTexture | undefined;

const getFallbackTexture = (scene: Scene, kind: "normal" | "roughness"): Texture => {
  if (kind === "normal") {
    fallbackNormalTexture ??= RawTexture.CreateRGBATexture(
      FALLBACK_NORMAL_PIXEL,
      1,
      1,
      scene,
      false,
      false,
    );
    return fallbackNormalTexture;
  }
  fallbackRoughnessTexture ??= RawTexture.CreateRGBATexture(
    FALLBACK_ROUGHNESS_PIXEL,
    1,
    1,
    scene,
    false,
    false,
  );
  return fallbackRoughnessTexture;
};

const cachesByScene = new WeakMap<Scene, { get: (path: string) => Texture }>();

/**
 * Loads (once per scene) and returns the shared curated set of PBR microdetail textures used by
 * the rocky-planet triplanar shader. Every rocky planet in a scene calls this and gets back the
 * same `Texture` instances for a given family, so the underlying image is only decoded and
 * uploaded to the GPU once no matter how many planets reference it. See
 * THIRD_PARTY_ASSETS.md for provenance of the source images.
 */
export const getSurfaceDetailTextures = (
  scene: Scene,
): Record<SurfaceDetailFamily, SurfaceDetailMaps> => {
  let cache = cachesByScene.get(scene);
  if (!cache) {
    cache = createKeyedCache<Texture>(
      (path) => {
        const isNormal = path.endsWith("normal.png");
        const texture = new Texture(
          path,
          scene,
          { noMipmap: false, invertY: false },
          undefined,
          undefined,
          undefined,
          () => {
            // Swap in a neutral fallback and drop this path from the cache so future callers
            // (and this one, next time) get the fallback instead of a broken texture.
            console.warn(`[texture-cache] failed to load ${path}, using neutral fallback`);
          },
        );
        texture.wrapU = Texture.WRAP_ADDRESSMODE;
        texture.wrapV = Texture.WRAP_ADDRESSMODE;
        texture.anisotropicFilteringLevel = 4;
        texture.gammaSpace = false;
        if (!isNormal) texture.gammaSpace = false;
        return texture;
      },
      (path) => getFallbackTexture(scene, path.endsWith("normal.png") ? "normal" : "roughness"),
    );
    cachesByScene.set(scene, cache);
  }

  const result = {} as Record<SurfaceDetailFamily, SurfaceDetailMaps>;
  for (const family of SURFACE_DETAIL_FAMILIES) {
    result[family] = {
      normal: cache.get(detailTexturePath(family, "normal")),
      roughness: cache.get(detailTexturePath(family, "roughness")),
    };
  }
  return result;
};
