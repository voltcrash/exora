import type { ExoplanetProfile } from "@exora/contracts";

export const MAX_PLANET_NAME_LENGTH = 100;

export const planetNameTokens = (query: string): string[] =>
  query
    .trim()
    .toLowerCase()
    .slice(0, 80)
    .split(/[^\p{L}\p{N}]+/u)
    .flatMap((token) => token.split(/(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})/u))
    .filter((token) => token.length > 0);

const compactName = (value: string): string =>
  value.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, "");

/**
 * Orders matches the way a reader means them: the exact name, then names the query begins at a
 * word boundary ("kepler 18" → Kepler-18 b before Kepler-187 b), then other prefixes, then the rest.
 */
export const rankPlanetMatches = (
  query: string,
  planets: readonly ExoplanetProfile[],
): ExoplanetProfile[] => {
  const needle = compactName(query);
  const rank = (name: string): number => {
    const compact = compactName(name);
    if (compact === needle) return 0;
    if (compact.startsWith(needle)) {
      const next = compact.charAt(needle.length);
      const last = needle.charAt(needle.length - 1);
      return /\p{N}/u.test(next) && /\p{N}/u.test(last) ? 2 : 1;
    }
    return compact.includes(needle) ? 3 : 4;
  };
  return planets
    .map((planet) => ({ planet, rank: rank(planet.name) }))
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.planet.name.length - right.planet.name.length ||
        left.planet.name.localeCompare(right.planet.name, "en"),
    )
    .map(({ planet }) => planet);
};

export const searchLimit = (limit: number): number => Math.max(1, Math.min(Math.trunc(limit), 24));

export const browseLimit = (limit: number): number =>
  Math.max(12, Math.min(Math.trunc(limit), 120));

/** Code-unit order, matching the archive's `order by pl_name` and the browse keyset cursor. */
export const compareCatalogNames = (left: ExoplanetProfile, right: ExoplanetProfile): number =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : 0;

export const isBrowsablePlanet = ({ observation }: ExoplanetProfile): boolean =>
  observation.distanceParsecs !== null &&
  observation.equilibriumTemperatureKelvin !== null &&
  (observation.radiusEarth !== null || observation.radiusJupiter !== null);

export interface CatalogPage {
  nextCursor: string | null;
  planets: ExoplanetProfile[];
}

/** One page of the name-ordered catalog after the last name of the previous page. */
export const browsePlanetCatalog = (
  planets: readonly ExoplanetProfile[],
  limit: number,
  cursor?: string | null,
): CatalogPage => {
  const size = browseLimit(limit);
  const after = cursor?.trim().slice(0, MAX_PLANET_NAME_LENGTH);
  const page = planets
    .filter((planet) => (!after || planet.name > after) && isBrowsablePlanet(planet))
    .slice(0, size);
  return {
    nextCursor: page.length === size ? (page.at(-1)?.name ?? null) : null,
    planets: page,
  };
};

export const findCatalogPlanet = (
  planets: readonly ExoplanetProfile[],
  name: string,
): ExoplanetProfile | null => {
  const needle = name.trim().slice(0, MAX_PLANET_NAME_LENGTH).replaceAll(/[%_]/g, "").toLowerCase();
  return planets.find((planet) => planet.name.toLowerCase() === needle) ?? null;
};

/** Names containing every query token in order, ranked; separators and punctuation are ignored. */
export const searchPlanetCatalog = (
  planets: readonly ExoplanetProfile[],
  query: string,
  limit: number,
): ExoplanetProfile[] => {
  const tokens = planetNameTokens(query);
  if (tokens.length === 0) return [];
  const matches = planets.filter(({ name }) => {
    const haystack = name.toLowerCase();
    let offset = 0;
    for (const token of tokens) {
      const index = haystack.indexOf(token, offset);
      if (index < 0) return false;
      offset = index + token.length;
    }
    return true;
  });
  const unique = new Map(matches.map((planet) => [planet.id, planet]));
  return rankPlanetMatches(query, [...unique.values()]).slice(0, searchLimit(limit));
};
