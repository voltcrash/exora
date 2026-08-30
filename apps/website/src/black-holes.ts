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

export const blackHoleNotableTrait = (blackHole: BlackHoleProfile): string => {
  if (blackHole.source.archive.includes("Event Horizon Telescope"))
    return "Directly imaged horizon";
  if (blackHole.observation.companion) return "Feeding on a companion star";
  if (blackHole.massSolar === null) return "Mass not yet measured";
  if (blackHole.kind === "ultramassive") return "Ultramassive engine";
  if (blackHole.observation.accretion === "active") return "Actively accreting";
  if (blackHole.distanceLightYears !== null && blackHole.distanceLightYears <= 10_000)
    return "In our own galaxy";
  if (blackHole.status === "candidate") return "Unconfirmed candidate";
  return blackHole.milestone;
};

export const BLACK_HOLE_COLLECTIONS = [
  {
    id: "imaged-horizons",
    index: "01",
    label: "Seen with our own eyes",
    note: "The horizons resolved directly by the Event Horizon Telescope",
    tag: "IMAGED SHADOWS",
  },
  {
    id: "nearest-horizons",
    index: "02",
    label: "Closest to home",
    note: "The nearest measured black holes, ordered by distance",
    tag: "LOCAL DARK",
  },
  {
    id: "heaviest-engines",
    index: "03",
    label: "The heaviest known",
    note: "Galactic engines at the top of the measured mass ladder",
    tag: "COSMIC TITANS",
  },
  {
    id: "feeding-binaries",
    index: "04",
    label: "Feeding in a binary",
    note: "Systems drawing matter from a companion star",
    tag: "ACTIVE SYSTEMS",
  },
] as const;

export const BLACK_HOLE_CATEGORIES = [
  {
    icon: "◎",
    id: "supermassive",
    label: "Supermassive",
    note: "Millions of suns at galactic cores",
  },
  {
    icon: "⬢",
    id: "ultramassive",
    label: "Ultramassive",
    note: "The most extreme measured masses",
  },
  {
    icon: "◐",
    id: "intermediate-mass",
    label: "Intermediate mass",
    note: "The rare middle of the ladder",
  },
  {
    icon: "•",
    id: "stellar-mass",
    label: "Stellar mass",
    note: "Collapsed remnants of massive stars",
  },
  {
    icon: "✦",
    id: "active-accretion",
    label: "Actively feeding",
    note: "Bright discs, jets and outbursts",
  },
  { icon: "○", id: "quiet-horizons", label: "Quiet horizons", note: "Dormant or barely accreting" },
  { icon: "∞", id: "binary-systems", label: "Binary systems", note: "Locked to a companion star" },
  {
    icon: "⌖",
    id: "measured-masses",
    label: "Measured masses",
    note: "Confirmed, dynamically weighed",
  },
] as const;

const matchesCategory = (blackHole: BlackHoleProfile, category: string): boolean => {
  switch (category) {
    case "active-accretion":
      return blackHole.observation.accretion === "active";
    case "quiet-horizons":
      return blackHole.observation.accretion !== "active";
    case "binary-systems":
      return blackHole.observation.companion !== null;
    case "measured-masses":
      return blackHole.status === "confirmed" && blackHole.massSolar !== null;
    default:
      return blackHole.kind === category;
  }
};

const byDistance = (left: BlackHoleProfile, right: BlackHoleProfile): number =>
  (left.distanceLightYears ?? Infinity) - (right.distanceLightYears ?? Infinity);

const byMass = (left: BlackHoleProfile, right: BlackHoleProfile): number =>
  (right.massSolar ?? -Infinity) - (left.massSolar ?? -Infinity);

/* The curated five are the horizons a visitor arrives looking for, and the archive would bury them
   in the alphabet, so they keep their order at the head of every unfiltered listing. */
const curatedRank = (blackHole: BlackHoleProfile): number => {
  const rank = BLACK_HOLES.findIndex(({ id }) => id === blackHole.id);
  return rank < 0 ? BLACK_HOLES.length : rank;
};

const byName = (left: BlackHoleProfile, right: BlackHoleProfile): number =>
  curatedRank(left) - curatedRank(right) ||
  left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });

export const collectBlackHoles = (
  records: readonly BlackHoleProfile[],
  collection: string,
): BlackHoleProfile[] => {
  switch (collection) {
    case "imaged-horizons":
      return records
        .filter(({ source }) => source.archive.includes("Event Horizon Telescope"))
        .toSorted(byMass);
    case "nearest-horizons":
      return records
        .filter(({ distanceLightYears }) => distanceLightYears !== null)
        .toSorted(byDistance);
    case "heaviest-engines":
      return records.filter(({ massSolar }) => massSolar !== null).toSorted(byMass);
    case "feeding-binaries":
      return records
        .filter(
          ({ observation }) => observation.companion !== null || observation.accretion === "active",
        )
        .toSorted(byMass);
    default:
      return records.filter((blackHole) => matchesCategory(blackHole, collection)).toSorted(byMass);
  }
};

export const searchBlackHoles = (
  records: readonly BlackHoleProfile[],
  query: string,
): BlackHoleProfile[] => {
  const requested = normalizeIdentity(query);
  if (!requested) return records.toSorted(byName);
  return records
    .filter((blackHole) =>
      [
        blackHole.name,
        blackHole.catalogDesignation,
        blackHole.host,
        blackHole.constellation ?? "",
        ...blackHole.aliases,
      ].some((identity) => normalizeIdentity(identity).includes(requested)),
    )
    .toSorted(byName);
};

export const mergeBlackHoles = (
  ...groups: readonly (readonly BlackHoleProfile[])[]
): BlackHoleProfile[] => {
  const merged = new Map<string, BlackHoleProfile>();
  for (const group of groups) {
    for (const blackHole of group) {
      const identity = normalizeIdentity(blackHole.name);
      if (!merged.has(identity)) merged.set(identity, blackHole);
    }
  }
  return [...merged.values()];
};
