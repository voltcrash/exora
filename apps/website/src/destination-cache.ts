import {
  loadPlanetsByHost,
  loadPlanetsForStar,
  loadStarByName,
  type StarLoadResult,
  type SystemLoadResult,
} from "./api-client.ts";

interface Entry<T> {
  request: Promise<T | null>;
  expiresAt: number;
}
const TTL_MS = 600_000;
const MAX_ENTRIES = 128;

const stars = new Map<string, Entry<StarLoadResult>>();
const systems = new Map<string, Entry<SystemLoadResult>>();
const starSystems = new Map<string, Entry<SystemLoadResult>>();

const remembered = <Answer>(
  held: Map<string, Entry<Answer>>,
  key: string,
  ask: () => Promise<Answer | null>,
): Promise<Answer | null> => {
  key = key.trim().toLocaleLowerCase();
  const asked = held.get(key);
  if (asked && asked.expiresAt > Date.now()) return asked.request;
  held.delete(key);

  const asking = ask().then(
    (answer) => {
      if (held.get(key)?.request === asking) {
        if (answer === null) held.delete(key);
        else held.set(key, { request: asking, expiresAt: Date.now() + TTL_MS });
      }
      return answer;
    },
    (error: unknown) => {
      if (held.get(key)?.request === asking) held.delete(key);
      throw error;
    },
  );
  held.set(key, { request: asking, expiresAt: Infinity });
  while (held.size > MAX_ENTRIES) held.delete(held.keys().next().value!);
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
