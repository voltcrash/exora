import type {
  IrregularBodyDescriptor,
  IrregularShapeAsset,
  ScientificAssetProvenance,
} from "./irregular-body.ts";

export type AsteroidEvidenceKind = "derived" | "measured" | "modeled" | "unresolved";

export interface AsteroidMeasurement {
  note?: string;
  uncertainty?: string;
  value: number;
}

export interface AsteroidMissionEncounter {
  date: string;
  mission: string;
  note: string;
  status: "completed" | "upcoming";
}

export interface AsteroidProfile {
  aliases: readonly string[];
  closeApproach?: {
    date: string;
    distanceAu: number;
    maximumAu: number;
    minimumAu: number;
    relativeVelocityKilometersPerSecond: number;
    sigmaTimeDays: number;
  };
  companionIds: readonly string[];
  descriptor: IrregularBodyDescriptor;
  diameterKilometers: AsteroidMeasurement;
  discovery: string;
  evidence: {
    geometry: AsteroidEvidenceKind;
    orbit: AsteroidEvidenceKind;
    surface: AsteroidEvidenceKind;
  };
  featuredSystem: boolean;
  id: string;
  missionEncounters: readonly AsteroidMissionEncounter[];
  naifId: number;
  name: string;
  orbit: {
    class: string;
    conditionCode: number | null;
    eccentricity: number | null;
    inclinationDegrees: number | null;
    periodDays: number | null;
    semiMajorAxisAu: number | null;
  };
  parent: string;
  potentiallyHazardous: boolean | null;
  rotationHours: AsteroidMeasurement;
  source: {
    api: string;
    apiVersion: string;
    originalUrl: string;
    retrievedOn: string;
  };
  spectralType: string | null;
  spkId: string;
  summary: string;
  uncertaintyNote: string;
}

const RETRIEVED_ON = "2026-08-23";

const provenance = (
  naifId: number,
  spkId: string,
  mission: string,
  source: string,
  credit: string,
  license: string,
  originalUrl: string,
): ScientificAssetProvenance => ({
  credit,
  license,
  mission,
  naifId,
  originalUrl,
  retrievalDate: RETRIEVED_ON,
  source,
  spkId,
});

const model = (
  format: IrregularShapeAsset["format"],
  path: string,
  triangleCount: number,
  sha256: string,
  assetProvenance: ScientificAssetProvenance,
): IrregularShapeAsset => ({
  format,
  path,
  provenance: assetProvenance,
  sha256,
  triangleCount,
});

const sbdbSource = (spkId: string) => ({
  api: "NASA/JPL Small-Body Database (SBDB) API",
  apiVersion: "1.3",
  originalUrl: `https://ssd-api.jpl.nasa.gov/sbdb.api?spk=${spkId}&phys-par=1`,
  retrievedOn: RETRIEVED_ON,
});

const neutralSurface = (
  albedoColor: readonly [number, number, number],
  roughness = 0.96,
): IrregularBodyDescriptor["surface"] => ({
  albedoColor,
  roughness,
  treatment: "physically-neutral",
});

const VESTA_NAIF = 2_000_004;
const BENNU_NAIF = 2_101_955;
const RYUGU_NAIF = 2_162_173;
const EROS_NAIF = 2_000_433;
const ITOKAWA_NAIF = 2_025_143;
const IDA_NAIF = 2_431_010;
const DACTYL_NAIF = 2_431_011;
const DIDYMOS_NAIF = 920_065_803;
const DIMORPHOS_NAIF = 120_065_803;
const PSYCHE_NAIF = 2_000_016;
const APOPHIS_NAIF = 2_099_942;

const vestaModel = model(
  "stl",
  "/models/solar-system/asteroids/vesta-dawn-a.stl",
  800_000,
  "a20fbfc9378398fd157ad0421ceead4dff277f5d545aa7c86d7e14eaa160fe46",
  provenance(
    VESTA_NAIF,
    "20000004",
    "Dawn",
    "NASA 3D Resources · Dawn-derived Vesta model",
    "NASA/JPL-Caltech/UCLA/MPS/DLR/IDA",
    "NASA media usage guidelines; U.S. Government work, free of copyright",
    "https://github.com/nasa/NASA-3D-Resources/blob/master/3D%20Printing/Asteroid%204%20Vesta%20(A)/Asteroid%204%20Vesta%20(A).stl",
  ),
);

