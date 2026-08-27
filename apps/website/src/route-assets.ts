import type { RenderQualityTier } from "./render-quality.ts";

/**
 * Mission mosaics whose desktop source is larger than 900 kB.
 *
 * The constrained copies retain the full equirectangular coverage at 1024×512, which exceeds the
 * on-screen texel density of these tiers while avoiding a megabyte-scale route request. Smaller
 * source maps stay untouched so a second asset is not shipped without a meaningful saving.
 */
const CONSTRAINED_SOLAR_MOSAICS = new Set([
  "/textures/solar-system/callisto.jpg",
  "/textures/solar-system/dione.jpg",
  "/textures/solar-system/enceladus.jpg",
  "/textures/solar-system/europa.jpg",
  "/textures/solar-system/ganymede.jpg",
  "/textures/solar-system/mars.jpg",
  "/textures/solar-system/mercury.jpg",
  "/textures/solar-system/mimas.jpg",
  "/textures/solar-system/rhea.jpg",
  "/textures/solar-system/tethys.jpg",
  "/textures/solar-system/venus.jpg",
]);

export const solarMosaicPathForTier = (path: string, tier: RenderQualityTier): string =>
  tier === "desktop" || !CONSTRAINED_SOLAR_MOSAICS.has(path)
    ? path
    : path.replace(/\.jpg$/, "-mobile.jpg");
