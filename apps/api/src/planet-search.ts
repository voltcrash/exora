import type { ExoplanetProfile } from "@exora/contracts";

export const escapeAdqlLiteral = (value: string): string =>
  value.replaceAll("%", "").replaceAll("_", "").replaceAll("'", "''");

export const planetNameTokens = (query: string): string[] =>
  query
    .trim()
    .toLowerCase()
    .slice(0, 80)
    .split(/[^\p{L}\p{N}]+/u)
    .flatMap((token) => token.split(/(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})/u))
    .map(escapeAdqlLiteral)
    .filter((token) => token.length > 0);

/**
 * A LIKE pattern that matches a planet name whatever separates its parts, so "kepler 18",
 * "kepler-18" and "Kepler18" all reach "Kepler-18 b". Null when nothing searchable is left.
 */
export const planetNamePattern = (query: string): string | null => {
  const tokens = planetNameTokens(query);
  return tokens.length > 0 ? `%${tokens.join("%")}%` : null;
};

/**
 * The query as a whole name the ways archives write one — hyphen, space or neither between its
 * parts — alone or followed by a planet letter, so "kepler 18" is answered by Kepler-18 b itself
 * rather than by whichever of the hundreds of Kepler-18xx names the archive returns first.
 */
export const planetNamePrefixes = (query: string): string[] => {
  const tokens = planetNameTokens(query);
  if (tokens.length === 0) return [];
  return [...new Set(["-", " ", ""].map((separator) => tokens.join(separator)))].flatMap((name) => [
    name,
    `${name} %`,
  ]);
};

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
