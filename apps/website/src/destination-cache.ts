/**
 * The destinations a jump is about to need, asked for before it is asked for.
 *
 * A jump between destinations is flown, not announced, which leaves the archive request in plain
 * sight: the camera pulls away from the world being left and then has nowhere to go until the
 * answer arrives. What the visitor sees is a flight that stops in the middle of the sky, which
 * reads as the page having hung rather than as travel.
 *
 * Every route out of a world is knowable long before it is taken, though. A planet names its host
 * star and belongs to one system; a star's system is the list of worlds that view already asks
 * for as it opens. So each view warms the destinations it offers as soon as it has them, and the
 * click that follows is answered from memory.
 *
 * Held for the life of the page, like the sky catalogue and the texture cache. These are archive
 * records of objects that do not change, so there is nothing for a second request to learn — and
 * a session in which a visitor crosses back and forth between a world and its star is exactly the
 * one this exists for.
 *
 * Only answers are kept. A lookup that fails leaves nothing behind, so the next attempt is a real
 * attempt rather than a cached shrug at whatever the network was doing a minute ago.
 */

import {
  loadPlanetsByHost,
  loadPlanetsForStar,
  loadStarByName,
  type StarLoadResult,
  type SystemLoadResult,
} from "./api-client.ts";
import { findSolarStar, findSolarSystem } from "./solar-system.ts";

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

/** The star an archive files under this name, or null where it files none. */
export const reachStar = (name: string): Promise<StarLoadResult | null> =>
  remembered(stars, name, () => {
    const local = findSolarStar(name);
    return local
      ? Promise.resolve({ cached: true, mode: "solar", star: local })
      : loadStarByName(name);
  });

/**
 * Every world the archive links to a host, gathered as a system.
 *
 * A system needs no SIMBAD lookup: every planet row carries its host star's temperature, radius,
 * mass and luminosity, which is everything the diorama draws the star from. So a system is
 * reachable even where the host name is one SIMBAD cannot resolve, which is most of the Kepler
 * and TOI catalogue. A host with no worlds against it is not a system, and answers null.
 */
export const reachSystem = (hostStar: string): Promise<SystemLoadResult | null> =>
  remembered(systems, hostStar, async () => {
    const local = findSolarSystem(hostStar);
    if (local) return local;
    const result = await loadPlanetsByHost(hostStar);
    if (result.planets.length === 0) return null;
    return { cached: result.cached, hostStar, planets: result.planets };
  });

/** A SIMBAD star's system, resolved through NASA's own cross-catalog aliases service. */
export const reachStarSystem = (starName: string): Promise<SystemLoadResult | null> =>
  remembered(starSystems, starName, async () => {
    const result = await loadPlanetsForStar(starName);
    if (result.planets.length === 0) return null;
    return { cached: result.cached, hostStar: result.query, planets: result.planets };
  });

/**
 * Asks for both routes out of a world, and waits for neither.
 *
 * Called as a view opens rather than as it is left, which is the whole point: by the time the
 * visitor decides to go, the answer is already here and the flight never has to pause for it.
 */
export const warmDestinations = (hostStar: string): void => {
  void reachStar(hostStar).catch(() => null);
  void reachSystem(hostStar).catch(() => null);
};

/** Forgets everything, so one test's archive cannot answer the next one's lookup. */
export const resetDestinationCacheForTesting = (): void => {
  stars.clear();
  systems.clear();
  starSystems.clear();
};
