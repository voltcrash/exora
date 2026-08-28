import {
  loadPlanetsByHost,
  loadPlanetsForStar,
  loadStarByName,
  type StarLoadResult,
  type SystemLoadResult,
} from "./api-client.ts";

const stars = new Map<string, Promise<StarLoadResult | null>>();
const systems = new Map<string, Promise<SystemLoadResult | null>>();
const starSystems = new Map<string, Promise<SystemLoadResult | null>>();

const remembered = <Answer>(
  held: Map<string, Promise<Answer | null>>,
  key: string,
  ask: () => Promise<Answer | null>,
): Promise<Answer | null> => {
  const asked = held.get(key);
  if (asked) return asked;

  const asking = ask().then(
    (answer) => {
      if (answer === null) held.delete(key);
      return answer;
    },
    () => {
      held.delete(key);
      return null;
    },
  );
  held.set(key, asking);
  return asking;
};

export const reachStar = (name: string): Promise<StarLoadResult | null> =>
  remembered(stars, name, async () => {
    if (name.trim().toLocaleLowerCase() === "sun") {
      const { findSolarStar } = await import("./solar-system.ts");
      const local = findSolarStar(name);
      if (local) return { cached: true, mode: "solar", star: local };
    }
    return loadStarByName(name);
  });

export const reachSystem = (hostStar: string): Promise<SystemLoadResult | null> =>
  remembered(systems, hostStar, async () => {
    if (hostStar.trim().toLocaleLowerCase() === "sun") {
      const { findSolarSystem } = await import("./solar-system.ts");
      const local = findSolarSystem(hostStar);
      if (local) return local;
    }
    const result = await loadPlanetsByHost(hostStar);
    if (result.planets.length === 0) return null;
    return { cached: result.cached, hostStar, planets: result.planets };
  });

export const reachStarSystem = (starName: string): Promise<SystemLoadResult | null> =>
  remembered(starSystems, starName, async () => {
    const result = await loadPlanetsForStar(starName);
    if (result.planets.length === 0) return null;
    return { cached: result.cached, hostStar: result.query, planets: result.planets };
  });

export const warmDestinations = (hostStar: string): void => {
  void reachStar(hostStar).catch(() => null);
  void reachSystem(hostStar).catch(() => null);
};

export const resetDestinationCacheForTesting = (): void => {
  stars.clear();
  systems.clear();
  starSystems.clear();
};
