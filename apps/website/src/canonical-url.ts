export const SITE_ORIGIN = "https://exora.voltcrash.com";

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
