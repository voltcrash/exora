import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomStar, CustomWorld } from "@exora/worldgen";
import type { BlackHoleProfile } from "./black-holes.ts";
import type { SolarRegionProfile } from "./solar-regions.ts";
import type { XrCell } from "./xr-panel-layout.ts";

export interface XrConsoleFact {
  label: string;
  value: string;
}

/** Scene metadata retained for destination controls; Discover itself now comes from React. */
export interface XrConsoleHost {
  facts: () => readonly XrConsoleFact[];
  onExit: () => void;
  onForgePlanet?: (world: CustomWorld) => void;
  onForgeStar?: (star: CustomStar) => void;
  onTravelBlackHole?: (blackHole: BlackHoleProfile) => void;
  onTravelPlanet?: (planet: ExoplanetProfile) => void;
  onTravelRegion?: (region: SolarRegionProfile) => void;
  onTravelStar?: (star: StarProfile) => void;
  sceneActions: () => readonly XrCell[];
  source: () => string;
  subtitle: () => string;
  summary: () => string;
  title: () => string;
}
