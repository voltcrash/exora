export const SITE_TITLE = "Exora — Explore Alien Worlds";

export const documentTitleFor = (destination: string | null): string =>
  destination ? `${destination} · Exora` : SITE_TITLE;