const bennuModel = model(
  "obj",
  "/models/solar-system/asteroids/bennu-spo-v54.obj",
  12_288,
  "16bfb2cb054efce787800f544468ba01e4d4ab005d015989fb5396a8d58307b4",
  provenance(
    BENNU_NAIF,
    "20101955",
    "OSIRIS-REx",
    "NASA PDS OSIRIS-REx Altimetry Working Group · SPO v54 global terrain model",
    "M. Daly, O. Barnouin, R. Espiritu, D. Lauretta and the OSIRIS-REx team",
    "NASA PDS public data; cite DOI 10.26033/pzcf-qs69",
    "https://sbnarchive.psi.edu/pds4/orex/orex.altimetry/data_derived_altimetry_global_models/global_digital_terrain_models/SPOv54/g_12620mm_spo_obj_0000n00000_v054.obj",
  ),
);

const bennuModel49k = model(
  "obj",
  "/models/solar-system/asteroids/bennu-spo-v54-49k.obj",
  49_152,
  "7f7d91d049874d76e81c350e3567a141d54f58f68d4516684176fbf7bb64b2e2",
  provenance(
    BENNU_NAIF,
    "20101955",
    "OSIRIS-REx",
    "NASA PDS OSIRIS-REx Altimetry Working Group · SPO v54 global terrain model",
    "M. Daly, O. Barnouin, R. Espiritu, D. Lauretta and the OSIRIS-REx team",
    "NASA PDS public data; cite DOI 10.26033/pzcf-qs69",
    "https://sbnarchive.psi.edu/pds4/orex/orex.altimetry/data_derived_altimetry_global_models/global_digital_terrain_models/SPOv54/g_06320mm_spo_obj_0000n00000_v054.obj",
  ),
);

const ryuguModel = model(
  "obj",
  "/models/solar-system/asteroids/ryugu-sfm-49k.obj",
  49_152,
  "7d66c54b3e68253b27918a82e32c4b8bffc0702e016e036bc5d0eb334c8d9962",
  provenance(
    RYUGU_NAIF,
    "20162173",
    "Hayabusa2",
    "JAXA DARTS · SHAPE_SFM_49k_v20180804",
    "JAXA/University of Aizu/Kobe University; Watanabe et al. (2019)",
    "JAXA DARTS scientific data, provided as-is; citation required",
    "https://data.darts.isas.jaxa.jp/pub/hayabusa2/paper/Watanabe_2019/SHAPE_SFM_49k_v20180804.obj",
  ),
);

const erosModel = model(
  "obj",
  "/models/solar-system/asteroids/eros-near.obj",
  49_152,
  "da31d242d836a8c175a8e141aed7e07ed2e76635e2f6b2aaa6851edb11598b9f",
  provenance(
    EROS_NAIF,
    "20000433",
    "NEAR Shoemaker",
    "NASA PDS Small Bodies Node · Gaskell Eros Shape Model V1.1, 64q vertex/plate model",
    "Robert Gaskell; NEAR MSI; OBJ conversion by Exora without smoothing",
    "NASA PDS public data; cite bundle urn:nasa:pds:gaskell.ast-eros.shape-model",
    "https://sbnarchive.psi.edu/pds4/non_mission/gaskell.ast-eros.shape-model_V1_1/data/vertex/ver64q.tab",
  ),
);

const itokawaModel = model(
  "obj",
  "/models/solar-system/asteroids/itokawa-hayabusa.obj",
  49_152,
  "c948399e83c351ce83d9fc932a9bce6b25672159cdb3e71a4d551db9616412db",
  provenance(
    ITOKAWA_NAIF,
    "20025143",
    "Hayabusa",
    "NASA PDS Small Bodies Node · Gaskell Itokawa Shape Model V1.1, 64q vertex/plate model",
    "R. Gaskell et al.; Hayabusa AMICA; OBJ conversion by Exora without smoothing",
    "NASA PDS public data; cite bundle urn:nasa:pds:gaskell.ast-itokawa.shape-model",
    "https://sbnarchive.psi.edu/pds4/non_mission/gaskell.ast-itokawa.shape-model_V1_1/data/vertex/ver64q.tab",
  ),
);

