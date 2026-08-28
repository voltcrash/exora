import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { FloatArray } from "@babylonjs/core/types.js";
import type { RockyWorldRecipe } from "@exora/worldgen";
import { buildCraterField, sampleTerrainHeight } from "./planet-terrain.ts";

const TERRAIN_DISPLAY_EXAGGERATION = 0.5;

export const weldTerrainNormals = (positions: FloatArray, normals: Float32Array): void => {
  const vertexCount = normals.length / 3;
  const representatives = new Map<string, number>();
  const representativeOf = new Int32Array(vertexCount);
  const sums = new Float32Array(normals.length);

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const key = `${positions[offset]!},${positions[offset + 1]!},${positions[offset + 2]!}`;
    let representative = representatives.get(key);
    if (representative === undefined) {
      representative = vertex;
      representatives.set(key, vertex);
    }
    representativeOf[vertex] = representative;
    const target = representative * 3;
    sums[target] = sums[target]! + normals[offset]!;
    sums[target + 1] = sums[target + 1]! + normals[offset + 1]!;
    sums[target + 2] = sums[target + 2]! + normals[offset + 2]!;
  }

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const source = representativeOf[vertex]! * 3;
    const x = sums[source]!;
    const y = sums[source + 1]!;
    const z = sums[source + 2]!;
    const length = Math.hypot(x, y, z) || 1;
    const offset = vertex * 3;
    normals[offset] = x / length;
    normals[offset + 1] = y / length;
    normals[offset + 2] = z / length;
  }
};

export const displaceRockyPlanet = (planet: Mesh, recipe: RockyWorldRecipe): void => {
  const positions = planet.getVerticesData(VertexBuffer.PositionKind);
  const indices = planet.getIndices();
  if (!positions || !indices) return;

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

  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  weldTerrainNormals(positions, normals);
  planet.updateVerticesData(VertexBuffer.PositionKind, positions);
  planet.setVerticesData(VertexBuffer.NormalKind, normals);
};
