import type { ExoplanetProfile } from "@exora/contracts";
import { deriveWorldRecipe } from "@exora/worldgen";
import { tuneSolarWorldRecipe } from "./solar-system.ts";
import { deriveSurfaceGeology } from "./surface-geology.ts";
import type { TerrainRequest } from "./terrain-jobs.ts";

export const planetTerrainFixture = (
  planet: ExoplanetProfile,
  singlePrecision = false,
): TerrainRequest => {
  const recipe = tuneSolarWorldRecipe(planet, deriveWorldRecipe(planet));
  if (recipe.renderer !== "rocky") throw new Error("Expected a rocky fixture.");
  const values = [1, 0, 0, 0, 1, 0, 0, 0, -1, -0.31, 0.78, 0.54, 0, 0, 0];
  return {
    kind: "planet",
    positions: singlePrecision ? Float32Array.from(values) : Float64Array.from(values),
    recipe,
  };
};

export const surfaceTerrainFixture = (
  planet: ExoplanetProfile,
  resolution = 24,
): TerrainRequest => {
  const recipe = tuneSolarWorldRecipe(planet, deriveWorldRecipe(planet));
  const geology = deriveSurfaceGeology(
    recipe,
    planet.solarSystem ? { naifId: planet.solarSystem.naifId } : null,
  );
  if (!geology) throw new Error("Expected a surface fixture.");
  return {
    kind: "surface",
    input: { geology, resolution, sunDirection: { x: 0.8, y: 0.3, z: -0.5 } },
  };
};