const idaModel = model(
  "obj",
  "/models/solar-system/asteroids/ida-galileo.obj",
  32_580,
  "77391dc4ced5cd40b1d1be9be5231caeaea90f608f7ee52b543751fd4267cdf3",
  provenance(
    IDA_NAIF,
    "20000243",
    "Galileo",
    "NASA PDS Small Bodies Node · Thomas optical radial shape model, OBJ conversion",
    "P. C. Thomas et al.; Galileo SSI; OBJ conversion by Exora without smoothing",
    "NASA PDS public data; cite DOI 10.26033/g5e0-kh52",
    "https://sbnarchive.psi.edu/pds4/non_mission/ast-sat.thomas.shape-models_V1_0/data/243ida.tab",
  ),
);

const didymosModel = model(
  "obj",
  "/models/solar-system/asteroids/didymos-dart-v003.obj",
  49_152,
  "ac1f51b06cedcf197d7df88888be729255ef604137a3157219e93a9bcd5115a6",
  provenance(
    DIDYMOS_NAIF,
    "20065803",
    "DART",
    "NASA PDS DART Shape Model · Didymos global SPC v003",
    "DART Altimetry Working Group; Daly, Barnouin, Ernst et al.",
    "NASA PDS public data; cite DOI 10.26007/bm57-x327",
    "https://pdssbn.astro.umd.edu/holdings/pds4-dart_shapemodel-v1.0/data_derived_didymos_model_v003/didymos_g_9309mm_spc_obj_0000n00000_v003.obj",
  ),
);

const dimorphosModel = model(
  "obj",
  "/models/solar-system/asteroids/dimorphos-dart-v004.obj",
  49_152,
  "134bbaf72bf8f6505d67cbcfd695708b7cf64ec6e27de95775914c93efbeb487",
  provenance(
    DIMORPHOS_NAIF,
    "120065803",
    "DART",
    "NASA PDS DART Shape Model · final pre-impact Dimorphos global SPC v004",
    "DART Altimetry Working Group; Daly, Barnouin, Ernst et al.",
    "NASA PDS public data; cite DOI 10.26007/0nss-vd15",
    "https://pdssbn.astro.umd.edu/holdings/pds4-dart_shapemodel-v1.0/data_derived_dimorphos_model_v004/dimorphos_g_1940mm_spc_obj_0000n00000_v004.obj",
  ),
);

