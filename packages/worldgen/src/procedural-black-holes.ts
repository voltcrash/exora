import {
  blackHoleProfileSchema,
  type BlackHoleKind,
  type BlackHoleProfile,
} from "@exora/contracts";

export interface ProceduralBlackHoleOptions {
  count: number;
  seed: number;
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

export const generateProceduralBlackHoles = ({
  count,
  seed,
}: ProceduralBlackHoleOptions): BlackHoleProfile[] => {
  if (!Number.isSafeInteger(count) || count < 0)
    throw new RangeError("count must be a non-negative safe integer");
  if (!Number.isFinite(seed)) throw new RangeError("seed must be finite");

  const normalizedSeed = Math.trunc(seed) >>> 0;
  return Array.from({ length: count }, (_, offset) => {
    const sequence = offset + 1;
    const random = createRandom(hashString(`${normalizedSeed}:${sequence}`));
    const massClass = MASS_CLASSES[Math.floor(random() * MASS_CLASSES.length)]!;
    const massSolar = roundedMass(logUniform(random, massClass.minimum, massClass.maximum));
    const diskActivity = between(random, 0.08, 1);
    const jetStrength = diskActivity < 0.25 ? 0 : between(random, 0, 1);
    const nameIndex = sequence.toString().padStart(4, "0");

    return blackHoleProfileSchema.parse({
      aliases: [],
      catalogDesignation: `EXORA-${normalizedSeed}-${nameIndex}`,
      constellation: null,
      distanceLightYears: null,
      host: "Procedural spacetime",
      id: `exora-synthetic-${normalizedSeed}-${nameIndex}`,
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
  });
};
