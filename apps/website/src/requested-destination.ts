import { generateCustomBlackHole, generateCustomStar, generateCustomWorld } from "@exora/worldgen";
import { loadBlackHoleByName, loadPlanetByName } from "./api-client.ts";
import { reachStar, reachSystem } from "./destination-cache.ts";
import { hasRenderer } from "./planet-utils.tsx";
import { defaultPlanetObject, solarPlanetObject, type ActiveObject } from "./active-destination.ts";

export const loadRequestedObject = async (): Promise<ActiveObject> => {
  const parameters = new URLSearchParams(window.location.search);
  const customBlackHole = parameters.get("customBlackHole");
  if (customBlackHole !== null) {
    const { parseCustomBlackHoleUrl } = await import("./custom-destination-url.ts");
    const customParameters = parseCustomBlackHoleUrl(customBlackHole);
    if (!customParameters) {
      return {
        detail:
          "This link carries a World Forge recipe that is invalid or from an incompatible version. Make a new one in World Forge.",
        kind: "black hole",
        name: "custom recipe",
        type: "missing",
      };
    }
    return { blackHole: generateCustomBlackHole(customParameters).blackHole, type: "black-hole" };
  }
  const blackHoleName = parameters.get("blackHole");
  if (blackHoleName) {
    const { findBlackHole, findProceduralBlackHole } = await import("./black-holes.ts");
    const blackHole =
      findBlackHole(blackHoleName) ??
      findProceduralBlackHole(blackHoleName) ??
      (await loadBlackHoleByName(blackHoleName));
    return blackHole
      ? { blackHole, type: "black-hole" }
      : { kind: "black hole", name: blackHoleName, type: "missing" };
  }
  const regionName = parameters.get("region");
  if (regionName) {
    const { findSolarRegion } = await import("./solar-regions.ts");
    const region = findSolarRegion(regionName);
    return region
      ? { region, type: "region" }
      : { kind: "region", name: regionName, type: "missing" };
  }
  const starName = parameters.get("star");
  if (starName) {
    const { findSolarStar } = await import("./solar-system.ts");
    const localStar = findSolarStar(starName);
    if (localStar)
      return { result: { cached: true, mode: "solar", star: localStar }, type: "star" };
    const star = await reachStar(starName);
    if (star) return { result: star, type: "star" };
    return { kind: "star", name: starName, type: "missing" };
  }

  const systemName = parameters.get("system");
  if (systemName) {
    const system = await reachSystem(systemName);
    if (system) return { result: system, type: "system" };
    return { kind: "system", name: systemName, type: "missing" };
  }

  const name = parameters.get("planet");
  if (name) {
    const { findSolarWorld } = await import("./solar-system.ts");
    const localWorld = findSolarWorld(name);
    if (localWorld) {
      return solarPlanetObject(localWorld, true);
    }

    const requested = await loadPlanetByName(name);
    return requested && hasRenderer(requested.planet)
      ? { result: requested, type: "planet" }
      : { kind: "planet", name, type: "missing" };
  }

  const customPlanet = parameters.get("custom");
  if (customPlanet !== null) {
    const { parseCustomPlanetUrl } = await import("./custom-destination-url.ts");
    const customParameters = parseCustomPlanetUrl(customPlanet);
    if (!customParameters) {
      return {
        detail:
          "This link carries a World Forge recipe that is invalid or from an incompatible version. Make a new one in World Forge.",
        kind: "planet",
        name: "custom recipe",
        type: "missing",
      };
    }
    const custom = generateCustomWorld(customParameters);
    return {
      recipe: custom.recipe,
      result: { cached: false, mode: "custom", planet: custom.planet },
      type: "planet",
    };
  }

  const customStar = parameters.get("customStar");
  if (customStar !== null) {
    const { parseCustomStarUrl } = await import("./custom-destination-url.ts");
    const customParameters = parseCustomStarUrl(customStar);
    if (!customParameters) {
      return {
        detail:
          "This link carries a World Forge recipe that is invalid or from an incompatible version. Make a new one in World Forge.",
        kind: "star",
        name: "custom recipe",
        type: "missing",
      };
    }
    const custom = generateCustomStar(customParameters);
    return { result: { cached: false, mode: "custom", star: custom.star }, type: "star" };
  }

  return defaultPlanetObject();
};
