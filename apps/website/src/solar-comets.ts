import type { IrregularBodyDescriptor, IrregularShapeAsset } from "./irregular-body.ts";

export interface CometProfile {
  activity: {
    dustTailCurvature: number;
    jets: readonly { latitudeDegrees: number; longitudeDegrees: number; source: string }[];
    onsetAu: number;
  };
  aliases: readonly string[];
  descriptor: IrregularBodyDescriptor;
  diameterKilometers: { uncertainty?: string; value: number };
  discovery: string;
  evidence: {
    activity: "observed-basis-simulation";
    geometry: "measured" | "measured-dimensions" | "modeled-fragment";
    surface: "partial-coverage" | "unresolved";
  };
  id: string;
  missionEncounters: readonly { date: string; mission: string; note: string }[];
  name: string;
  naifId: number;
  orbit: {
    class: string;
    eccentricity: number;
    inclinationDegrees: number;
    periodDays: number | null;
    perihelionAu: number;
    semiMajorAxisAu: number | null;
  };
  parent: "Jupiter" | "Sun";
  rotationHours: number | null;
  source: { apiVersion: "1.3"; originalUrl: string; retrievedOn: "2026-08-23" };
  spkId: string;
  summary: string;
  uncertaintyNote: string;
}

const RETRIEVED_ON = "2026-08-23" as const;
const source = (spkId: string): CometProfile["source"] => ({
  apiVersion: "1.3",
  originalUrl: `https://ssd-api.jpl.nasa.gov/sbdb.api?spk=${spkId}&phys-par=1`,
  retrievedOn: RETRIEVED_ON,
});
const asset = (
  path: string,
  triangleCount: number,
  sha256: string,
  naifId: number,
  spkId: string,
  mission: string,
  sourceName: string,
  credit: string,
  license: string,
  originalUrl: string,
): IrregularShapeAsset => ({
  format: "obj",
  path,
  provenance: {
    credit,
    license,
    mission,
    naifId,
    originalUrl,
    retrievalDate: RETRIEVED_ON,
    source: sourceName,
    spkId,
  },
  sha256,
  triangleCount,
});
const descriptor = (
  name: string,
  naifId: number,
  spkId: string,
  dimensions: readonly [number, number, number],
  periodHours: number | null,
  model?: IrregularShapeAsset,
): IrregularBodyDescriptor => ({
  dimensionsKilometers: { x: dimensions[0], y: dimensions[1], z: dimensions[2] },
  name,
  naifId,
  rotation: { axialTiltDegrees: null, periodHours, spinAxis: "z" },
  shapeModel: model ? { lods: [model], sourceKind: "mission-obj" } : undefined,
  spkId,
  surface: { albedoColor: [0.075, 0.068, 0.058], roughness: 0.98, treatment: "physically-neutral" },
});

const halley = asset(
  "/models/solar-system/comets/halley-stooke.obj",
  5_256,
  "49258d6a148a7871f2c21ddf40c37208594ed29a2b3333fd59983aee932a9e19",
  10_000_036,
  "1000036",
  "Giotto / Vega 1 / Vega 2",
  "NASA PDS Stooke Small Bodies Shape Models V1.0",
  "Philip Stooke and Alain Abergel; Giotto HMC and Vega TVS teams",
  "NASA PDS public data; cite DOI 10.26033/yt84-5y91",
  "https://sbnarchive.psi.edu/pds4/non_mission/small_bodies.stooke.shape-models/data/1682q1halley.tab",
);
const rosetta67p = asset(
  "/models/solar-system/comets/67p-rosetta.obj",
  104_192,
  "4118de78f47412e48bf9acc555d37ccbfb96ea9780c49adcf9ca422f238d2b76",
  10_000_012,
  "1000012",
  "Rosetta",
  "ESA PSA / NASA PDS Rosetta 67P Shape Models V2.0 · SPC_ESA MTP019 low-resolution product",
  "ESA/Rosetta/NAVCAM; ESA Flight Dynamics",
  "ESA archive scientific product; cite RO-C-MULTI-5-67P-SHAPE-V2.0",
  "https://pdssbn.astro.umd.edu/holdings/ro-c-multi-5-67p-shape-v2.0/data/triplate/spc_esa/mtp019/cshp_dv_130_01_lores_obj.obj",
);
const tempel1 = asset(
  "/models/solar-system/comets/tempel1-mission.obj",
  32_040,
  "20b85539bfcf123a7463d7a8b700acd83b48508047e267c93971ec352e9ef4ab",
  10_000_093,
  "1000093",
  "Deep Impact / Stardust-NExT",
  "NASA PDS Plate Shape Model of 9P/Tempel 1 V2.0",
  "Tony Farnham and Peter Thomas; Deep Impact and Stardust-NExT teams",
  "NASA PDS public data; cite DIF-C-HRIV/ITS/MRI-5-TEMPEL1-SHAPE-V2.0",
  "https://pdssbn.astro.umd.edu/holdings/dif-c-hriv_its_mri-5-tempel1-shape-v2.0/data/tempel1_2012_cart.wrl",
);
const wild2 = asset(
  "/models/solar-system/comets/wild2-stardust.obj",
  12_364,
  "d470f61543ccd24b6c4a875042cd18f291a0d4fd0a2c7bf6b11c414ac34b6437",
  10_000_107,
  "1000107",
  "Stardust",
  "NASA PDS Stardust NAVCAM Wild 2 Shape Model V2.1 · measured-coverage plates",
  "Tony Farnham, T. Duxbury, R. Kirk and the Stardust team",
  "NASA PDS public data; cite SDU-C-NAVCAM-5-WILD2-SHAPE-MODEL-V2.1",
  "https://pdssbn.astro.umd.edu/holdings/sdu-c-navcam-5-wild2-shape-model-v2.1/data/wild2_cart_full.tab",
);

