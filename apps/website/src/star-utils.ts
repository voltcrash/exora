import type { StarProfile } from "@exora/contracts";
import { deriveStarRecipe } from "@exora/worldgen";

export interface StarVisualProfile {
  color: readonly [number, number, number];
  estimatedTemperatureKelvin: number;
  label: string;
}

export const deriveStarVisual = (star: StarProfile): StarVisualProfile => {
  const recipe = deriveStarRecipe(star);
  return {
    color: recipe.color,
    estimatedTemperatureKelvin: recipe.temperatureKelvin,
    label: recipe.label,
  };
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
