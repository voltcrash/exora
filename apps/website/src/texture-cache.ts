import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { RockyPaletteFamily } from "@exora/worldgen";

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

export type ChemistryDetailFamily = "carbon" | "ice" | "oxidized" | "silicate" | "sulfuric";

export interface SurfaceDetailSelection {
  chemistry: ChemistryDetailFamily;
  chemistryScale: number;
  chemistryStrength: number;
  primary: SurfaceDetailFamily;
  primaryScale: number;
  secondary: SurfaceDetailFamily;
  secondaryScale: number;
}

export interface SelectedSurfaceDetailMaps {
  chemistry: Texture;
  primary: SurfaceDetailMaps;
  secondary: SurfaceDetailMaps;
}

export const SURFACE_DETAIL_FAMILIES: readonly SurfaceDetailFamily[] = [
  "granite",
  "basalt",
  "cracked",
  "regolith",
  "ice",
];

export const detailTexturePath = (
  family: SurfaceDetailFamily,
  map: "normal" | "roughness",
): string => `/textures/${family}/${map}.ktx2`;

export const chemistryTexturePath = (family: ChemistryDetailFamily): string =>
  `/textures/chemistry/${family}.ktx2`;

/** Selects only two high-resolution PBR families per world instead of uploading all five. The
 * chemistry texture supplies the palette-specific grain while these two maps supply physical
 * response, keeping the desktop shader sharper and substantially lighter than the old 30-sample
 * five-material blend. */
export const surfaceDetailSelectionForPalette = (
  palette: RockyPaletteFamily,
): SurfaceDetailSelection => {
  switch (palette) {
    case "basaltic-dark":
      return {
        chemistry: "carbon",
        chemistryScale: 10,
        chemistryStrength: 0.32,
        primary: "basalt",
        primaryScale: 9,
        secondary: "regolith",
        secondaryScale: 14,
      };
    case "carbon-dark":
      return {
        chemistry: "carbon",
        chemistryScale: 11,
        chemistryStrength: 0.42,
        primary: "basalt",
        primaryScale: 8,
        secondary: "cracked",
        secondaryScale: 7,
      };
    case "desert-tan":
      return {
        chemistry: "oxidized",
        chemistryScale: 15,
        chemistryStrength: 0.28,
        primary: "regolith",
        primaryScale: 15,
        secondary: "granite",
        secondaryScale: 8,
      };
    case "ice-blue":
      return {
        chemistry: "ice",
        chemistryScale: 11,
        chemistryStrength: 0.34,
        primary: "ice",
        primaryScale: 11,
        secondary: "granite",
        secondaryScale: 8,
      };
    case "iron-rich":
      return {
        chemistry: "oxidized",
        chemistryScale: 10,
        chemistryStrength: 0.3,
        primary: "basalt",
        primaryScale: 9,
        secondary: "granite",
        secondaryScale: 7,
      };
    case "lava-black-red":
      return {
        chemistry: "carbon",
        chemistryScale: 9,
        chemistryStrength: 0.3,
        primary: "basalt",
        primaryScale: 8,
        secondary: "cracked",
        secondaryScale: 6,
      };
    case "oxidized-red":
      return {
        chemistry: "oxidized",
        chemistryScale: 12,
        chemistryStrength: 0.4,
        primary: "regolith",
        primaryScale: 13,
        secondary: "cracked",
        secondaryScale: 7,
      };
    case "sulfuric-yellow":
      return {
        chemistry: "sulfuric",
        chemistryScale: 11,
        chemistryStrength: 0.44,
        primary: "cracked",
        primaryScale: 7,
        secondary: "regolith",
        secondaryScale: 14,
      };
    case "silicate-neutral":
      return {
        chemistry: "silicate",
        chemistryScale: 13,
        chemistryStrength: 0.25,
        primary: "granite",
        primaryScale: 8,
        secondary: "regolith",
        secondaryScale: 14,
      };
  }
};

/** Flat-up normal map pixel (128, 128, 255) used when a detail normal map fails to load. */
const FALLBACK_NORMAL_PIXEL = new Uint8Array([128, 128, 255, 255]);
/** Mid-gray roughness pixel used when a detail roughness map fails to load. */
const FALLBACK_ROUGHNESS_PIXEL = new Uint8Array([128, 128, 128, 255]);
/** Neutral white color detail leaves the procedural palette unchanged on load failure. */
const FALLBACK_COLOR_PIXEL = new Uint8Array([255, 255, 255, 255]);

const fallbackTexturesByScene = new WeakMap<
  Scene,
  Partial<Record<"color" | "normal" | "roughness", RawTexture>>
>();

const getFallbackTexture = (scene: Scene, kind: "color" | "normal" | "roughness"): Texture => {
  let textures = fallbackTexturesByScene.get(scene);
  if (!textures) {
    textures = {};
    fallbackTexturesByScene.set(scene, textures);
  }
  const existing = textures[kind];
  if (existing) return existing;

  const pixel =
    kind === "normal"
      ? FALLBACK_NORMAL_PIXEL
      : kind === "roughness"
        ? FALLBACK_ROUGHNESS_PIXEL
        : FALLBACK_COLOR_PIXEL;
  const texture = RawTexture.CreateRGBATexture(pixel, 1, 1, scene, false, false);
  texture.gammaSpace = kind === "color";
  textures[kind] = texture;
  return texture;
};

const cachesByScene = new WeakMap<Scene, { get: (path: string) => Texture }>();

/**
 * Loads only the selected chemistry map and two selected PBR families, then reuses them for the
 * lifetime of the scene. This avoids decoding/uploading irrelevant material families and makes
 * the 2K source maps practical on desktop while Quest only requests the 1K chemistry map.
 */
export const getSurfaceDetailTextures = (
  scene: Scene,
  selection: SurfaceDetailSelection,
  includePbrMaps: boolean,
  anisotropicFiltering = 16,
): SelectedSurfaceDetailMaps => {
  let cache = cachesByScene.get(scene);
  if (!cache) {
    cache = createKeyedCache<Texture>(
      (path) => {
        const isColor = path.includes("/chemistry/");
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
        // These tile across a sphere, so most of the visible surface is viewed at a grazing
        // angle where low anisotropy is exactly where mip selection blurs the detail away.
        texture.anisotropicFilteringLevel = anisotropicFiltering;
        texture.gammaSpace = isColor;
        return texture;
      },
      (path) =>
        getFallbackTexture(
          scene,
          path.includes("/chemistry/")
            ? "color"
            : path.endsWith("normal.ktx2")
              ? "normal"
              : "roughness",
        ),
    );
    cachesByScene.set(scene, cache);
  }

  const fallbackMaps = (): SurfaceDetailMaps => ({
    normal: getFallbackTexture(scene, "normal"),
    roughness: getFallbackTexture(scene, "roughness"),
  });
  const loadMaps = (family: SurfaceDetailFamily): SurfaceDetailMaps =>
    includePbrMaps
      ? {
          normal: cache.get(detailTexturePath(family, "normal")),
          roughness: cache.get(detailTexturePath(family, "roughness")),
        }
      : fallbackMaps();

  return {
    chemistry: cache.get(chemistryTexturePath(selection.chemistry)),
    primary: loadMaps(selection.primary),
    secondary: loadMaps(selection.secondary),
  };
};
