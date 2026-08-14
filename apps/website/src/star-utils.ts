import type { StarProfile } from "@exora/contracts";

export interface StarVisualProfile {
  color: readonly [number, number, number];
  estimatedTemperatureKelvin: number;
  label: string;
}

const spectralProfiles: Record<string, StarVisualProfile> = {
  O: { color: [0.55, 0.7, 1], estimatedTemperatureKelvin: 35_000, label: "Blue star" },
  B: { color: [0.62, 0.75, 1], estimatedTemperatureKelvin: 18_000, label: "Blue-white star" },
  A: { color: [0.78, 0.84, 1], estimatedTemperatureKelvin: 8_500, label: "White star" },
  F: { color: [1, 0.94, 0.78], estimatedTemperatureKelvin: 6_700, label: "Yellow-white star" },
  G: { color: [1, 0.78, 0.38], estimatedTemperatureKelvin: 5_700, label: "Yellow star" },
  K: { color: [1, 0.52, 0.2], estimatedTemperatureKelvin: 4_500, label: "Orange star" },
  M: { color: [1, 0.25, 0.1], estimatedTemperatureKelvin: 3_200, label: "Red star" },
};

export const deriveStarVisual = (star: StarProfile): StarVisualProfile => {
  const spectralClass = star.observation.spectralType?.match(/[OBAFGKM]/i)?.[0]?.toUpperCase();
  return spectralProfiles[spectralClass ?? "G"] ?? spectralProfiles.G;
};

export const starKindLabel = (star: StarProfile): string =>
  star.kind.replaceAll("-", " ").toUpperCase();

export const starSummary = (star: StarProfile): string => {
  const visual = deriveStarVisual(star);
  const spectrum = star.observation.spectralType
    ? `Its ${star.observation.spectralType} spectrum suggests a ${visual.label.toLowerCase()}`
    : `SIMBAD classifies it as ${star.objectType.toLowerCase()}`;
  const distance = star.observation.distanceParsecs;
  return `${spectrum}${distance === null ? "." : `, observed from roughly ${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(distance)} parsecs away.`}`;
};
