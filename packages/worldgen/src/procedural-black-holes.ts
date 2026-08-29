import {
  blackHoleProfileSchema,
  type BlackHoleKind,
  type BlackHoleProfile,
} from "@exora/contracts";

export interface ProceduralBlackHoleOptions {
  count: number;
  seed: number;
}

export interface ProceduralBlackHoleAtOptions {
  seed: number;
  sequence: number;
}

export interface CustomBlackHoleParameters {
  diskActivity: number;
  diskHueDegrees: number;
  diskTiltDegrees: number;
  jetStrength: number;
  kind: BlackHoleKind;
  mass: number;
  name: string;
  seed: number;
}

export interface CustomBlackHole {
  blackHole: BlackHoleProfile;
  parameters: CustomBlackHoleParameters;
}

interface MassClass {
  kind: BlackHoleKind;
  maximum: number;
  minimum: number;
}

const MASS_CLASSES: readonly MassClass[] = [
  { kind: "stellar-mass", maximum: 100, minimum: 3 },
  { kind: "intermediate-mass", maximum: 100_000, minimum: 100 },
  { kind: "supermassive", maximum: 10_000_000_000, minimum: 100_000 },
  { kind: "ultramassive", maximum: 100_000_000_000, minimum: 10_000_000_000 },
];

const hashString = (value: string): number => {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash;
};

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b_79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const between = (random: () => number, minimum: number, maximum: number): number =>
  minimum + random() * (maximum - minimum);

const logUniform = (random: () => number, minimum: number, maximum: number): number =>
  10 ** between(random, Math.log10(minimum), Math.log10(maximum));

const roundedMass = (mass: number): number => {
  if (mass >= 1_000_000) return Math.round(mass / 1_000) * 1_000;
  if (mass >= 1_000) return Math.round(mass);
  return Math.round(mass * 10) / 10;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : minimum;

const clampUnit = (value: number): number => clamp(value, 0, 1);

const normalizedSeed = (seed: number): number => {
  if (!Number.isFinite(seed)) throw new RangeError("seed must be finite");
  return Math.trunc(seed) >>> 0;
};

export const generateProceduralBlackHole = ({
  seed,
  sequence,
}: ProceduralBlackHoleAtOptions): BlackHoleProfile => {
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    throw new RangeError("sequence must be a positive safe integer");
  const safeSeed = normalizedSeed(seed);
  const random = createRandom(hashString(`${safeSeed}:${sequence}`));
  const massClass = MASS_CLASSES[Math.floor(random() * MASS_CLASSES.length)]!;
  const massSolar = roundedMass(logUniform(random, massClass.minimum, massClass.maximum));
  const diskActivity = between(random, 0.08, 1);
  const jetStrength = diskActivity < 0.25 ? 0 : between(random, 0, 1);
  const nameIndex = sequence.toString().padStart(4, "0");

  return blackHoleProfileSchema.parse({
    aliases: [],
    catalogDesignation: `EXORA-${safeSeed}-${nameIndex}`,
    constellation: null,
    distanceLightYears: null,
    host: "Procedural spacetime",
    id: `exora-synthetic-${safeSeed}-${nameIndex}`,
    kind: massClass.kind,
    massSolar,
    massUncertaintySolar: null,
    milestone: "Generated visualization parameter set",
    name: `EXORA SYNTHETIC ${nameIndex}`,
    observation: {
      accretion: diskActivity > 0.68 ? "active" : diskActivity > 0.25 ? "quiet" : "dormant",
      companion: null,
      declinationDegrees: null,
      redshift: null,
      rightAscensionDegrees: null,
      summary:
        "A deterministic Exora visualization. Its mass and appearance are generator parameters, not telescope measurements or an astronomical discovery.",
    },
    provenance: "procedural",
    source: {
      archive: "Exora Custom Generator",
      catalog: "procedural",
      measurement: "Generated parameter; not a telescope measurement.",
      retrievedOn: "2026-08-29",
      title: "Exora deterministic black-hole generator",
    },
    status: "synthetic",
    visual: {
      diskActivity,
      diskHueDegrees: between(random, 8, 238),
      diskTiltDegrees: between(random, 4, 82),
      jetStrength,
      seed: Math.floor(random() * 4_294_967_295),
    },
  });
};

export const generateProceduralBlackHoles = ({
  count,
  seed,
}: ProceduralBlackHoleOptions): BlackHoleProfile[] => {
  if (!Number.isSafeInteger(count) || count < 0)
    throw new RangeError("count must be a non-negative safe integer");
  normalizedSeed(seed);
  return Array.from({ length: count }, (_, offset) =>
    generateProceduralBlackHole({ seed, sequence: offset + 1 }),
  );
};

export const generateCustomBlackHole = (parameters: CustomBlackHoleParameters): CustomBlackHole => {
  const seed = normalizedSeed(parameters.seed);
  const massClass = MASS_CLASSES.find(({ kind }) => kind === parameters.kind) ?? MASS_CLASSES[0]!;
  const mass = clampUnit(parameters.mass);
  const massSolar = roundedMass(
    10 **
      (Math.log10(massClass.minimum) +
        mass * (Math.log10(massClass.maximum) - Math.log10(massClass.minimum))),
  );
  const diskActivity = clampUnit(parameters.diskActivity);
  const name = parameters.name.trim() || "Untitled Black Hole";

  return {
    parameters,
    blackHole: blackHoleProfileSchema.parse({
      aliases: [],
      catalogDesignation: `FORGE-BH-${seed.toString().padStart(6, "0")}`,
      constellation: null,
      distanceLightYears: null,
      host: "Custom spacetime",
      id: `custom-black-hole-${seed}`,
      kind: massClass.kind,
      massSolar,
      massUncertaintySolar: null,
      milestone: "World Forge gravitational visualization",
      name,
      observation: {
        accretion: diskActivity > 0.68 ? "active" : diskActivity > 0.18 ? "quiet" : "dormant",
        companion: null,
        declinationDegrees: null,
        redshift: null,
        rightAscensionDegrees: null,
        summary:
          "A deterministic World Forge visualization. Its mass and appearance are user-defined parameters, not telescope measurements or an astronomical discovery.",
      },
      provenance: "procedural",
      source: {
        archive: "Exora Custom Generator",
        catalog: "procedural",
        measurement: "User-defined parameter; not a telescope measurement.",
        retrievedOn: "2026-08-29",
        title: "Exora World Forge black-hole generator",
      },
      status: "synthetic",
      visual: {
        diskActivity,
        diskHueDegrees: clamp(parameters.diskHueDegrees, 0, 360),
        diskTiltDegrees: clamp(parameters.diskTiltDegrees, 0, 90),
        jetStrength: clampUnit(parameters.jetStrength),
        seed,
      },
    }),
  };
};
