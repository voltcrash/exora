export type SubsystemEvidence = "derived" | "measured" | "simulated" | "unresolved";

export interface SubsystemMoon {
  inclinationDegrees: number;
  meanRadiusKilometers: number;
  name: string;
  naifId: number;
  orbitalPeriodDays: number;
  orbitalSemiMajorAxisKilometers: number;
  principal: boolean;
  retrograde?: boolean;
  shepherds?: string;
  surface: "mapped" | "unresolved";
  texturePath?: string;
}

export interface SubsystemRing {
  color: readonly [number, number, number];
  innerRadiusKilometers: number;
  name: string;
  opacity: number;
  outerRadiusKilometers: number;
}

export interface SubsystemResonance {
  bodies: readonly string[];
  note: string;
  ratio: string;
}

export interface SubsystemLagrangePoint {
  angleDegrees: number;
  label: "L1" | "L2" | "L4" | "L5";
  radiusKilometers: number;
  reference: string;
}

export interface PlanetarySubsystem {
  aurora: {
    evidence: SubsystemEvidence;
    latitudeDegrees: number;
    note: string;
  } | null;
  disclosure: string;
  id: string;
  lagrangePoints: readonly SubsystemLagrangePoint[];
  magnetosphere: {
    axisTiltDegrees: number;
    daysideRadiusInPrimaryRadii: number;
    evidence: SubsystemEvidence;
    note: string;
    tailRadiusInPrimaryRadii: number;
  } | null;
  moons: readonly SubsystemMoon[];
  parent: string;
  parentNaifId: number;
  parentRadiusKilometers: number;
  plumes: readonly {
    evidence: "confirmed" | "tentative";
    heightKilometers: number;
    moon: string;
    note: string;
  }[];
  resonances: readonly SubsystemResonance[];
  rings: readonly SubsystemRing[];
  torus: {
    evidence: SubsystemEvidence;
    moon: string;
    note: string;
    radiusKilometers: number;
  } | null;
}

const mappedTexture = (name: string): string =>
  `/textures/solar-system/${name.toLocaleLowerCase().replaceAll(" ", "-")}.jpg`;

const moon = (
  name: string,
  naifId: number,
  orbitalSemiMajorAxisKilometers: number,
  orbitalPeriodDays: number,
  inclinationDegrees: number,
  meanRadiusKilometers: number,
  options: {
    principal?: boolean;
    retrograde?: boolean;
    shepherds?: string;
    surface?: "mapped" | "unresolved";
  } = {},
): SubsystemMoon => {
  const surface = options.surface ?? (options.principal ? "mapped" : "unresolved");
  return {
    inclinationDegrees,
    meanRadiusKilometers,
    name,
    naifId,
    orbitalPeriodDays,
    orbitalSemiMajorAxisKilometers,
    principal: options.principal ?? false,
    ...(options.retrograde ? { retrograde: true } : {}),
    ...(options.shepherds ? { shepherds: options.shepherds } : {}),
    surface,
    ...(surface === "mapped" ? { texturePath: mappedTexture(name) } : {}),
  };
};

const ring = (
  name: string,
  innerRadiusKilometers: number,
  outerRadiusKilometers: number,
  opacity: number,
  color: readonly [number, number, number],
): SubsystemRing => ({ color, innerRadiusKilometers, name, opacity, outerRadiusKilometers });

const lagrangePair = (
  radiusKilometers: number,
  reference: string,
): readonly SubsystemLagrangePoint[] => [
  { angleDegrees: 60, label: "L4", radiusKilometers, reference },
  { angleDegrees: -60, label: "L5", radiusKilometers, reference },
];

