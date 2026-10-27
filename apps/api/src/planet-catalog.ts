import type { ExoplanetProfile } from "@exora/contracts";
import { escapeAdqlLiteral, planetNameTokens, rankPlanetMatches } from "./planet-search.ts";

export const compareCatalogNames = (left: ExoplanetProfile, right: ExoplanetProfile): number =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : 0;

export const browsePlanetCatalog = (
  planets: readonly ExoplanetProfile[],
  limit: number,
  after?: string,
): ExoplanetProfile[] =>
  planets
    .filter(
      ({ name, observation }) =>
        (!after || name > after) &&
        observation.distanceParsecs !== null &&
        observation.equilibriumTemperatureKelvin !== null &&
        (observation.radiusEarth !== null || observation.radiusJupiter !== null),
    )
    .slice(0, limit);

export const findCatalogPlanet = (
  planets: readonly ExoplanetProfile[],
  name: string,
): ExoplanetProfile | null => {
  const needle = escapeAdqlLiteral(name).replaceAll("''", "'").toLowerCase();
  return planets.find((planet) => planet.name.toLowerCase() === needle) ?? null;
};

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
  return rankPlanetMatches(query, [...unique.values()]).slice(0, limit);
};
