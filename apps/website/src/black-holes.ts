export type BlackHoleKind = "stellar-mass" | "supermassive" | "ultramassive";

export interface BlackHoleProfile {
  aliases: readonly string[];
  catalogDesignation: string;
  constellation: string;
  distanceLightYears: number | null;
  host: string;
  id: string;
  kind: BlackHoleKind;
  massSolar: number;
  massUncertaintySolar: number | null;
  milestone: string;
  name: string;
  observation: {
    accretion: "active" | "dormant" | "quiet";
    companion: string | null;
    redshift: number | null;
    summary: string;
  };
  source: {
    archive: string;
    measurement: string;
    retrievedOn: string;
    title: string;
    url: string;
  };
  visual: {
    diskActivity: number;
    diskHueDegrees: number;
    diskTiltDegrees: number;
    jetStrength: number;
    seed: number;
  };
}

/** Kilometres across a non-spinning event horizon per solar mass. */
const SCHWARZSCHILD_DIAMETER_KM_PER_SOLAR_MASS = 5.906_5;

/**
 * Five public landmarks, chosen for historical recognition and the quality of their measurements.
 *
 * A black hole is not a surface that can be textured from a photograph. The mass, distance and
 * classification below remain observational data; `visual` is deliberately kept separate as the
 * recipe for Exora's disclosed interpretation of the surrounding luminous matter.
 */
export const BLACK_HOLES: readonly BlackHoleProfile[] = [
  {
    aliases: ["Sgr A*", "Sag A*", "Sagittarius A-star"],
    catalogDesignation: "Sgr A*",
    constellation: "Sagittarius",
    distanceLightYears: 26_000,
    host: "Milky Way",
    id: "sagittarius-a-star",
    kind: "supermassive",
    massSolar: 4_300_000,
    massUncertaintySolar: null,
    milestone: "The black hole at the heart of our galaxy",
    name: "Sagittarius A*",
    observation: {
      accretion: "quiet",
      companion: null,
      redshift: null,
      summary:
        "The Milky Way’s central black hole. Stellar orbits reveal its mass, and the Event Horizon Telescope resolved its bright ring and shadow in 2022.",
    },
    source: {
      archive: "NASA / Event Horizon Telescope",
      measurement: "4.3 million solar masses · about 26,000 light-years",
      retrievedOn: "2026-08-24",
      title: "NASA animation sizes up the universe’s biggest black holes",
      url: "https://www.nasa.gov/universe/nasa-animation-sizes-up-the-universes-biggest-black-holes/",
    },
    visual: {
      diskActivity: 0.58,
      diskHueDegrees: 31,
      diskTiltDegrees: 24,
      jetStrength: 0,
      seed: 1_974,
    },
  },
  {
    aliases: ["M87", "Messier 87 black hole", "Virgo A black hole"],
    catalogDesignation: "M87*",
    constellation: "Virgo",
    distanceLightYears: 55_000_000,
    host: "Messier 87",
    id: "m87-star",
    kind: "supermassive",
    massSolar: 6_500_000_000,
    massUncertaintySolar: 700_000_000,
    milestone: "The first black hole ever imaged",
    name: "M87*",
    observation: {
      accretion: "active",
      companion: null,
      redshift: 0.004_28,
      summary:
        "The supermassive engine of the giant elliptical galaxy Messier 87. Its shadow became humanity’s first image of a black hole in 2019.",
    },
    source: {
      archive: "Event Horizon Telescope",
      measurement: "6.5 billion solar masses · 55 million light-years",
      retrievedOn: "2026-08-24",
      title: "Astronomers capture first image of a black hole",
      url: "https://eventhorizontelescope.org/press-release-april-10-2019-astronomers-capture-first-image-black-hole",
    },
    visual: {
      diskActivity: 0.88,
      diskHueDegrees: 24,
      diskTiltDegrees: 17,
      jetStrength: 1,
      seed: 2_019,
    },
  },
  {
    aliases: ["Tonantzintla 618", "FBQS J122824.9+312837"],
    catalogDesignation: "TON 618",
    constellation: "Canes Venatici",
    distanceLightYears: null,
    host: "Distant quasar host",
    id: "ton-618",
    kind: "ultramassive",
    massSolar: 66_000_000_000,
    massUncertaintySolar: null,
    milestone: "NASA’s most massive observed black hole",
    name: "TON 618",
    observation: {
      accretion: "active",
      companion: null,
      redshift: 2.219,
      summary:
        "An extraordinarily luminous quasar powered by an ultramassive black hole. Its quoted mass is an indirect estimate from the motion and light of surrounding gas.",
    },
    source: {
      archive: "NASA Science",
      measurement: "Estimated 66 billion solar masses",
      retrievedOn: "2026-08-24",
      title: "Black holes — essential facts",
      url: "https://science.nasa.gov/universe/black-holes/",
    },
    visual: {
      diskActivity: 1,
      diskHueDegrees: 42,
      diskTiltDegrees: 36,
      jetStrength: 0.38,
      seed: 618,
    },
  },
  {
    aliases: ["Cyg X-1", "HDE 226868"],
    catalogDesignation: "Cygnus X-1",
    constellation: "Cygnus",
    distanceLightYears: 7_240,
    host: "HDE 226868 binary",
    id: "cygnus-x-1",
    kind: "stellar-mass",
    massSolar: 21.2,
    massUncertaintySolar: 2.2,
    milestone: "The first widely accepted stellar black hole",
    name: "Cygnus X-1",
    observation: {
      accretion: "active",
      companion: "Blue supergiant HDE 226868",
      redshift: null,
      summary:
        "A wind-fed X-ray binary and the first object broadly accepted as a black hole. Radio astrometry refined both its distance and unexpectedly high mass.",
    },
    source: {
      archive: "Science / PubMed",
      measurement: "21.2 ± 2.2 solar masses · 2.22 +0.18/−0.17 kiloparsecs",
      retrievedOn: "2026-08-24",
      title: "Cygnus X-1 contains a 21-solar-mass black hole",
      url: "https://pubmed.ncbi.nlm.nih.gov/33602863/",
    },
    visual: {
      diskActivity: 0.82,
      diskHueDegrees: 202,
      diskTiltDegrees: 28,
      jetStrength: 0.3,
      seed: 1,
    },
  },
  {
    aliases: ["Gaia DR3 4373465352415301632"],
    catalogDesignation: "Gaia BH1",
    constellation: "Ophiuchus",
    distanceLightYears: 1_560,
    host: "Wide Sun-like binary",
    id: "gaia-bh1",
    kind: "stellar-mass",
    massSolar: 10,
    massUncertaintySolar: null,
    milestone: "The nearest known black hole",
    name: "Gaia BH1",
    observation: {
      accretion: "dormant",
      companion: "Sun-like star",
      redshift: null,
      summary:
        "A dormant black hole found through the wobble of its visible companion. With no bright accretion flow, it is detected by gravity rather than emitted light.",
    },
    source: {
      archive: "European Space Agency / Gaia",
      measurement: "Approximately 10 solar masses · 1,560 light-years",
      retrievedOn: "2026-08-24",
      title: "Gaia discovers a new family of black holes",
      url: "https://www.esa.int/Science_Exploration/Space_Science/Gaia/Gaia_discovers_a_new_family_of_black_holes",
    },
    visual: {
      diskActivity: 0.08,
      diskHueDegrees: 214,
      diskTiltDegrees: 12,
      jetStrength: 0,
      seed: 2_022,
    },
  },
] as const;

