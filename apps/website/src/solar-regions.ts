export type RegionEvidence = "measured-boundary" | "modeled-inferred" | "statistical-population";
export type RegionKind =
  | "belt"
  | "heliopause"
  | "heliosphere"
  | "oort-shell"
  | "scattered-disk"
  | "termination-shock"
  | "trojan-clouds";

export interface RegionSource {
  credit: string;
  datasetId: string;
  license: string;
  mission?: string;
  originalUrl: string;
  retrievedOn: string;
  source: string;
}

export interface SolarRegionProfile {
  aliases: readonly string[];
  anchorNaifId: string;
  anchorSpkId: string;
  color: readonly [number, number, number];
  disclosure: string;
  distanceAu: {
    inner: number;
    note: string;
    outer: number;
  };
  evidence: RegionEvidence;
  id: string;
  kind: RegionKind;
  name: string;
  parent: "Sun";
  sampleCount: {
    desktop: number;
    mobile: number;
    quest: number;
  };
  scaleNote: string;
  sources: readonly RegionSource[];
  summary: string;
}

const RETRIEVED_ON = "2026-08-23";
const NASA_MEDIA = "NASA media guidelines; factual data and U.S. Government works";

export const SOLAR_SYSTEM_REGIONS: readonly SolarRegionProfile[] = [
  {
    aliases: ["asteroid belt", "main belt"],
    anchorNaifId: "10",
    anchorSpkId: "10",
    color: [0.82, 0.6, 0.36],
    disclosure:
      "A deterministic statistical sample communicates the belt's structure and Kirkwood gaps. Points are not individual catalogued asteroids.",
    distanceAu: {
      inner: 2.2,
      note: "NASA Dawn's population approximation; resonant gaps are schematic density depletions.",
      outer: 3.2,
    },
    evidence: "statistical-population",
    id: "region-main-asteroid-belt",
    kind: "belt",
    name: "Main Asteroid Belt",
    parent: "Sun",
    sampleCount: { desktop: 14_000, mobile: 5_000, quest: 3_000 },
    scaleNote: "LINEAR RADIAL SCALE · 1 AU = 4.2 VIEW UNITS",
    sources: [
      {
        credit: "NASA/JPL-Caltech/UCLA/MPS/DLR/IDA",
        datasetId: "NASA-DAWN-FAQ-MAIN-BELT",
        license: NASA_MEDIA,
        mission: "Dawn",
        originalUrl: "https://science.nasa.gov/mission/dawn/faq/",
        retrievedOn: RETRIEVED_ON,
        source: "NASA Science · Dawn FAQ",
      },
    ],
    summary:
      "The rocky population between Mars and Jupiter, shown as a sparse statistical structure rather than a crowded field of invented objects.",
  },
  {
    aliases: ["trojans", "jovian trojans", "L4", "L5"],
    anchorNaifId: "599",
    anchorSpkId: "599",
    color: [0.92, 0.53, 0.25],
    disclosure:
      "Two sampled clouds occupy broad stable zones around Jupiter's L4 and L5 regions. No point claims a catalog identity.",
    distanceAu: {
      inner: 4.6,
      note: "Cloud spread is a population-scale visualization around Jupiter's 5.2 AU orbit.",
      outer: 5.8,
    },
    evidence: "statistical-population",
    id: "region-jupiter-trojans",
    kind: "trojan-clouds",
    name: "Jupiter Trojan Clouds",
    parent: "Sun",
    sampleCount: { desktop: 12_000, mobile: 4_000, quest: 2_500 },
    scaleNote: "LINEAR RADIAL SCALE · L4 LEADS AND L5 TRAILS JUPITER BY 60°",
    sources: [
      {
        credit: "NASA Science Editorial Team; Lucy mission team",
        datasetId: "NASA-LUCY-TROJAN-POPULATION",
        license: NASA_MEDIA,
        mission: "Lucy",
        originalUrl: "https://science.nasa.gov/solar-system/asteroids/facts/",
        retrievedOn: RETRIEVED_ON,
        source: "NASA Science · Asteroid Facts",
      },
    ],
    summary:
      "Ancient small-body swarms sharing Jupiter's orbit near the stable leading and trailing Lagrange regions.",
  },
  {
    aliases: ["KBO", "Edgeworth-Kuiper belt", "trans-Neptunian region"],
    anchorNaifId: "10",
    anchorSpkId: "10",
    color: [0.3, 0.7, 0.96],
    disclosure:
      "The point field is a synthetic population sample constrained to a thick disk. It is not a rendering of every known KBO.",
    distanceAu: {
      inner: 30,
      note: "The principal belt is shown from Neptune's orbit to about 50 AU.",
      outer: 50,
    },
    evidence: "statistical-population",
    id: "region-kuiper-belt",
    kind: "belt",
    name: "Kuiper Belt",
    parent: "Sun",
    sampleCount: { desktop: 15_000, mobile: 5_000, quest: 3_000 },
    scaleNote: "LINEAR RADIAL SCALE · THICK-DISK POPULATION",
    sources: [
      {
        credit: "NASA Science Editorial Team",
        datasetId: "NASA-KUIPER-BELT-FACTS",
        license: NASA_MEDIA,
        originalUrl: "https://science.nasa.gov/solar-system/kuiper-belt/facts/",
        retrievedOn: RETRIEVED_ON,
        source: "NASA Science · Kuiper Belt Facts",
      },
    ],
    summary:
      "A thick disk of icy remnants beyond Neptune, represented by a population sample with honest empty space.",
  },
  {
    aliases: ["scattered disc", "extended scattered disk", "detached objects"],
    anchorNaifId: "10",
    anchorSpkId: "10",
    color: [0.42, 0.58, 0.96],
    disclosure:
      "A modeled orbital-population envelope illustrates eccentric, inclined paths. The sample is neither a census nor a set of solved ephemerides.",
    distanceAu: {
      inner: 30,
      note: "The 1,000 AU view includes the broad domain reached by extreme observed trans-Neptunian orbits; its population boundary is not sharp.",
      outer: 1_000,
    },
    evidence: "modeled-inferred",
    id: "region-scattered-disk",
    kind: "scattered-disk",
    name: "Scattered Disk",
    parent: "Sun",
    sampleCount: { desktop: 10_000, mobile: 3_500, quest: 2_200 },
    scaleNote: "LOGARITHMIC RADIAL COMPRESSION · ORBITAL ENVELOPE, NOT A HARD EDGE",
    sources: [
      {
        credit: "NASA/JPL Solar System Dynamics",
        datasetId: "NASA-BASICS-SEDNA-ORBIT",
        license: NASA_MEDIA,
        originalUrl: "https://science.nasa.gov/learn/basics-of-space-flight/chapter1-1/",
        retrievedOn: RETRIEVED_ON,
        source: "NASA Science · Basics of Space Flight",
      },
    ],
    summary:
      "A dynamically excited trans-Neptunian population with elongated, steeply inclined orbits and an uncertain outer transition.",
  },
  {
    aliases: ["Öpik-Oort cloud", "comet cloud"],
    anchorNaifId: "10",
    anchorSpkId: "10",
    color: [0.55, 0.73, 1],
    disclosure:
      "MODELED / INDIRECTLY INFERRED · NOT DIRECTLY OBSERVED. Every point is synthetic and only expresses a hypothesized spherical reservoir.",
    distanceAu: {
      inner: 2_000,
      note: "The adopted 2,000–100,000 AU shell is a scale model, not a measured boundary.",
      outer: 100_000,
    },
    evidence: "modeled-inferred",
    id: "region-oort-cloud",
    kind: "oort-shell",
    name: "Oort Cloud",
    parent: "Sun",
    sampleCount: { desktop: 18_000, mobile: 6_000, quest: 3_500 },
    scaleNote: "LOGARITHMIC RADIAL COMPRESSION · INNER AND OUTER EDGES ARE MODEL ASSUMPTIONS",
    sources: [
      {
        credit: "NASA Science Editorial Team",
        datasetId: "NASA-OORT-CLOUD-FACTS",
        license: NASA_MEDIA,
        originalUrl: "https://science.nasa.gov/solar-system/oort-cloud/",
        retrievedOn: RETRIEVED_ON,
        source: "NASA Science · Oort Cloud",
      },
    ],
    summary:
      "A hypothesized, immense spherical reservoir invoked to explain long-period comets; no direct image of the cloud exists.",
  },
  {
    aliases: ["solar bubble", "solar wind bubble"],
    anchorNaifId: "10",
    anchorSpkId: "10",
    color: [0.12, 0.63, 0.92],
    disclosure:
      "The translucent shell is a simulated global morphology constrained by Voyager crossings and remote heliophysics observations, not a photographed surface.",
    distanceAu: {
      inner: 0,
      note: "The upwind shell is normalized to the Voyager crossing scale; the global form varies with solar and interstellar conditions.",
      outer: 122,
    },
    evidence: "modeled-inferred",
    id: "region-heliosphere",
    kind: "heliosphere",
    name: "Heliosphere",
    parent: "Sun",
    sampleCount: { desktop: 5_000, mobile: 2_000, quest: 1_200 },
    scaleNote: "NORMALIZED GLOBAL MODEL · VOYAGER PROVIDES TWO LOCAL CUTS, NOT A COMPLETE SURFACE",
    sources: [
      {
        credit: "NASA Heliophysics; IBEX and Voyager mission teams",
        datasetId: "NASA-HEAT-HELIO-COMPONENTS",
        license: NASA_MEDIA,
        mission: "IBEX / Voyager",
        originalUrl: "https://science.nasa.gov/learn/heat/resource/components-of-the-heliosphere/",
        retrievedOn: RETRIEVED_ON,
        source: "NASA Science · Components of the Heliosphere",
      },
    ],
    summary:
      "The Sun's dynamic plasma and magnetic-field cavity, shown as a constrained global model around two in-situ Voyager tracks.",
  },
  {
    aliases: ["solar wind termination shock", "termination boundary"],
    anchorNaifId: "10",
    anchorSpkId: "10",
    color: [0.94, 0.46, 0.18],
    disclosure:
      "Voyager measured two local crossings at 94 and 84 AU. The complete shell between those tracks is modeled and time-variable.",
    distanceAu: {
      inner: 84,
      note: "Voyager 2 crossed at 84 AU and Voyager 1 at 94 AU; these are directional samples, not fixed global radii.",
      outer: 94,
    },
    evidence: "measured-boundary",
    id: "region-termination-shock",
    kind: "termination-shock",
    name: "Termination Shock",
    parent: "Sun",
    sampleCount: { desktop: 4_000, mobile: 1_500, quest: 900 },
    scaleNote: "NORMALIZED SHELL · TWO MEASURED CROSSINGS, INTERPOLATED GLOBAL FORM",
    sources: [
      {
        credit: "NASA/JPL-Caltech Voyager mission team",
        datasetId: "VOYAGER-TS-2004-2007",
        license: NASA_MEDIA,
        mission: "Voyager 1 / Voyager 2",
        originalUrl: "https://science.nasa.gov/mission/voyager/interstellar-mission/",
        retrievedOn: RETRIEVED_ON,
        source: "NASA Science · Voyager Interstellar Mission",
      },
    ],
    summary:
      "The moving boundary where the supersonic solar wind abruptly slows as it meets the interstellar medium.",
  },
  {
    aliases: ["edge of heliosphere", "interstellar boundary"],
    anchorNaifId: "10",
    anchorSpkId: "10",
    color: [0.55, 0.31, 0.98],
    disclosure:
      "Voyager 1 and 2 measured local crossings near 122 and 119 AU. The surrounding boundary shown here is a simulated interpolation.",
    distanceAu: {
      inner: 119,
      note: "Crossing distances differ with direction and solar state; the heliopause breathes rather than forming a rigid sphere.",
      outer: 122,
    },
    evidence: "measured-boundary",
    id: "region-heliopause",
    kind: "heliopause",
    name: "Heliopause",
    parent: "Sun",
    sampleCount: { desktop: 4_000, mobile: 1_500, quest: 900 },
    scaleNote: "NORMALIZED SHELL · TWO MEASURED CROSSINGS, MODELED BETWEEN TRACKS",
    sources: [
      {
        credit: "NASA/JPL-Caltech Voyager mission team",
        datasetId: "VOYAGER-HP-2012-2018",
        license: NASA_MEDIA,
        mission: "Voyager 1 / Voyager 2",
        originalUrl: "https://www.nasa.gov/solar-system/the-voyage-to-interstellar-space/",
        retrievedOn: RETRIEVED_ON,
        source: "NASA · The Voyage to Interstellar Space",
      },
    ],
    summary:
      "The pressure-balance boundary between the solar-wind cavity and the local interstellar medium.",
  },
] as const;

