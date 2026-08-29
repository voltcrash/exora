import { FEATURED_BLACK_HOLES, type BlackHoleProfile } from "@exora/contracts";
import { generateProceduralBlackHole } from "@exora/worldgen";

export type { BlackHoleKind, BlackHoleProfile } from "@exora/contracts";

const SCHWARZSCHILD_DIAMETER_KM_PER_SOLAR_MASS = 5.906_5;

export const BLACK_HOLES: readonly BlackHoleProfile[] = FEATURED_BLACK_HOLES;
export const FEATURED_BLACK_HOLE_NAMES: readonly string[] = BLACK_HOLES.map(({ name }) => name);

const normalizeIdentity = (value: string): string =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, "");

export const findBlackHole = (value: string): BlackHoleProfile | undefined => {
  const requested = normalizeIdentity(value);
  return BLACK_HOLES.find((blackHole) =>
    [blackHole.id, blackHole.name, blackHole.catalogDesignation, ...blackHole.aliases].some(
      (identity) => normalizeIdentity(identity) === requested,
    ),
  );
};

export const findProceduralBlackHole = (value: string): BlackHoleProfile | undefined => {
  const match = value
    .trim()
    .toLowerCase()
    .match(/^exora-synthetic-(\d+)-(\d{4,})$/);
  if (!match) return undefined;
  const seed = Number(match[1]);
  const sequence = Number(match[2]);
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(sequence) || sequence < 1)
    return undefined;
  return generateProceduralBlackHole({ seed, sequence });
};

export const schwarzschildDiameterKilometers = (blackHole: BlackHoleProfile): number | null =>
  blackHole.massSolar === null
    ? null
    : blackHole.massSolar * SCHWARZSCHILD_DIAMETER_KM_PER_SOLAR_MASS;

export const blackHoleKindLabel = (blackHole: BlackHoleProfile): string =>
  blackHole.kind.replace("-", " ");

export const formatBlackHoleMass = (massSolar: number | null): string => {
  if (massSolar === null) return "Mass unavailable";
  if (massSolar >= 1_000_000_000) return `${(massSolar / 1_000_000_000).toFixed(1)} billion M☉`;
  if (massSolar >= 1_000_000) return `${(massSolar / 1_000_000).toFixed(1)} million M☉`;
  return `${massSolar.toLocaleString("en-US", { maximumFractionDigits: 1 })} M☉`;
};
