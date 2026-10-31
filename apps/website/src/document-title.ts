export const SITE_TITLE = "Exora — 3D Exoplanet Explorer & Astronomy App";

export const SITE_DESCRIPTION =
  "Explore exoplanets, the Solar System, stars and black holes in 3D with Exora. Discover NASA-backed worlds, guided astronomy tours and AR on supported devices.";

export const documentTitleFor = (destination: string | null): string =>
  destination ? `${destination} · Exora` : SITE_TITLE;

export const descriptionFor = (destination: string | null): string =>
  destination
    ? `Explore ${destination} in Exora's interactive 3D astronomy app. Inspect catalog data and a simulated visualization that distinguishes measurements from inferred appearance.`
    : SITE_DESCRIPTION;