export const FEATURED_REGION_NAMES = SOLAR_SYSTEM_REGIONS.map((region) => region.name);

export const findSolarRegion = (value: string): SolarRegionProfile | undefined => {
  const normalized = value.trim().toLocaleLowerCase();
  return SOLAR_SYSTEM_REGIONS.find(
    (region) =>
      region.name.toLocaleLowerCase() === normalized ||
      region.id.toLocaleLowerCase() === normalized ||
      region.aliases.some((alias) => alias.toLocaleLowerCase() === normalized),
  );
};

export interface RegionParticle {
  cloud: "leading" | "population" | "trailing";
  x: number;
  y: number;
  z: number;
}

const randomGenerator = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
};

const hash = (value: string): number => {
  let result = 2_166_136_261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
};

const compressedRadius = (region: SolarRegionProfile, distanceAu: number): number => {
  if (region.kind === "scattered-disk" || region.kind === "oort-shell") {
    const inner = Math.max(region.distanceAu.inner, 1);
    const outer = Math.max(region.distanceAu.outer, inner + 1);
    return 3 + (Math.log(distanceAu / inner) / Math.log(outer / inner)) * 9;
  }
  const span = Math.max(region.distanceAu.outer - region.distanceAu.inner, 0.001);
  return 4 + ((distanceAu - region.distanceAu.inner) / span) * 8;
};

