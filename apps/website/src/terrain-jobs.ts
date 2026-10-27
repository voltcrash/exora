import type { RockyWorldRecipe } from "@exora/worldgen";
import { displacePlanetPositions } from "./planet-terrain-kernel.ts";
import {
  buildSurfaceTerrain,
  type SurfaceTerrainData,
  type SurfaceTerrainInput,
} from "./surface-terrain-kernel.ts";

export type TerrainRequest =
  | { kind: "planet"; positions: Float32Array | Float64Array; recipe: RockyWorldRecipe }
  | { kind: "surface"; input: SurfaceTerrainInput };

export type TerrainResult =
  | { kind: "planet"; positions: Float32Array | Float64Array }
  | { kind: "surface"; data: SurfaceTerrainData };

export const executeTerrainJob = (request: TerrainRequest): TerrainResult => {
  if (request.kind === "planet") {
    displacePlanetPositions(request.positions, request.recipe);
    return { kind: "planet", positions: request.positions };
  }
  return { kind: "surface", data: buildSurfaceTerrain(request.input) };
};

export const terrainTransfers = (result: TerrainResult): ArrayBuffer[] =>
  result.kind === "planet"
    ? [result.positions.buffer as ArrayBuffer]
    : Object.values(result.data).flatMap((value) =>
        typeof value === "number" ? [] : [value.buffer as ArrayBuffer],
      );
