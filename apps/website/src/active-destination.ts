import type { ExoplanetProfile } from "@exora/contracts";
import { deriveWorldRecipe, type WorldRecipe } from "@exora/worldgen";
import type { PlanetLoadResult, StarLoadResult, SystemLoadResult } from "./api-client.ts";
import type { BlackHoleProfile } from "./black-holes.ts";
import type { SolarRegionProfile } from "./solar-regions.ts";
import { featuredPlanet } from "./planet-profile.ts";

export type ActiveObject =
  | { blackHole: BlackHoleProfile; type: "black-hole" }
  | { recipe?: WorldRecipe; result: PlanetLoadResult; type: "planet" }
  | { result: StarLoadResult; type: "star" }
  | { result: SystemLoadResult; type: "system" }
  | { region: SolarRegionProfile; type: "region" }
  | {
      kind: "black hole" | "planet" | "region" | "star" | "system";
      name: string;
      detail?: string;
      retry?: boolean;
      type: "missing";
    };

export const solarPlanetObject = async (
  planet: ExoplanetProfile,
  cached: boolean,
): Promise<ActiveObject> => {
  const { tuneSolarWorldRecipe } = await import("./solar-system.ts");
  return {
    recipe: tuneSolarWorldRecipe(planet, deriveWorldRecipe(planet)),
    result: { cached, mode: "solar", planet },
    type: "planet",
  };
};

export const defaultPlanetObject = (): ActiveObject => ({
  result: { cached: true, mode: "fallback", planet: featuredPlanet },
  type: "planet",
});