/**
 * Builds a repeatable population sample for the regional views. It intentionally has no object
 * identifiers: these points communicate aggregate structure and must never masquerade as an
 * asteroid/comet catalogue or an ephemeris solution.
 */
export const sampleRegionParticles = (
  region: SolarRegionProfile,
  requestedCount: number,
): RegionParticle[] => {
  const count = Math.max(0, Math.floor(requestedCount));
  const random = randomGenerator(hash(region.id));
  const particles: RegionParticle[] = [];

  for (let index = 0; index < count; index += 1) {
    let angle = random() * Math.PI * 2;
    let cloud: RegionParticle["cloud"] = "population";
    let distance =
      region.distanceAu.inner + random() * (region.distanceAu.outer - region.distanceAu.inner);
    let verticalSpread = 0.04;

    if (region.id === "region-main-asteroid-belt") {
      // Principal resonances are represented only as depleted statistical bands. This does not
      // assign an orbit to any point; it keeps the aggregate view from becoming a uniform torus.
      const nearestGap = [2.5, 2.82, 2.95].find((gap) => Math.abs(distance - gap) < 0.035);
      if (nearestGap !== undefined && random() < 0.82) {
        distance += distance < nearestGap ? -0.055 : 0.055;
      }
    } else if (region.kind === "trojan-clouds") {
      cloud = index % 2 === 0 ? "leading" : "trailing";
      angle = (cloud === "leading" ? Math.PI / 3 : -Math.PI / 3) + (random() - 0.5) * 0.9;
      distance = 5.2 + (random() - 0.5) * 0.9;
      verticalSpread = 0.12;
    } else if (region.kind === "scattered-disk") {
      distance =
        region.distanceAu.inner *
        Math.pow(region.distanceAu.outer / region.distanceAu.inner, random());
      verticalSpread = 0.4;
    } else if (region.kind === "oort-shell") {
      distance =
        region.distanceAu.inner *
        Math.pow(region.distanceAu.outer / region.distanceAu.inner, 0.4 + random() * 0.6);
      const radius = compressedRadius(region, distance);
      const cosine = random() * 2 - 1;
      const sine = Math.sqrt(1 - cosine * cosine);
      particles.push({
        cloud,
        x: radius * sine * Math.cos(angle),
        y: radius * cosine,
        z: radius * sine * Math.sin(angle),
      });
      continue;
    } else if (region.kind === "heliosphere") {
      distance = region.distanceAu.outer * (0.18 + random() * 0.82);
      verticalSpread = 0.65;
    } else if (region.evidence === "measured-boundary") {
      distance =
        region.distanceAu.inner + random() * (region.distanceAu.outer - region.distanceAu.inner);
      verticalSpread = 0.55;
    }

    const radius = compressedRadius(region, distance);
    const y = (random() + random() - 1) * radius * verticalSpread;
    particles.push({
      cloud,
      x: Math.cos(angle) * radius,
      y,
      z: Math.sin(angle) * radius,
    });
  }

  return particles;
};
