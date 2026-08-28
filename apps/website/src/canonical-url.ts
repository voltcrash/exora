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
 * Only `blackHole`, `region`, `planet`, `star` and `system` name a destination, and they are checked in the order
 * `loadRequestedObject` checks them so the canonical always agrees with what is on screen.
 * `custom` and `customStar` are shareable procedural recipes, but remain non-canonical so crawlers
 * do not index every possible generated variant. Anything unrecognised collapses too, which keeps
 * tracking parameters from minting endless distinct canonicals for the same page.
 */
export const canonicalUrlForSearch = (search: string): string => {
  const parameters = new URLSearchParams(search);
  const blackHole = parameters.get("blackHole")?.trim();
  if (blackHole) return `${SITE_ORIGIN}/?blackHole=${encodeURIComponent(blackHole)}`;

  const region = parameters.get("region")?.trim();
  if (region) return `${SITE_ORIGIN}/?region=${encodeURIComponent(region)}`;

  const star = parameters.get("star")?.trim();
  if (star) return `${SITE_ORIGIN}/?star=${encodeURIComponent(star)}`;

  const system = parameters.get("system")?.trim();
  if (system) return `${SITE_ORIGIN}/?system=${encodeURIComponent(system)}`;

  const planet = parameters.get("planet")?.trim();
  if (planet) return `${SITE_ORIGIN}/?planet=${encodeURIComponent(planet)}`;

  return `${SITE_ORIGIN}/`;
};
