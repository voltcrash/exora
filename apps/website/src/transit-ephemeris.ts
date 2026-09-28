import type { DetectionSignal } from "@exora/contracts";

/*
 * WHEN IT NEXT CROSSES
 *
 * The archive dates a transit in Barycentric Julian Date (TDB): the moment the dip would reach the
 * Solar System's centre of mass, not a telescope. Predicting a later one is T₀ + nP, but a clock on
 * Earth reads it earlier or later by the light time across Earth's orbit — up to 8.3 minutes —
 * depending on where Earth sits relative to the star, plus the 69.184 s by which TDB runs ahead of
 * UTC. Both are undone here. The ephemeris' own uncertainty grows by σP with every orbit, which is
 * why an old solution can no longer say within hours when a short-period world will cross.
 */

const UNIX_EPOCH_JD = 2_440_587.5;
const J2000_JD = 2_451_545;
const MS_PER_DAY = 86_400_000;
const TDB_MINUS_UTC_SECONDS = 69.184;
const LIGHT_SECONDS_PER_AU = 499.004_784;
const DEGREES = Math.PI / 180;

export interface TransitPrediction {
  /** Orbits counted from the archive's reference transit. */
  epoch: number;
  /** Mid-transit as an Earth-bound UTC clock would record it. */
  midTransitMs: number;
  /** One-sigma timing uncertainty in minutes, or null when the archive gave no errors. */
  uncertaintyMinutes: number | null;
}

/** Earth's position relative to the Sun in equatorial J2000 axes, in AU (±0.01). */
export const earthHeliocentric = (julianDate: number): readonly [number, number, number] => {
  const n = julianDate - J2000_JD;
  const meanLongitude = (280.46 + 0.985_647_4 * n) * DEGREES;
  const meanAnomaly = (357.528 + 0.985_600_3 * n) * DEGREES;
  const longitude =
    meanLongitude + (1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * DEGREES;
  const distance =
    1.000_14 - 0.016_71 * Math.cos(meanAnomaly) - 0.000_14 * Math.cos(2 * meanAnomaly);
  const obliquity = (23.439 - 0.000_000_4 * n) * DEGREES;
  // The Sun's geocentric position, negated.
  return [
    -distance * Math.cos(longitude),
    -distance * Math.cos(obliquity) * Math.sin(longitude),
    -distance * Math.sin(obliquity) * Math.sin(longitude),
  ];
};

/** Seconds by which light from this direction reaches the barycentre after it reaches Earth. */
export const roemerDelaySeconds = (
  julianDate: number,
  rightAscensionDegrees: number,
  declinationDegrees: number,
): number => {
  const [x, y, z] = earthHeliocentric(julianDate);
  const alpha = rightAscensionDegrees * DEGREES;
  const delta = declinationDegrees * DEGREES;
  const dot =
    x * Math.cos(delta) * Math.cos(alpha) +
    y * Math.cos(delta) * Math.sin(alpha) +
    z * Math.sin(delta);
  return dot * LIGHT_SECONDS_PER_AU;
};

/** An Earth-clock UTC instant for a barycentric TDB Julian date toward the given sky position. */
export const bjdToUtcMs = (
  bjd: number,
  rightAscensionDegrees: number | null,
  declinationDegrees: number | null,
): number => {
  const roemer =
    rightAscensionDegrees === null || declinationDegrees === null
      ? 0
      : roemerDelaySeconds(bjd, rightAscensionDegrees, declinationDegrees);
  const julianDateUtc = bjd - (TDB_MINUS_UTC_SECONDS + roemer) / 86_400;
  return (julianDateUtc - UNIX_EPOCH_JD) * MS_PER_DAY;
};

const utcMsToJulianDate = (ms: number): number => ms / MS_PER_DAY + UNIX_EPOCH_JD;

/** The next `count` mid-transit times after `nowMs`, or none without a transit ephemeris. */
export const predictTransits = ({
  count = 3,
  declinationDegrees,
  nowMs,
  periodDays,
  rightAscensionDegrees,
  signal,
}: {
  count?: number;
  declinationDegrees: number | null;
  nowMs: number;
  periodDays: number | null;
  rightAscensionDegrees: number | null;
  signal: DetectionSignal | undefined;
}): TransitPrediction[] => {
  const reference = signal?.transitMidpointBjd ?? null;
  if (reference === null || periodDays === null || !(periodDays > 0)) return [];
  const periodError = signal?.orbitalPeriodUncertaintyDays ?? null;
  const referenceError = signal?.transitMidpointUncertaintyDays ?? null;
  // Roemer delay is under nine minutes, so an epoch one orbit early is always safe to start from.
  const first = Math.ceil((utcMsToJulianDate(nowMs) - reference) / periodDays) - 1;
  const predictions: TransitPrediction[] = [];
  for (let epoch = first; predictions.length < count; epoch += 1) {
    const midTransitMs = bjdToUtcMs(
      reference + epoch * periodDays,
      rightAscensionDegrees,
      declinationDegrees,
    );
    if (midTransitMs <= nowMs) continue;
    const uncertaintyDays =
      periodError === null && referenceError === null
        ? null
        : Math.hypot(referenceError ?? 0, epoch * (periodError ?? 0));
    predictions.push({
      epoch,
      midTransitMs,
      uncertaintyMinutes: uncertaintyDays === null ? null : uncertaintyDays * 24 * 60,
    });
  }
  return predictions;
};

const wholeNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const twoFigures = new Intl.NumberFormat("en", { maximumSignificantDigits: 2 });

const untilLabel = (ms: number): string => {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `in ${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `in ${String(hours)} h ${String(minutes % 60)} min`;
  return `in ${String(Math.floor(hours / 24))} d ${String(hours % 24)} h`;
};

const uncertaintyLabel = (minutes: number): string =>
  minutes < 1
    ? "±<1 min"
    : minutes < 90
      ? `±${wholeNumber.format(minutes)} min`
      : minutes < 48 * 60
        ? `±${twoFigures.format(minutes / 60)} h`
        : `±${twoFigures.format(minutes / 1_440)} d`;

export interface TransitTimingFact {
  detail: string;
  label: string;
  tone?: "accent" | "cyan";
  value: string;
}

/**
 * The next crossing as a panel fact. When the timing error has outgrown half the transit itself,
 * the prediction is flagged rather than printed as if it could be observed to the minute.
 */
export const nextTransitFact = (
  predictions: readonly TransitPrediction[],
  durationHours: number | null,
  nowMs: number,
  dateFormat: Intl.DateTimeFormat,
): TransitTimingFact | null => {
  const [next, ...later] = predictions;
  if (!next) return null;
  const error = next.uncertaintyMinutes;
  const stale = error !== null && durationHours !== null && error > (durationHours * 60) / 2;
  const parts = [
    untilLabel(next.midTransitMs - nowMs),
    error === null ? "timing error not reported" : uncertaintyLabel(error),
    `orbit ${wholeNumber.format(next.epoch)} of the archive's ephemeris`,
    stale
      ? "the timing error rivals the transit itself, so watch a wide window"
      : later.length > 0
        ? `then ${later.map((prediction) => dateFormat.format(prediction.midTransitMs)).join(", ")}`
        : null,
    "barycentric time converted to an Earth clock",
  ].filter((part): part is string => part !== null);
  return {
    detail: parts.join(" · "),
    label: "Next transit",
    tone: stale ? "accent" : "cyan",
    value: dateFormat.format(next.midTransitMs),
  };
};
