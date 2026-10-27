import { planetNameTokens } from "@exora/planet-catalog";

export const escapeAdqlLiteral = (value: string): string =>
  value.replaceAll("%", "").replaceAll("_", "").replaceAll("'", "''");

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
