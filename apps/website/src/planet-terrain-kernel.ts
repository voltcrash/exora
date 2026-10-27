import type { RockyWorldRecipe } from "@exora/worldgen";
import { buildCraterField, sampleTerrainHeight } from "./planet-terrain.ts";

const TERRAIN_DISPLAY_EXAGGERATION = 0.5;

export const displacePlanetPositions = (
  positions: number[] | Float32Array | Float64Array,
  recipe: RockyWorldRecipe,
): void => {
  const craters = buildCraterField(
    recipe.seed,
    recipe.terrain.craterDensity,
    recipe.terrain.craterScale,
  );
  const radius = recipe.radiusSceneUnits;

  for (let vertex = 0; vertex < positions.length; vertex += 3) {
    const x = positions[vertex]!;
    const y = positions[vertex + 1]!;
    const z = positions[vertex + 2]!;
    const length = Math.hypot(x, y, z) || 1;
    const direction = { x: x / length, y: y / length, z: z / length };
    const { height } = sampleTerrainHeight(direction, recipe.terrain, recipe.seed, craters);
    const rawOffset = height * recipe.surface.elevation * TERRAIN_DISPLAY_EXAGGERATION;
    const offset = Math.min(radius * 0.4, Math.max(-radius * 0.4, rawOffset));
    const displaced = radius + offset;
    positions[vertex] = direction.x * displaced;
    positions[vertex + 1] = direction.y * displaced;
    positions[vertex + 2] = direction.z * displaced;
  }
};
