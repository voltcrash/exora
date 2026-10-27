import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { configureKtx2Transcoder } from "./ktx2-transcoder.ts";
import type { RenderQualityProfile } from "./render-quality.ts";
import { solarMosaicPathForTier } from "./route-assets.ts";

export const createSolarMosaicTexture = (
  path: string,
  scene: Scene,
  profile: RenderQualityProfile,
): Texture => {
  configureKtx2Transcoder();
  const texture = new Texture(solarMosaicPathForTier(path, profile.tier), scene, {
    noMipmap: false,
    invertY: false,
  });
  texture.gammaSpace = true;
  texture.anisotropicFilteringLevel = profile.anisotropicFiltering;
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return texture;
};
