import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ExoplanetProfile } from "@exora/contracts";
import type { Rgb, RockyWorldRecipe, WorldRecipe } from "@exora/worldgen";
import type { RenderQualityProfile } from "./render-quality.ts";
import { solarMosaicPathForTier } from "./route-assets.ts";
import { getSurfaceDetailTextures, surfaceDetailSelectionForPalette } from "./texture-cache.ts";

const toColor3 = ([red, green, blue]: Rgb): Color3 => new Color3(red, green, blue);

const bindMeasuredSurface = (
  scene: Scene,
  shader: ShaderMaterial,
  recipe: WorldRecipe,
  profile: RenderQualityProfile,
  planet: ExoplanetProfile,
): void => {
  const knownTexture = planet.solarSystem?.texture;
  if (!knownTexture) return;
  const surfaceMap = new Texture(
    solarMosaicPathForTier(knownTexture.path, profile.tier),
    scene,
    true,
    false,
  );
  surfaceMap.name = `${planet.id}-spacecraft-mosaic`;
  surfaceMap.anisotropicFilteringLevel = profile.anisotropicFiltering;
  surfaceMap.wrapU = Texture.WRAP_ADDRESSMODE;
  surfaceMap.wrapV = Texture.CLAMP_ADDRESSMODE;
  shader.setTexture("surfaceMap", surfaceMap);

  const topography = knownTexture.topography;
  const heightMap = topography ? new Texture(topography.path, scene, true, false) : surfaceMap;
  heightMap.name = `${planet.id}-measured-topography`;
  heightMap.anisotropicFilteringLevel = profile.anisotropicFiltering;
  heightMap.wrapU = Texture.WRAP_ADDRESSMODE;
  heightMap.wrapV = Texture.CLAMP_ADDRESSMODE;
  shader.setTexture("heightMap", heightMap);
  shader.setFloat(
    "topographyScale",
    topography ? recipe.radiusSceneUnits * topography.reliefScale : 0,
  );
  shader.setFloat("useTopography", topography ? 1 : 0);
};

const bindProceduralSurface = (
  scene: Scene,
  shader: ShaderMaterial,
  recipe: RockyWorldRecipe,
  profile: RenderQualityProfile,
): void => {
  shader.setFloat("elevation", recipe.surface.elevation);
  shader.setFloat("planetRadius", recipe.radiusSceneUnits);
  shader.setFloat("roughness", recipe.surface.roughness);
  shader.setFloat("craterDensity", recipe.surface.craterDensity);
  shader.setFloat("waterLevel", recipe.surface.waterLevel);
  shader.setFloat("lavaStrength", recipe.surface.lavaStrength);
  shader.setFloat("iceCapStrength", recipe.surface.iceCapStrength);
  shader.setColor3("lowColor", toColor3(recipe.surface.lowColor));
  shader.setColor3("midColor", toColor3(recipe.surface.midColor));
  shader.setColor3("highColor", toColor3(recipe.surface.highColor));
  shader.setColor3("waterColor", toColor3(recipe.surface.waterColor));
  shader.setColor3("waterColorShallow", toColor3(recipe.surface.waterColorShallow));
  shader.setColor3("emissiveColor", toColor3(recipe.surface.emissiveColor));

  if (!profile.surfaceColorDetail && !profile.surfaceMicrodetail) return;
  const selection = surfaceDetailSelectionForPalette(recipe.terrain.paletteFamily);
  const detail = getSurfaceDetailTextures(
    scene,
    selection,
    profile.surfaceMicrodetail,
    profile.anisotropicFiltering,
  );

  if (profile.surfaceColorDetail) {
    shader.setTexture("chemistryColorMap", detail.chemistry);
    shader.setFloat("chemistryScale", selection.chemistryScale);
    shader.setFloat("chemistryStrength", selection.chemistryStrength);
    shader.setFloat("colorDetailFadeStart", recipe.radiusSceneUnits * 7);
    shader.setFloat("colorDetailFadeEnd", recipe.radiusSceneUnits * 24);
  }

  if (profile.surfaceMicrodetail) {
    shader.setTexture("primaryNormalMap", detail.primary.normal);
    shader.setTexture("primaryRoughnessMap", detail.primary.roughness);
    shader.setTexture("secondaryNormalMap", detail.secondary.normal);
    shader.setTexture("secondaryRoughnessMap", detail.secondary.roughness);
    shader.setFloat("primaryDetailScale", selection.primaryScale);
    shader.setFloat("secondaryDetailScale", selection.secondaryScale);
    shader.setFloat("detailFadeStart", recipe.radiusSceneUnits * 4);
    shader.setFloat("detailFadeEnd", recipe.radiusSceneUnits * 16);
  }
};

/** Binds either measured mosaics or cached procedural detail to the already-created material. */
export const bindPlanetSurfaceAssets = (
  scene: Scene,
  shader: ShaderMaterial,
  recipe: WorldRecipe,
  profile: RenderQualityProfile,
  planet: ExoplanetProfile,
): void => {
  if (planet.solarSystem?.texture) {
    bindMeasuredSurface(scene, shader, recipe, profile, planet);
  } else if (recipe.renderer === "rocky") {
    bindProceduralSurface(scene, shader, recipe, profile);
  }
};
