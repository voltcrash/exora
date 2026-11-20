import type { ExoplanetProfile } from "@exora/contracts";
import { deriveWorldRecipe } from "@exora/worldgen";
import { Vector3, type Texture } from "three";
import { findSolarWorld, tuneSolarWorldRecipe } from "../solar-system.ts";
import { sitePosition } from "../surface-landing.ts";
import { createPlanetGlobe } from "./planet-globe.ts";

export function createHorizonPlanet(
  moon: ExoplanetProfile | undefined,
  seed: number,
  strata: Texture,
  flow: Texture,
  sun: Vector3,
) {
  const identity = moon?.solarSystem;
  if (identity?.bodyType !== "moon" || !identity.parent || !identity.orbitalSemiMajorAxisKilometers)
    return null;
  const planet = findSolarWorld(identity.parent);
  if (!planet?.observation.radiusEarth) return null;
  const radiusRatio =
    (planet.observation.radiusEarth * 6371) / identity.orbitalSemiMajorAxisKilometers;
  if (radiusRatio <= 0 || radiusRatio >= 1) return null;
  const recipe = tuneSolarWorldRecipe(planet, deriveWorldRecipe(planet));
  const globe = createPlanetGlobe(recipe, strata, flow, 48, { identity: planet.solarSystem });
  const distance = 580;
  const bearing = sitePosition(seed, 0.19, 1);
  const offset = new Vector3(bearing.x, 0.246, bearing.z).normalize().multiplyScalar(distance);
  globe.root.scale.setScalar((distance * radiusRatio) / recipe.radiusSceneUnits);
  globe.setLightDirection(sun);
  globe.root.position.copy(offset);
  return {
    root: globe.root,
    follow(x: number, z: number) {
      globe.root.position.set(offset.x + x, offset.y, offset.z + z);
    },
    dispose() {
      globe.dispose();
    },
  };
}
