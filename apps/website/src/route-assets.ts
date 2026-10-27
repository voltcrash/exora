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
  "/textures/solar-system/callisto.ktx2",
  "/textures/solar-system/dione.ktx2",
  "/textures/solar-system/enceladus.ktx2",
  "/textures/solar-system/europa.ktx2",
  "/textures/solar-system/ganymede.ktx2",
  "/textures/solar-system/mars.ktx2",
  "/textures/solar-system/mercury.ktx2",
  "/textures/solar-system/mimas.ktx2",
  "/textures/solar-system/rhea.ktx2",
  "/textures/solar-system/tethys.ktx2",
  "/textures/solar-system/venus.ktx2",
]);

export const solarMosaicPathForTier = (path: string, tier: RenderQualityTier): string =>
  tier === "desktop" || !CONSTRAINED_SOLAR_MOSAICS.has(path)
    ? path
    : path.replace(/\.ktx2$/, "-mobile.ktx2");