export const PLANETARY_SUBSYSTEMS: readonly PlanetarySubsystem[] = [
  {
    aurora: null,
    disclosure:
      "Mercury has no known natural satellites or rings. Its compact magnetic cavity is measured by Mariner 10 and MESSENGER; the tail is diagrammatically compressed.",
    id: "mercury",
    lagrangePoints: [],
    magnetosphere: {
      axisTiltDegrees: 0,
      daysideRadiusInPrimaryRadii: 1.45,
      evidence: "measured",
      note: "Weak intrinsic field; displayed boundary is a representative magnetopause, not an instantaneous space-weather solution.",
      tailRadiusInPrimaryRadii: 12,
    },
    moons: [],
    parent: "Mercury",
    parentNaifId: 199,
    parentRadiusKilometers: 2_439.7,
    plumes: [],
    resonances: [],
    rings: [],
    torus: null,
  },
  {
    aurora: null,
    disclosure:
      "Venus has no known natural satellites or rings. Its solar-wind-induced magnetotail is shown as a measured interaction region, not an intrinsic dipole.",
    id: "venus",
    lagrangePoints: [],
    magnetosphere: {
      axisTiltDegrees: 0,
      daysideRadiusInPrimaryRadii: 1.1,
      evidence: "measured",
      note: "Induced magnetic boundary produced by the solar wind interacting with the ionosphere.",
      tailRadiusInPrimaryRadii: 14,
    },
    moons: [],
    parent: "Venus",
    parentNaifId: 299,
    parentRadiusKilometers: 6_051.8,
    plumes: [],
    resonances: [],
    rings: [],
    torus: null,
  },
  {
    aurora: {
      evidence: "measured",
      latitudeDegrees: 67,
      note: "Statistical auroral ovals; position and intensity vary with geomagnetic activity.",
    },
    disclosure:
      "Earth–Moon distance, inclination, motion, and the 1:1 spin–orbit lock are measured. Orbit size is compressed and the magnetosphere is a representative average, not live space weather.",
    id: "earth",
    lagrangePoints: [
      { angleDegrees: 0, label: "L1", radiusKilometers: 326_400, reference: "Earth–Moon" },
      { angleDegrees: 180, label: "L2", radiusKilometers: 448_900, reference: "Earth–Moon" },
      ...lagrangePair(384_400, "Earth–Moon"),
    ],
    magnetosphere: {
      axisTiltDegrees: 11,
      daysideRadiusInPrimaryRadii: 10,
      evidence: "derived",
      note: "Typical dayside magnetopause and long antisolar tail; actual boundaries respond continuously to the solar wind.",
      tailRadiusInPrimaryRadii: 80,
    },
    moons: [moon("Moon", 301, 384_400, 27.321661, 5.145, 1_737.4, { principal: true })],
    parent: "Earth",
    parentNaifId: 399,
    parentRadiusKilometers: 6_371,
    plumes: [],
    resonances: [
      {
        bodies: ["Moon", "rotation"],
        note: "The same lunar hemisphere faces Earth on average.",
        ratio: "1:1",
      },
    ],
    rings: [],
    torus: null,
  },
  {
    aurora: {
      evidence: "measured",
      latitudeDegrees: 72,
      note: "Patchy ultraviolet aurora observed above crustal magnetic fields, not a global oval.",
    },
    disclosure:
      "Phobos and Deimos use JPL mean elements and retain their Viking-era mission mosaics. Radial distance and body size use separate display scales.",
    id: "mars",
    lagrangePoints: [],
    magnetosphere: null,
    moons: [
      moon("Phobos", 401, 9_376, 0.31891, 1.075, 11.08, { principal: true }),
      moon("Deimos", 402, 23_463, 1.26244, 0.93, 6.2, { principal: true }),
    ],
    parent: "Mars",
    parentNaifId: 499,
    parentRadiusKilometers: 3_389.5,
    plumes: [],
    resonances: [],
    rings: [],
    torus: null,
  },
  {
    aurora: {
      evidence: "measured",
      latitudeDegrees: 74,
      note: "Persistent polar auroral regions plus measured magnetic footprints of the Galilean moons.",
    },
    disclosure:
      "Regular-moon tracks use JPL mean elements; distant irregulars are representative named members. Jupiter, moons, rings, plasma, and field boundaries use independent display scales, all labelled in the interface.",
    id: "jupiter",
    lagrangePoints: lagrangePair(778_570_000, "Sun–Jupiter Trojan regions"),
    magnetosphere: {
      axisTiltDegrees: 10,
      daysideRadiusInPrimaryRadii: 75,
      evidence: "derived",
      note: "Representative 3–7 million km dayside boundary; the real magnetosphere expands and contracts with solar-wind pressure.",
      tailRadiusInPrimaryRadii: 300,
    },
    moons: [
      moon("Metis", 516, 128_000, 0.29478, 0.06, 21.5, { shepherds: "Main ring" }),
      moon("Adrastea", 515, 129_000, 0.29826, 0.03, 8.2, { shepherds: "Main ring" }),
      moon("Amalthea", 505, 181_400, 0.49818, 0.374, 83.5),
      moon("Thebe", 514, 221_900, 0.67454, 1.076, 49.3),
      moon("Io", 501, 421_800, 1.769138, 0.036, 1_821.49, { principal: true }),
      moon("Europa", 502, 671_100, 3.551181, 0.466, 1_560.8, { principal: true }),
      moon("Ganymede", 503, 1_070_400, 7.154553, 0.177, 2_631.2, { principal: true }),
      moon("Callisto", 504, 1_882_700, 16.689018, 0.192, 2_410.3, { principal: true }),
      moon("Himalia", 506, 11_460_000, 250.56, 27.5, 85),
      moon("Pasiphae", 508, 23_624_000, 743.63, 151.4, 30, { retrograde: true }),
      moon("Sinope", 509, 23_939_000, 758.9, 158.1, 19, { retrograde: true }),
    ],
    parent: "Jupiter",
    parentNaifId: 599,
    parentRadiusKilometers: 69_911,
    plumes: [
      {
        evidence: "tentative",
        heightKilometers: 200,
        moon: "Europa",
        note: "Simulated intermittent vapor based on Hubble/Galileo evidence; Webb did not detect a plume during its observation.",
      },
    ],
    resonances: [
      {
        bodies: ["Io", "Europa", "Ganymede"],
        note: "Measured Laplace mean-motion resonance.",
        ratio: "4:2:1",
      },
    ],
    rings: [
      ring("Halo", 92_000, 122_500, 0.08, [0.63, 0.55, 0.46]),
      ring("Main ring", 122_500, 129_000, 0.2, [0.72, 0.63, 0.53]),
      ring("Gossamer rings", 129_000, 226_000, 0.055, [0.55, 0.47, 0.4]),
    ],
    torus: {
      evidence: "measured",
      moon: "Io",
      note: "Ultraviolet-emitting sulfur and oxygen plasma supplied by Io; density is illustrative.",
      radiusKilometers: 421_800,
    },
  },
  {
    aurora: {
      evidence: "measured",
      latitudeDegrees: 72,
      note: "Ultraviolet polar auroral ovals; intensity and fine structure are time-variable.",
    },
    disclosure:
      "Moon tracks and ring boundaries use JPL/PDS mean values. Fine ring texture, the magnetopause, aurora brightness, and plume particles are explanatory simulations, not a time-resolved Cassini observation.",
    id: "saturn",
    lagrangePoints: [],
    magnetosphere: {
      axisTiltDegrees: 0.01,
      daysideRadiusInPrimaryRadii: 22,
      evidence: "derived",
      note: "Representative boundary; Saturn's unusually axisymmetric field and solar-wind response are simplified.",
      tailRadiusInPrimaryRadii: 80,
    },
    moons: [
      moon("Pan", 618, 133_584, 0.57505, 0.001, 14, { shepherds: "Encke Gap" }),
      moon("Daphnis", 635, 136_505, 0.59408, 0.0036, 3.8, { shepherds: "Keeler Gap" }),
      moon("Atlas", 615, 137_670, 0.60169, 0.003, 15.1, { shepherds: "A-ring edge" }),
      moon("Prometheus", 616, 139_380, 0.61299, 0.008, 43.1, { shepherds: "F ring" }),
      moon("Pandora", 617, 141_720, 0.6285, 0.05, 40.7, { shepherds: "F ring" }),
      moon("Janus", 610, 151_450, 0.69466, 0.165, 89.5),
      moon("Epimetheus", 611, 151_450, 0.69433, 0.351, 58.1),
      moon("Mimas", 601, 185_540, 0.942422, 1.574, 198.2, { principal: true }),
      moon("Enceladus", 602, 238_040, 1.370218, 0.009, 252.1, { principal: true }),
      moon("Tethys", 603, 294_670, 1.887802, 1.091, 531.1, { principal: true }),
      moon("Dione", 604, 377_420, 2.736915, 0.028, 561.4, { principal: true }),
      moon("Rhea", 605, 527_070, 4.5175, 0.345, 763.8, { principal: true }),
      moon("Titan", 606, 1_221_870, 15.945421, 0.349, 2_574.7, { principal: true }),
      moon("Hyperion", 607, 1_500_880, 21.27661, 0.43, 135),
      moon("Iapetus", 608, 3_560_820, 79.3215, 15.47, 734.3, { principal: true }),
      moon("Phoebe", 609, 12_947_780, 550.31, 175.2, 106.5, { retrograde: true }),
    ],
    parent: "Saturn",
    parentNaifId: 699,
    parentRadiusKilometers: 58_232,
    plumes: [
      {
        evidence: "confirmed",
        heightKilometers: 500,
        moon: "Enceladus",
        note: "Simulated ice-grain jets localized at the mapped south-polar tiger-stripe province.",
      },
    ],
    resonances: [
      {
        bodies: ["Mimas", "Tethys"],
        note: "Inclination-type mean-motion resonance.",
        ratio: "2:1",
      },
      {
        bodies: ["Enceladus", "Dione"],
        note: "Eccentricity-pumping mean-motion resonance.",
        ratio: "2:1",
      },
      {
        bodies: ["Titan", "Hyperion"],
        note: "Maintains Hyperion's eccentric orbit and chaotic spin.",
        ratio: "4:3",
      },
      {
        bodies: ["Janus", "Epimetheus"],
        note: "Co-orbitals exchange their neighboring tracks about every four years.",
        ratio: "1:1",
      },
    ],
    rings: [
      ring("D ring", 66_900, 74_510, 0.04, [0.69, 0.65, 0.58]),
      ring("C ring", 74_658, 92_000, 0.17, [0.72, 0.68, 0.61]),
      ring("B ring", 92_000, 117_580, 0.58, [0.86, 0.82, 0.73]),
      ring("Cassini Division", 117_580, 122_170, 0.035, [0.4, 0.39, 0.36]),
      ring("A ring", 122_170, 136_775, 0.42, [0.82, 0.78, 0.7]),
      ring("F ring", 140_180, 140_680, 0.22, [0.86, 0.84, 0.77]),
      ring("E ring", 180_000, 480_000, 0.025, [0.62, 0.76, 0.84]),
    ],
    torus: null,
  },
  {
    aurora: {
      evidence: "measured",
      latitudeDegrees: 65,
      note: "Localized ultraviolet aurora; the strongly tilted, offset field makes the pattern asymmetric.",
    },
    disclosure:
      "The entire system is tilted with Uranus's equator. Voyager-resolved major moons keep their mosaics; small inner moons remain neutral unresolved silhouettes.",
    id: "uranus",
    lagrangePoints: [],
    magnetosphere: {
      axisTiltDegrees: 59,
      daysideRadiusInPrimaryRadii: 18,
      evidence: "derived",
      note: "Strongly tilted, off-center dipole shown at representative Voyager-era scale.",
      tailRadiusInPrimaryRadii: 80,
    },
    moons: [
      moon("Cordelia", 706, 49_752, 0.33503, 0.085, 20.1, { shepherds: "Epsilon ring" }),
      moon("Ophelia", 707, 53_764, 0.3764, 0.104, 21.4, { shepherds: "Epsilon ring" }),
      moon("Bianca", 708, 59_166, 0.43458, 0.193, 25.7),
      moon("Cressida", 709, 61_767, 0.46357, 0.006, 39.8),
      moon("Desdemona", 710, 62_658, 0.47365, 0.113, 32),
      moon("Juliet", 711, 64_358, 0.49307, 0.065, 46.8),
      moon("Portia", 712, 66_097, 0.5132, 0.059, 67.6),
      moon("Rosalind", 713, 69_927, 0.55846, 0.279, 36),
      moon("Belinda", 714, 75_255, 0.62353, 0.031, 40.3),
      moon("Puck", 715, 86_004, 0.76183, 0.319, 81),
      moon("Miranda", 705, 129_390, 1.413479, 4.338, 235.8, { principal: true }),
      moon("Ariel", 701, 191_020, 2.520379, 0.26, 578.9, { principal: true }),
      moon("Umbriel", 702, 266_300, 4.144177, 0.205, 584.7, { principal: true }),
      moon("Titania", 703, 435_910, 8.705872, 0.34, 788.9, { principal: true }),
      moon("Oberon", 704, 583_520, 13.463239, 0.058, 761.4, { principal: true }),
    ],
    parent: "Uranus",
    parentNaifId: 799,
    parentRadiusKilometers: 25_362,
    plumes: [],
    resonances: [
      {
        bodies: ["Miranda", "Umbriel"],
        note: "Near the former 3:1 resonance implicated in Miranda's heating.",
        ratio: "near 3:1",
      },
    ],
    rings: [
      ring("Inner rings", 37_850, 47_176, 0.1, [0.4, 0.43, 0.44]),
      ring("Epsilon ring", 51_149, 51_149 + 96, 0.32, [0.57, 0.58, 0.56]),
      ring("Mu and Nu dusty rings", 65_400, 103_000, 0.035, [0.36, 0.42, 0.46]),
    ],
    torus: null,
  },
  {
    aurora: {
      evidence: "measured",
      latitudeDegrees: 55,
      note: "Patchy aurora displaced by Neptune's strongly tilted and offset magnetic field.",
    },
    disclosure:
      "Voyager-resolved Triton retains its mosaic. Inner moons and Nereid are unresolved neutral silhouettes; Neptune's ring arcs and magnetic boundaries are diagrammatic layers around measured tracks.",
    id: "neptune",
    lagrangePoints: lagrangePair(4_498_400_000, "Sun–Neptune Trojan regions"),
    magnetosphere: {
      axisTiltDegrees: 47,
      daysideRadiusInPrimaryRadii: 26,
      evidence: "derived",
      note: "Representative Voyager 2 configuration; the offset tilted field changes orientation through a 16-hour rotation.",
      tailRadiusInPrimaryRadii: 100,
    },
    moons: [
      moon("Naiad", 803, 48_224, 0.2944, 4.75, 33),
      moon("Thalassa", 804, 50_074, 0.3115, 0.2, 41),
      moon("Despina", 805, 52_526, 0.3347, 0.07, 75),
      moon("Galatea", 806, 61_953, 0.4287, 0.05, 88, { shepherds: "Adams ring arcs" }),
      moon("Larissa", 807, 73_548, 0.555, 0.2, 97),
      moon("Proteus", 808, 117_647, 1.1223, 0.075, 210),
      moon("Triton", 801, 354_800, 5.876854, 156.865, 1_352.6, {
        principal: true,
        retrograde: true,
      }),
      moon("Nereid", 802, 5_513_400, 360.14, 7.23, 170),
    ],
    parent: "Neptune",
    parentNaifId: 899,
    parentRadiusKilometers: 24_622,
    plumes: [],
    resonances: [
      {
        bodies: ["Galatea", "Adams ring arcs"],
        note: "Corotation resonance helps confine the bright arcs.",
        ratio: "42:43",
      },
    ],
    rings: [
      ring("Galle ring", 41_900, 42_900, 0.04, [0.44, 0.49, 0.53]),
      ring("Le Verrier ring", 53_100, 53_300, 0.08, [0.52, 0.55, 0.57]),
      ring("Lassell ring", 53_200, 57_200, 0.035, [0.42, 0.47, 0.5]),
      ring("Adams ring + arcs", 62_900, 63_000, 0.14, [0.6, 0.62, 0.61]),
    ],
    torus: null,
  },
  {
    aurora: null,
    disclosure:
      "Pluto and Charon orbit their shared barycenter; this parent-centered view keeps their measured period, scale ordering, and retrograde orientation. Small moons are unresolved neutral silhouettes.",
    id: "pluto",
    lagrangePoints: [
      { angleDegrees: 0, label: "L1", radiusKilometers: 17_400, reference: "Pluto–Charon" },
      ...lagrangePair(19_596, "Pluto–Charon"),
    ],
    magnetosphere: null,
    moons: [
      moon("Charon", 901, 19_596, 6.38723, 0.001, 606, { principal: true, retrograde: true }),
      moon("Styx", 905, 42_656, 20.16155, 0.81, 5.2, { retrograde: true }),
      moon("Nix", 902, 48_694, 24.85463, 0.133, 19.3, { retrograde: true }),
      moon("Kerberos", 904, 57_783, 32.16756, 0.389, 6, { retrograde: true }),
      moon("Hydra", 903, 64_738, 38.20177, 0.242, 25.4, { retrograde: true }),
    ],
    parent: "Pluto",
    parentNaifId: 999,
    parentRadiusKilometers: 1_188.3,
    plumes: [],
    resonances: [
      {
        bodies: ["Charon", "Styx", "Nix", "Kerberos", "Hydra"],
        note: "Small-moon periods lie close to an integer chain with Charon.",
        ratio: "1:3:4:5:6",
      },
    ],
    rings: [],
    torus: null,
  },
] as const;

export const findPlanetarySubsystem = (name: string): PlanetarySubsystem | null => {
  const normalized = name.trim().toLocaleLowerCase();
  return PLANETARY_SUBSYSTEMS.find((system) => system.id === normalized) ?? null;
};

export const subsystemOrbitRadius = (
  subsystem: PlanetarySubsystem,
  distanceKilometers: number,
): number => {
  const relative = Math.max(1, distanceKilometers / subsystem.parentRadiusKilometers);
  return 2.8 + Math.log10(relative) * 4.15;
};
