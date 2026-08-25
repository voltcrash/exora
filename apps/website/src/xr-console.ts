import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomStar, CustomWorld } from "@exora/worldgen";
import type { BlackHoleProfile } from "./black-holes.ts";
import type { AsteroidProfile } from "./solar-asteroids.ts";
import type { CometProfile } from "./solar-comets.ts";
import type { SolarMissionProfile } from "./solar-missions.ts";
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
  onTravelAsteroid?: (asteroid: AsteroidProfile) => void;
  onTravelBlackHole?: (blackHole: BlackHoleProfile) => void;
  onTravelComet?: (comet: CometProfile) => void;
  onTravelMission?: (mission: SolarMissionProfile) => void;
  onTravelPlanet?: (planet: ExoplanetProfile) => void;
  onTravelRegion?: (region: SolarRegionProfile) => void;
  onTravelStar?: (star: StarProfile) => void;
  sceneActions: () => readonly XrCell[];
  source: () => string;
  subtitle: () => string;
  summary: () => string;
  title: () => string;
}
