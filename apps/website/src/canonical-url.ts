/**
 * Which URL a destination should present itself as.
 *
 * Every page shipped a canonical link pointing at the site root, which is correct for the root
 * and wrong for everything else: it tells a search engine that `?planet=Kepler-22 b` is a
 * duplicate of the landing page and should be dropped. That made the destinations in `sitemap.xml`
 * unreachable in practice, however carefully the sitemap listed them.
 *
 * Kept free of the DOM so the rule is testable without a document.
 */

export const SITE_ORIGIN = "https://exora.voltcrash.com";

/**
 * The canonical URL for a location, given the site's own query parameters.
 *
 * Only `blackHole`, `mission`, `region`, `comet`, `asteroid`, `planet`, `star` and `system` name a destination, and they are checked in the order
 * `loadRequestedObject` checks them so the canonical always agrees with what is on screen.
 * `custom` and `customStar` are procedural worlds that exist for one visitor and cannot be
 * resolved by anyone else, so they collapse to the root rather than inviting a crawler to index a
 * seed. Anything unrecognised collapses too, which keeps tracking parameters from minting endless
 * distinct canonicals for the same page.
 */
export const canonicalUrlForSearch = (search: string): string => {
  const parameters = new URLSearchParams(search);
  const blackHole = parameters.get("blackHole")?.trim();
  if (blackHole) return `${SITE_ORIGIN}/?blackHole=${encodeURIComponent(blackHole)}`;

  const mission = parameters.get("mission")?.trim();
  if (mission) return `${SITE_ORIGIN}/?mission=${encodeURIComponent(mission)}`;

  const region = parameters.get("region")?.trim();
  if (region) return `${SITE_ORIGIN}/?region=${encodeURIComponent(region)}`;

  const comet = parameters.get("comet")?.trim();
  if (comet) return `${SITE_ORIGIN}/?comet=${encodeURIComponent(comet)}`;

  const asteroid = parameters.get("asteroid")?.trim();
  if (asteroid) return `${SITE_ORIGIN}/?asteroid=${encodeURIComponent(asteroid)}`;

  const star = parameters.get("star")?.trim();
  if (star) return `${SITE_ORIGIN}/?star=${encodeURIComponent(star)}`;

  const system = parameters.get("system")?.trim();
  if (system) return `${SITE_ORIGIN}/?system=${encodeURIComponent(system)}`;

  const planet = parameters.get("planet")?.trim();
  if (planet) return `${SITE_ORIGIN}/?planet=${encodeURIComponent(planet)}`;

  return `${SITE_ORIGIN}/`;
};