export const SOLAR_SYSTEM_ASTEROIDS: readonly AsteroidProfile[] = [
  {
    aliases: ["4 Vesta", "Vesta"],
    companionIds: [],
    descriptor: {
      dimensionsKilometers: { x: 569.24, y: 554.48, z: 452.66 },
      name: "4 Vesta",
      naifId: VESTA_NAIF,
      rotation: { axialTiltDegrees: 27.5, periodHours: 5.3421276322, spinAxis: "z" },
      shapeModel: { lods: [vestaModel], sourceKind: "mission-stl" },
      spkId: "20000004",
      surface: neutralSurface([0.28, 0.26, 0.24], 0.9),
    },
    diameterKilometers: { value: 522.77 },
    discovery: "Discovered by Heinrich Wilhelm Olbers on 29 March 1807.",
    evidence: { geometry: "measured", orbit: "measured", surface: "unresolved" },
    featuredSystem: true,
    id: "asteroid-vesta",
    missionEncounters: [
      {
        date: "2011–2012",
        mission: "Dawn",
        note: "Orbited and globally mapped Vesta.",
        status: "completed",
      },
    ],
    naifId: VESTA_NAIF,
    name: "4 Vesta",
    orbit: {
      class: "Main-belt asteroid",
      conditionCode: 0,
      eccentricity: 0.0902037438,
      inclinationDegrees: 7.143925545,
      periodDays: 1325.389043,
      semiMajorAxisAu: 2.3613659651,
    },
    parent: "Sun",
    potentiallyHazardous: false,
    rotationHours: { value: 5.3421276322 },
    source: sbdbSource("20000004"),
    spectralType: "V",
    spkId: "20000004",
    summary:
      "A differentiated protoplanet whose south-polar Rheasilvia basin exposes deep crustal history.",
    uncertaintyNote:
      "Orbit condition code 0. Dawn geometry is measured; this view uses a neutral material, not invented color geography.",
  },
  {
    aliases: ["101955 Bennu", "Bennu", "1999 RQ36"],
    companionIds: [],
    descriptor: {
      dimensionsKilometers: { x: 0.57044, y: 0.54813, z: 0.49541 },
      name: "101955 Bennu",
      naifId: BENNU_NAIF,
      rotation: { axialTiltDegrees: 177.6, periodHours: 4.296061, spinAxis: "z" },
      shapeModel: { lods: [bennuModel49k, bennuModel], sourceKind: "mission-obj" },
      spkId: "20101955",
      surface: neutralSurface([0.055, 0.052, 0.049]),
    },
    diameterKilometers: { value: 0.48444 },
    discovery: "Discovered by LINEAR on 11 September 1999; provisional designation 1999 RQ36.",
    evidence: { geometry: "measured", orbit: "measured", surface: "unresolved" },
    featuredSystem: true,
    id: "asteroid-bennu",
    missionEncounters: [
      {
        date: "2018–2021",
        mission: "OSIRIS-REx",
        note: "Surveyed, sampled at Nightingale, and departed for Earth.",
        status: "completed",
      },
      {
        date: "2023-09-24",
        mission: "OSIRIS-REx",
        note: "Sample return capsule landed in Utah.",
        status: "completed",
      },
    ],
    naifId: BENNU_NAIF,
    name: "101955 Bennu",
    orbit: {
      class: "Apollo near-Earth asteroid",
      conditionCode: 0,
      eccentricity: 0.20374508,
      inclinationDegrees: 6.03494377,
      periodDays: 436.648728,
      semiMajorAxisAu: 1.126391,
    },
    parent: "Sun",
    potentiallyHazardous: true,
    rotationHours: {
      note: "A small measured spin acceleration is retained in the data record but not exaggerated visually.",
      value: 4.296061,
    },
    source: sbdbSource("20101955"),
    spectralType: "B",
    spkId: "20101955",
    summary:
      "The carbon-rich rubble pile sampled by OSIRIS-REx, rendered from the final mission terrain model.",
    uncertaintyNote:
      "Orbit condition code 0. Model axes come from the archived SPO v54 mesh; effective diameter is the SBDB value.",
  },
  {
    aliases: ["162173 Ryugu", "Ryugu", "1999 JU3"],
    companionIds: [],
    descriptor: {
      dimensionsKilometers: { x: 1.01857, y: 1.0192, z: 0.96426 },
      name: "162173 Ryugu",
      naifId: RYUGU_NAIF,
      rotation: { axialTiltDegrees: 171.6, periodHours: 7.63262, spinAxis: "z" },
      shapeModel: { lods: [ryuguModel], sourceKind: "mission-obj" },
      spkId: "20162173",
      surface: neutralSurface([0.064, 0.06, 0.055]),
    },
    diameterKilometers: { value: 0.896 },
    discovery: "Discovered by LINEAR on 10 May 1999; provisional designation 1999 JU3.",
    evidence: { geometry: "measured", orbit: "measured", surface: "unresolved" },
    featuredSystem: true,
    id: "asteroid-ryugu",
    missionEncounters: [
      {
        date: "2018–2019",
        mission: "Hayabusa2",
        note: "Mapped, deployed landers, made an artificial crater, and sampled twice.",
        status: "completed",
      },
      {
        date: "2020-12-06",
        mission: "Hayabusa2",
        note: "Sample return capsule landed in Australia.",
        status: "completed",
      },
    ],
    naifId: RYUGU_NAIF,
    name: "162173 Ryugu",
    orbit: {
      class: "Apollo near-Earth asteroid",
      conditionCode: 0,
      eccentricity: 0.191073,
      inclinationDegrees: 5.86644249,
      periodDays: 474.702727,
      semiMajorAxisAu: 1.19091893,
    },
    parent: "Sun",
    potentiallyHazardous: true,
    rotationHours: { value: 7.63262 },
    source: sbdbSource("20162173"),
    spectralType: "Cb",
    spkId: "20162173",
    summary:
      "Hayabusa2’s carbon-rich spinning-top asteroid, preserved here as the official 49,152-plate SFM model.",
    uncertaintyNote:
      "Orbit condition code 0. Mesh bounds and SBDB effective diameter describe different measured shape summaries and are shown separately.",
  },
  {
    aliases: ["433 Eros", "Eros"],
    companionIds: [],
    descriptor: {
      dimensionsKilometers: { x: 34.4, y: 11.2, z: 11.2 },
      name: "433 Eros",
      naifId: EROS_NAIF,
      rotation: { axialTiltDegrees: 89, periodHours: 5.27, spinAxis: "z" },
      shapeModel: { lods: [erosModel], sourceKind: "mission-obj" },
      spkId: "20000433",
      surface: neutralSurface([0.24, 0.2, 0.16], 0.91),
    },
    diameterKilometers: { value: 16.84 },
    discovery:
      "Discovered independently by Carl Gustav Witt and Auguste Charlois on 13 August 1898.",
    evidence: { geometry: "measured", orbit: "measured", surface: "unresolved" },
    featuredSystem: true,
    id: "asteroid-eros",
    missionEncounters: [
      {
        date: "1998–2001",
        mission: "NEAR Shoemaker",
        note: "Flyby, year-long orbital survey, and controlled landing.",
        status: "completed",
      },
    ],
    naifId: EROS_NAIF,
    name: "433 Eros",
    orbit: {
      class: "Amor near-Earth asteroid",
      conditionCode: 0,
      eccentricity: 0.22287796,
      inclinationDegrees: 10.8285441,
      periodDays: 643.196389,
      semiMajorAxisAu: 1.4582437,
    },
    parent: "Sun",
    potentiallyHazardous: false,
    rotationHours: { value: 5.27 },
    source: sbdbSource("20000433"),
    spectralType: "S",
    spkId: "20000433",
    summary:
      "The elongated S-type asteroid that became the first asteroid orbited—and landed on—by a spacecraft.",
    uncertaintyNote:
      "Orbit condition code 0. NEAR measured the form; this asset does not claim a globally registered color mosaic.",
  },
  {
    aliases: ["25143 Itokawa", "Itokawa", "1998 SF36"],
    companionIds: [],
    descriptor: {
      dimensionsKilometers: { x: 0.535, y: 0.294, z: 0.209 },
      name: "25143 Itokawa",
      naifId: ITOKAWA_NAIF,
      rotation: { axialTiltDegrees: 178, periodHours: 12.132, spinAxis: "z" },
      shapeModel: { lods: [itokawaModel], sourceKind: "mission-obj" },
      spkId: "20025143",
      surface: neutralSurface([0.22, 0.19, 0.16]),
    },
    diameterKilometers: { value: 0.33 },
    discovery: "Discovered by LINEAR on 26 September 1998; named for Hideo Itokawa.",
    evidence: { geometry: "measured", orbit: "measured", surface: "unresolved" },
    featuredSystem: true,
    id: "asteroid-itokawa",
    missionEncounters: [
      {
        date: "2005",
        mission: "Hayabusa",
        note: "Surveyed and sampled the rubble-pile surface.",
        status: "completed",
      },
      {
        date: "2010-06-13",
        mission: "Hayabusa",
        note: "Returned the first asteroid surface grains to Earth.",
        status: "completed",
      },
    ],
    naifId: ITOKAWA_NAIF,
    name: "25143 Itokawa",
    orbit: {
      class: "Apollo near-Earth asteroid",
      conditionCode: 0,
      eccentricity: 0.28017764,
      inclinationDegrees: 1.62094081,
      periodDays: 556.488417,
      semiMajorAxisAu: 1.32405228,
    },
    parent: "Sun",
    potentiallyHazardous: true,
    rotationHours: { value: 12.132 },
    source: sbdbSource("20025143"),
    spectralType: "S(IV)",
    spkId: "20025143",
    summary:
      "Hayabusa revealed this contact-like rubble pile’s smooth neck and boulder-rich highlands.",
    uncertaintyNote:
      "Orbit condition code 0. Mission geometry is measured; the neutral material avoids fabricating unmapped color coverage.",
  },
  {
    aliases: ["243 Ida", "Ida"],
    companionIds: ["asteroid-dactyl"],
    descriptor: {
      dimensionsKilometers: { x: 57.9958, y: 22.6643, z: 30.1497 },
      name: "243 Ida",
      naifId: IDA_NAIF,
      rotation: { axialTiltDegrees: null, periodHours: 4.634, spinAxis: "y" },
      shapeModel: { lods: [idaModel], sourceKind: "derived-mission-grid" },
      spkId: "20000243",
      surface: neutralSurface([0.24, 0.19, 0.14]),
    },
    diameterKilometers: { value: 32 },
    discovery: "Discovered by Johann Palisa on 29 September 1884.",
    evidence: { geometry: "measured", orbit: "measured", surface: "unresolved" },
    featuredSystem: true,
    id: "asteroid-ida",
    missionEncounters: [
      {
        date: "1993-08-28",
        mission: "Galileo",
        note: "Flew within about 2,400 km and discovered Dactyl in returned images.",
        status: "completed",
      },
    ],
    naifId: IDA_NAIF,
    name: "243 Ida",
    orbit: {
      class: "Koronis-family main-belt asteroid",
      conditionCode: 0,
      eccentricity: 0.04610963,
      inclinationDegrees: 1.1303631,
      periodDays: 1769.740683,
      semiMajorAxisAu: 2.86334803,
    },
    parent: "Sun",
    potentiallyHazardous: false,
    rotationHours: { value: 4.634 },
    source: sbdbSource("20000243"),
    spectralType: "S",
    spkId: "20000243",
    summary:
      "Galileo’s cratered main-belt flyby target and the first asteroid found to possess a moon.",
    uncertaintyNote:
      "Orbit condition code 0. The radial Galileo model is converted sample-for-sample without smoothing; Dactyl remains separately unresolved.",
  },
  {
    aliases: ["Dactyl", "(243) Ida I Dactyl"],
    companionIds: [],
    descriptor: {
      dimensionsKilometers: { x: 1.6, y: 1.4, z: 1.2 },
      name: "Dactyl",
      naifId: DACTYL_NAIF,
      rotation: { axialTiltDegrees: null, periodHours: null },
      spkId: "2431011",
      surface: neutralSurface([0.2, 0.18, 0.16]),
    },
    diameterKilometers: {
      note: "Galileo images resolve only a small number of pixels.",
      uncertainty: "approximately 0.2 km",
      value: 1.4,
    },
    discovery: "Discovered by Ann Harch in Galileo images on 17 February 1994.",
    evidence: { geometry: "unresolved", orbit: "derived", surface: "unresolved" },
    featuredSystem: false,
    id: "asteroid-dactyl",
    missionEncounters: [
      {
        date: "1993-08-28",
        mission: "Galileo",
        note: "Imaged during the Ida flyby; discovery followed in 1994.",
        status: "completed",
      },
    ],
    naifId: DACTYL_NAIF,
    name: "Dactyl",
    orbit: {
      class: "Satellite of 243 Ida",
      conditionCode: null,
      eccentricity: null,
      inclinationDegrees: null,
      periodDays: null,
      semiMajorAxisAu: null,
    },
    parent: "243 Ida",
    potentiallyHazardous: false,
    rotationHours: {
      note: "No secure independent rotation solution is presented.",
      uncertainty: "unknown",
      value: 0,
    },
    source: {
      api: "NASA NAIF permanent body-ID registry",
      apiVersion: "N0067",
      originalUrl: "https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/naif_ids.html",
      retrievedOn: RETRIEVED_ON,
    },
    spectralType: "S-like",
    spkId: "2431011",
    summary:
      "Ida’s tiny moon, honestly shown as a measured-dimensions silhouette because Galileo did not map a global shape.",
    uncertaintyNote:
      "Sparse flyby images constrain size and a partial orbit, not detailed topography. No craters or surface markings are synthesized.",
  },
  {
    aliases: ["65803 Didymos", "Didymos", "1996 GT"],
    companionIds: ["asteroid-dimorphos"],
    descriptor: {
      dimensionsKilometers: { x: 0.81824, y: 0.80145, z: 0.60448 },
      name: "65803 Didymos",
      naifId: DIDYMOS_NAIF,
      rotation: { axialTiltDegrees: 167.7, periodHours: 2.2593, spinAxis: "z" },
      shapeModel: { lods: [didymosModel], sourceKind: "mission-obj" },
      spkId: "20065803",
      surface: neutralSurface([0.18, 0.16, 0.14]),
    },
    diameterKilometers: { value: 0.78 },
    discovery: "Discovered by Spacewatch on 11 April 1996.",
    evidence: { geometry: "measured", orbit: "measured", surface: "unresolved" },
    featuredSystem: true,
    id: "asteroid-didymos",
    missionEncounters: [
      {
        date: "2022-09-26",
        mission: "DART",
        note: "Observed while DART impacted the moon Dimorphos.",
        status: "completed",
      },
      {
        date: "2026-12",
        mission: "Hera",
        note: "ESA rendezvous currently planned; date remains schedule-dependent.",
        status: "upcoming",
      },
    ],
    naifId: DIDYMOS_NAIF,
    name: "65803 Didymos",
    orbit: {
      class: "Apollo binary near-Earth asteroid",
      conditionCode: 0,
      eccentricity: 0.3831233,
      inclinationDegrees: 3.4138765,
      periodDays: 769.023521,
      semiMajorAxisAu: 1.6427096,
    },
    parent: "Sun",
    potentiallyHazardous: true,
    rotationHours: { value: 2.2593 },
    source: sbdbSource("20065803"),
    spectralType: "S",
    spkId: "20065803",
    summary:
      "Primary of the binary system where DART demonstrated asteroid deflection by striking Dimorphos.",
    uncertaintyNote:
      "DART final shape uncertainty is about 14 m per axis and about 3.3% in volume; orbit condition code is 0.",
  },
  {
    aliases: ["Dimorphos", "Didymos I"],
    companionIds: [],
    descriptor: {
      dimensionsKilometers: { x: 0.17767, y: 0.16897, z: 0.11452 },
      name: "Dimorphos",
      naifId: DIMORPHOS_NAIF,
      rotation: { axialTiltDegrees: 167.7, periodHours: 11.3674, spinAxis: "z" },
      shapeModel: { lods: [dimorphosModel], sourceKind: "mission-obj" },
      spkId: "120065803",
      surface: neutralSurface([0.17, 0.15, 0.13]),
    },
    diameterKilometers: { uncertainty: "approximately ±0.003 km equivalent scale", value: 0.151 },
    discovery: "Discovered in Petr Pravec’s binary-system observations in November 2003.",
    evidence: { geometry: "measured", orbit: "derived", surface: "unresolved" },
    featuredSystem: false,
    id: "asteroid-dimorphos",
    missionEncounters: [
      {
        date: "2022-09-26",
        mission: "DART",
        note: "First body whose orbit humans deliberately changed by kinetic impact.",
        status: "completed",
      },
      {
        date: "2026-12",
        mission: "Hera",
        note: "ESA follow-up rendezvous currently planned.",
        status: "upcoming",
      },
    ],
    naifId: DIMORPHOS_NAIF,
    name: "Dimorphos",
    orbit: {
      class: "Satellite of 65803 Didymos",
      conditionCode: null,
      eccentricity: null,
      inclinationDegrees: null,
      periodDays: 0.473642,
      semiMajorAxisAu: null,
    },
    parent: "65803 Didymos",
    potentiallyHazardous: false,
    rotationHours: {
      note: "Post-impact orbital/rotation solution; the displayed v004 geometry is explicitly pre-impact.",
      value: 11.3674,
    },
    source: {
      api: "NASA PDS DART Shape Model bundle",
      apiVersion: "1.0",
      originalUrl: "https://pdssbn.astro.umd.edu/holdings/pds4-dart_shapemodel-v1.0/",
      retrievedOn: RETRIEVED_ON,
    },
    spectralType: "S-like",
    spkId: "120065803",
    summary:
      "DART’s target moon, rendered with the final mission pre-impact shape while post-impact timing is identified separately.",
    uncertaintyNote:
      "Final v004 pre-impact shape accuracy is about 1 m × 4 m × 1 m, with about 5% volume uncertainty; transient impact changes are not invented.",
  },
  {
    aliases: ["16 Psyche", "Psyche"],
    companionIds: [],
    descriptor: {
      dimensionsKilometers: { x: 278, y: 238, z: 171 },
      name: "16 Psyche",
      naifId: PSYCHE_NAIF,
      rotation: { axialTiltDegrees: null, periodHours: 4.196 },
      spkId: "20000016",
      surface: neutralSurface([0.22, 0.2, 0.19], 0.72),
    },
    diameterKilometers: { value: 222 },
    discovery: "Discovered by Annibale de Gasparis on 17 March 1852.",
    evidence: { geometry: "modeled", orbit: "measured", surface: "unresolved" },
    featuredSystem: true,
    id: "asteroid-psyche",
    missionEncounters: [
      {
        date: "2029-08",
        mission: "Psyche",
        note: "NASA spacecraft is scheduled to begin its prime orbital mission.",
        status: "upcoming",
      },
    ],
    naifId: PSYCHE_NAIF,
    name: "16 Psyche",
    orbit: {
      class: "Main-belt asteroid",
      conditionCode: 0,
      eccentricity: 0.13493247,
      inclinationDegrees: 3.0987491,
      periodDays: 1827.87996,
      semiMajorAxisAu: 2.92572047,
    },
    parent: "Sun",
    potentiallyHazardous: false,
    rotationHours: { value: 4.196 },
    source: sbdbSource("20000016"),
    spectralType: "M / X",
    spkId: "20000016",
    summary: "A metal-rich main-belt target still awaiting its first close spacecraft survey.",
    uncertaintyNote:
      "Dimensions combine radar, adaptive-optics, and occultation constraints. The silhouette is an ellipsoidal fallback, not a claimed surface model.",
  },
  {
    aliases: ["99942 Apophis", "Apophis", "2004 MN4"],
    closeApproach: {
      date: "2029-04-13",
      distanceAu: 0.000254090910419299,
      maximumAu: 0.000254112821017663,
      minimumAu: 0.000254068999976389,
      relativeVelocityKilometersPerSecond: 7.4225389568,
      sigmaTimeDays: 0.001955,
    },
    companionIds: [],
    descriptor: {
      dimensionsKilometers: { x: 0.45, y: 0.31, z: 0.17 },
      name: "99942 Apophis",
      naifId: APOPHIS_NAIF,
      rotation: { axialTiltDegrees: null, periodHours: null },
      spkId: "20099942",
      surface: neutralSurface([0.2, 0.18, 0.16]),
    },
    diameterKilometers: { uncertainty: "±0.04 km", value: 0.34 },
    discovery:
      "Discovered at Kitt Peak by Roy Tucker, David Tholen, and Fabrizio Bernardi on 19 June 2004.",
    evidence: { geometry: "modeled", orbit: "measured", surface: "unresolved" },
    featuredSystem: true,
    id: "asteroid-apophis",
    missionEncounters: [
      {
        date: "2029-06",
        mission: "OSIRIS-APEX",
        note: "Planned rendezvous after the April Earth flyby.",
        status: "upcoming",
      },
    ],
    naifId: APOPHIS_NAIF,
    name: "99942 Apophis",
    orbit: {
      class: "Aten near-Earth asteroid",
      conditionCode: 0,
      eccentricity: 0.19114923,
      inclinationDegrees: 3.34099688,
      periodDays: 323.555337,
      semiMajorAxisAu: 0.92235922,
    },
    parent: "Sun",
    potentiallyHazardous: true,
    rotationHours: {
      note: "Non-principal-axis rotation; Exora does not reduce the tumble to a misleading single-axis animation.",
      uncertainty: "±0.01 h",
      value: 30.56,
    },
    source: sbdbSource("20099942"),
    spectralType: "Sq",
    spkId: "20099942",
    summary:
      "A tumbling near-Earth asteroid that will pass geosynchronous-orbit distance from Earth in April 2029.",
    uncertaintyNote:
      "The close-approach interval is JPL’s current min/max solution, not a visualized impact corridor. No impact is predicted for the 2029 encounter.",
  },
];

export const FEATURED_ASTEROID_NAMES = SOLAR_SYSTEM_ASTEROIDS.filter(
  (asteroid) => asteroid.featuredSystem,
).map((asteroid) => asteroid.name);

const asteroidLookup = new Map(
  SOLAR_SYSTEM_ASTEROIDS.flatMap((asteroid) =>
    [asteroid.name, asteroid.spkId, ...asteroid.aliases].map(
      (alias) => [alias.toLocaleLowerCase(), asteroid] as const,
    ),
  ),
);

export const findSolarAsteroid = (query: string): AsteroidProfile | null =>
  asteroidLookup.get(query.trim().toLocaleLowerCase()) ?? null;

export const asteroidSystemMembers = (asteroid: AsteroidProfile): readonly AsteroidProfile[] =>
  asteroid.companionIds
    .map((id) => SOLAR_SYSTEM_ASTEROIDS.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is AsteroidProfile => candidate !== undefined);
