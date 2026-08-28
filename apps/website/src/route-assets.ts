import type { RenderQualityTier } from "./render-quality.ts";

export type InitialSceneAsset = "black-hole" | "planet" | "region" | "star" | "system";

export const initialSceneAssetForSearch = (search: string): InitialSceneAsset => {
  const parameters = new URLSearchParams(search);
  if (parameters.has("blackHole")) return "black-hole";
  if (parameters.has("region")) return "region";
  if (parameters.has("star") || parameters.has("customStar")) return "star";
  if (parameters.has("system")) return "system";
  return "planet";
};

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