export const FEATURED_BLACK_HOLE_NAMES: readonly string[] = BLACK_HOLES.map(({ name }) => name);

const normalizeIdentity = (value: string): string =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, "");

export const findBlackHole = (value: string): BlackHoleProfile | undefined => {
  const requested = normalizeIdentity(value);
  return BLACK_HOLES.find((blackHole) =>
    [blackHole.name, blackHole.catalogDesignation, ...blackHole.aliases].some(
      (identity) => normalizeIdentity(identity) === requested,
    ),
  );
};

/** A non-spinning reference diameter, not a claim that the black hole's spin is known. */
export const schwarzschildDiameterKilometers = (blackHole: BlackHoleProfile): number =>
  blackHole.massSolar * SCHWARZSCHILD_DIAMETER_KM_PER_SOLAR_MASS;

export const blackHoleKindLabel = (blackHole: BlackHoleProfile): string =>
  blackHole.kind.replace("-", " ");

export const formatBlackHoleMass = (massSolar: number): string => {
  if (massSolar >= 1_000_000_000) return `${(massSolar / 1_000_000_000).toFixed(1)} billion M☉`;
  if (massSolar >= 1_000_000) return `${(massSolar / 1_000_000).toFixed(1)} million M☉`;
  return `${massSolar.toLocaleString("en-US", { maximumFractionDigits: 1 })} M☉`;
};