export const SOLAR_SYSTEM_COMETS: readonly CometProfile[] = [
  {
    activity: { dustTailCurvature: 0.52, jets: [], onsetAu: 3.2 },
    aliases: ["1P", "Halley", "1P/Halley"],
    descriptor: descriptor("1P/Halley", 10_000_036, "1000036", [15.3, 7.2, 7.2], 52.8, halley),
    diameterKilometers: { value: 11 },
    discovery: "Recorded since antiquity; Edmond Halley identified its periodic return in 1705.",
    evidence: {
      activity: "observed-basis-simulation",
      geometry: "measured",
      surface: "partial-coverage",
    },
    id: "comet-halley",
    missionEncounters: [
      {
        date: "1986",
        mission: "Giotto, Vega 1/2 and Halley Armada",
        note: "First resolved nucleus imaging and in-situ coma measurements.",
      },
    ],
    name: "1P/Halley",
    naifId: 10_000_036,
    orbit: {
      class: "Halley-type comet · retrograde",
      eccentricity: 0.968,
      inclinationDegrees: 162,
      periodDays: 27_700,
      perihelionAu: 0.575,
      semiMajorAxisAu: 17.9,
    },
    parent: "Sun",
    rotationHours: 52.8,
    source: source("1000036"),
    spkId: "1000036",
    summary:
      "The archetypal periodic comet, shown with its uncertain Giotto/Vega-derived nucleus model.",
    uncertaintyNote:
      "The PDS model reports roughly 0.5–1 km absolute radial uncertainty because much of the dark nucleus was poorly illuminated.",
  },
  {
    activity: {
      dustTailCurvature: 0.38,
      jets: [
        {
          latitudeDegrees: 18,
          longitudeDegrees: 105,
          source: "Rosetta observed recurring neck-region activity",
        },
      ],
      onsetAu: 3.5,
    },
    aliases: ["67P", "Churyumov-Gerasimenko", "67P/Churyumov-Gerasimenko"],
    descriptor: descriptor(
      "67P/Churyumov–Gerasimenko",
      10_000_012,
      "1000012",
      [4.3, 4.1, 2.6],
      12.76129,
      rosetta67p,
    ),
    diameterKilometers: { uncertainty: "±0.1 km", value: 3.4 },
    discovery: "Discovered by Klim Churyumov and Svetlana Gerasimenko in 1969.",
    evidence: {
      activity: "observed-basis-simulation",
      geometry: "measured",
      surface: "partial-coverage",
    },
    id: "comet-67p",
    missionEncounters: [
      {
        date: "2014–2016",
        mission: "Rosetta / Philae",
        note: "Orbited through perihelion; Philae made the first comet landing.",
      },
    ],
    name: "67P/Churyumov–Gerasimenko",
    naifId: 10_000_012,
    orbit: {
      class: "Jupiter-family comet",
      eccentricity: 0.641,
      inclinationDegrees: 7.04,
      periodDays: 2_350,
      perihelionAu: 1.24,
      semiMajorAxisAu: 3.46,
    },
    parent: "Sun",
    rotationHours: 12.76129,
    source: source("1000012"),
    spkId: "1000012",
    summary: "Rosetta’s bilobed world, rendered from the archived ESA flight-dynamics plate model.",
    uncertaintyNote:
      "The nucleus geometry is measured; the animated coma, tails, and representative neck jet are simulations scaled by heliocentric distance.",
  },
  {
    activity: {
      dustTailCurvature: 0.45,
      jets: [
        {
          latitudeDegrees: 12,
          longitudeDegrees: 240,
          source: "Deep Impact approach images show localized source regions",
        },
      ],
      onsetAu: 2.8,
    },
    aliases: ["9P", "Tempel 1", "9P/Tempel 1"],
    descriptor: descriptor("9P/Tempel 1", 10_000_093, "1000093", [7.6, 4.9, 4.9], 40.7, tempel1),
    diameterKilometers: { uncertainty: "±0.2 km", value: 6 },
    discovery: "Discovered by Wilhelm Tempel in 1867.",
    evidence: {
      activity: "observed-basis-simulation",
      geometry: "measured",
      surface: "partial-coverage",
    },
    id: "comet-tempel-1",
    missionEncounters: [
      {
        date: "2005",
        mission: "Deep Impact",
        note: "Impactor excavated subsurface material while the flyby spacecraft observed.",
      },
      {
        date: "2011",
        mission: "Stardust-NExT",
        note: "Second encounter completed additional nucleus coverage.",
      },
    ],
    name: "9P/Tempel 1",
    naifId: 10_000_093,
    orbit: {
      class: "Jupiter-family comet",
      eccentricity: 0.51,
      inclinationDegrees: 10.5,
      periodDays: 2_040,
      perihelionAu: 1.54,
      semiMajorAxisAu: 3.15,
    },
    parent: "Sun",
    rotationHours: 40.7,
    source: source("1000093"),
    spkId: "1000093",
    summary: "The nucleus struck by Deep Impact and revisited by Stardust-NExT.",
    uncertaintyNote:
      "PDS reports about 60 m radial uncertainty in control-point regions, 100 m at silhouettes, and as much as 100–300 m where neither constrains the model.",
  },
  {
    activity: {
      dustTailCurvature: 0.43,
      jets: [
        {
          latitudeDegrees: -5,
          longitudeDegrees: 150,
          source: "Stardust observed collimated dust jets",
        },
      ],
      onsetAu: 2.7,
    },
    aliases: ["81P", "Wild 2", "81P/Wild 2"],
    descriptor: descriptor("81P/Wild 2", 10_000_107, "1000107", [5.5, 4, 3.3], 13.5, wild2),
    diameterKilometers: { value: 4 },
    discovery: "Discovered by Paul Wild in 1978.",
    evidence: {
      activity: "observed-basis-simulation",
      geometry: "measured",
      surface: "partial-coverage",
    },
    id: "comet-wild-2",
    missionEncounters: [
      {
        date: "2004",
        mission: "Stardust",
        note: "Imaged the nucleus and collected coma grains later returned to Earth.",
      },
    ],
    name: "81P/Wild 2",
    naifId: 10_000_107,
    orbit: {
      class: "Jupiter-family comet",
      eccentricity: 0.537,
      inclinationDegrees: 3.24,
      periodDays: 2_340,
      perihelionAu: 1.6,
      semiMajorAxisAu: 3.45,
    },
    parent: "Sun",
    rotationHours: 13.5,
    source: source("1000107"),
    spkId: "1000107",
    summary: "Stardust’s sample-return comet, with steep scarps and jet source regions.",
    uncertaintyNote:
      "Only PDS plates flagged as mission-derived are rendered. Ellipsoid-filled and transition plates are omitted, leaving the real unmeasured coverage open.",
  },
  {
    activity: {
      dustTailCurvature: 0.3,
      jets: [
        {
          latitudeDegrees: 20,
          longitudeDegrees: 35,
          source: "Deep Space 1 observed a dominant sunward jet",
        },
      ],
      onsetAu: 3,
    },
    aliases: ["19P", "Borrelly", "19P/Borrelly"],
    descriptor: descriptor("19P/Borrelly", 10_000_005, "1000005", [8, 4, 4], 25),
    diameterKilometers: { value: 4.8 },
    discovery: "Discovered by Alphonse Borrelly in 1904.",
    evidence: {
      activity: "observed-basis-simulation",
      geometry: "measured-dimensions",
      surface: "partial-coverage",
    },
    id: "comet-borrelly",
    missionEncounters: [
      {
        date: "2001",
        mission: "Deep Space 1",
        note: "Imaged the elongated nucleus and its dominant jet.",
      },
    ],
    name: "19P/Borrelly",
    naifId: 10_000_005,
    orbit: {
      class: "Jupiter-family comet",
      eccentricity: 0.638,
      inclinationDegrees: 29.3,
      periodDays: 2_500,
      perihelionAu: 1.31,
      semiMajorAxisAu: 3.61,
    },
    parent: "Sun",
    rotationHours: 25,
    source: source("1000005"),
    spkId: "1000005",
    summary: "Deep Space 1’s dark, elongated nucleus and strongly localized jet.",
    uncertaintyNote:
      "Official DEMs cover only the illuminated encounter hemisphere. Exora preserves that limitation by using a measured-dimensions neutral silhouette rather than pretending the DEM is global.",
  },
  {
    activity: { dustTailCurvature: 0.68, jets: [], onsetAu: 7 },
    aliases: ["Hale-Bopp", "C/1995 O1", "C/1995 O1 Hale-Bopp"],
    descriptor: descriptor("C/1995 O1 Hale–Bopp", 10_000_132, "1000132", [60, 60, 60], 11.35),
    diameterKilometers: { uncertainty: "±20 km", value: 60 },
    discovery: "Discovered independently by Alan Hale and Thomas Bopp in 1995.",
    evidence: {
      activity: "observed-basis-simulation",
      geometry: "measured-dimensions",
      surface: "unresolved",
    },
    id: "comet-hale-bopp",
    missionEncounters: [],
    name: "C/1995 O1 Hale–Bopp",
    naifId: 10_000_132,
    orbit: {
      class: "Long-period comet",
      eccentricity: 0.995,
      inclinationDegrees: 89.3,
      periodDays: 863_000,
      perihelionAu: 0.891,
      semiMajorAxisAu: 177,
    },
    parent: "Sun",
    rotationHours: 11.35,
    source: source("1000132"),
    spkId: "1000132",
    summary: "The exceptionally active great comet of 1997, observed for years around perihelion.",
    uncertaintyNote:
      "No spacecraft resolved its nucleus. The ±20 km SBDB diameter is shown as a neutral silhouette; all surrounding activity is simulated.",
  },
  {
    activity: { dustTailCurvature: 0.2, jets: [], onsetAu: 5 },
    aliases: ["Shoemaker-Levy 9", "SL9", "D/1993 F2"],
    descriptor: descriptor(
      "D/1993 F2 Shoemaker–Levy 9",
      10_000_190,
      "1000190",
      [2, 1.2, 1.2],
      null,
    ),
    diameterKilometers: { uncertainty: "fragment sizes poorly constrained", value: 2 },
    discovery:
      "Discovered by Carolyn and Eugene Shoemaker and David Levy in 1993 after tidal disruption by Jupiter.",
    evidence: {
      activity: "observed-basis-simulation",
      geometry: "modeled-fragment",
      surface: "unresolved",
    },
    id: "comet-sl9",
    missionEncounters: [
      {
        date: "1994-07-16–22",
        mission: "Galileo / Hubble / global observatories",
        note: "Observed the fragment train collide with Jupiter.",
      },
    ],
    name: "D/1993 F2 Shoemaker–Levy 9",
    naifId: 10_000_190,
    orbit: {
      class: "Disrupted Jupiter-family comet · temporarily captured",
      eccentricity: 0.21,
      inclinationDegrees: 5.89,
      periodDays: 6_500,
      perihelionAu: 5.38,
      semiMajorAxisAu: 6.81,
    },
    parent: "Jupiter",
    rotationHours: null,
    source: source("1000190"),
    spkId: "1000190",
    summary:
      "A tidally disrupted fragment train whose 1994 impacts transformed Jupiter’s atmosphere.",
    uncertaintyNote:
      "SPK 1000190 identifies fragment K, used as the representative catalog anchor. Fragment sizes and pre-impact shapes are unresolved; the silhouette is explicitly modeled, not measured.",
  },
] as const;

export const FEATURED_COMET_NAMES = SOLAR_SYSTEM_COMETS.map((comet) => comet.name);

export const findSolarComet = (query: string): CometProfile | undefined => {
  const normalized = query.trim().toLocaleLowerCase();
  return SOLAR_SYSTEM_COMETS.find(
    (comet) =>
      comet.name.toLocaleLowerCase() === normalized ||
      comet.spkId === normalized ||
      comet.aliases.some((alias) => alias.toLocaleLowerCase() === normalized),
  );
};

export const cometActivityAtDistance = (comet: CometProfile, distanceAu: number): number => {
  if (!Number.isFinite(distanceAu) || distanceAu <= 0 || distanceAu >= comet.activity.onsetAu)
    return 0;
  const normalized = (comet.activity.onsetAu - distanceAu) / comet.activity.onsetAu;
  return Math.min(1, Math.pow(normalized, 1.65) * 1.75);
};
