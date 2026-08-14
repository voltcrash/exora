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

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const temperatureColor = (temperatureKelvin: number): readonly [number, number, number] => {
  const temperature = clamp(temperatureKelvin, 1_000, 40_000) / 100;
  const red = temperature <= 66 ? 255 : 329.698727446 * (temperature - 60) ** -0.1332047592;
  const green =
    temperature <= 66
      ? 99.4708025861 * Math.log(temperature) - 161.1195681661
      : 288.1221695283 * (temperature - 60) ** -0.0755148492;
  const blue =
    temperature >= 66
      ? 255
      : temperature <= 19
        ? 0
        : 138.5177312231 * Math.log(temperature - 10) - 305.0447927307;
  return [clamp(red, 0, 255) / 255, clamp(green, 0, 255) / 255, clamp(blue, 0, 255) / 255];
};

export const deriveStarVisual = (star: StarProfile): StarVisualProfile => {
  const spectralClass = star.observation.spectralType?.match(/[OBAFGKM]/i)?.[0]?.toUpperCase();
  const profile = spectralProfiles[spectralClass ?? "G"] ?? spectralProfiles.G;
  return star.customization
    ? {
        ...profile,
        color: temperatureColor(star.customization.temperatureKelvin),
        estimatedTemperatureKelvin: star.customization.temperatureKelvin,
      }
    : profile;
};

export const starKindLabel = (star: StarProfile): string =>
  star.kind.replaceAll("-", " ").toUpperCase();

export const starSummary = (star: StarProfile): string => {
  const visual = deriveStarVisual(star);
  if (star.source.archive === "Exora Custom Generator") {
    return `A user-designed ${visual.label.toLowerCase()} synthesized from its chosen stellar family, temperature, scale, activity, rotation, and generation seed.`;
  }
  const spectrum = star.observation.spectralType
    ? `Its ${star.observation.spectralType} spectrum suggests a ${visual.label.toLowerCase()}`
    : `SIMBAD classifies it as ${star.objectType.toLowerCase()}`;
  const distance = star.observation.distanceParsecs;
  return `${spectrum}${distance === null ? "." : `, observed from roughly ${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(distance)} parsecs away.`}`;
};
