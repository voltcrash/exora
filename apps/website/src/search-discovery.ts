import type { ExoplanetProfile, StarProfile } from "@exora/contracts";

interface SearchIdentity {
  aliases?: readonly string[];
  name: string;
}

const PLANET_IDENTITIES: readonly SearchIdentity[] = [
  { name: "Kepler-452 b", aliases: ["Kepler 452b", "Earth's cousin"] },
  { name: "Kepler-22 b" },
  { name: "Kepler-62 f" },
  { name: "Kepler-1649 c" },
  { name: "TRAPPIST-1 e", aliases: ["Trappist 1e"] },
  { name: "TRAPPIST-1 f", aliases: ["Trappist 1f"] },
  { name: "Proxima Cen b", aliases: ["Proxima Centauri b"] },
  { name: "TOI-700 d", aliases: ["TOI 700d"] },
  { name: "TOI-700 e", aliases: ["TOI 700e"] },
  { name: "WASP-39 b", aliases: ["WASP 39b"] },
  { name: "WASP-12 b", aliases: ["WASP 12b"] },
  { name: "HD 189733 b" },
  { name: "55 Cnc e", aliases: ["55 Cancri e"] },
  { name: "K2-18 b", aliases: ["K2 18b"] },
  { name: "Gliese 12 b", aliases: ["GJ 12 b"] },
  { name: "HIP 65426 b" },
] as const;

const STAR_IDENTITIES: readonly SearchIdentity[] = [
  { name: "Sirius", aliases: ["Alpha Canis Majoris", "alf CMa"] },
  { name: "Betelgeuse", aliases: ["Alpha Orionis", "alf Ori"] },
  { name: "Rigel", aliases: ["Beta Orionis", "bet Ori"] },
  { name: "Vega", aliases: ["Alpha Lyrae", "alf Lyr"] },
  { name: "Polaris", aliases: ["Alpha Ursae Minoris", "alf UMi"] },
  { name: "Altair", aliases: ["Alpha Aquilae", "alf Aql"] },
  { name: "Antares", aliases: ["Alpha Scorpii", "alf Sco"] },
  { name: "Proxima Centauri", aliases: ["Alpha Centauri C", "alf Cen C"] },
  { name: "Barnard's star", aliases: ["Barnard Star"] },
  { name: "Alpha Centauri A", aliases: ["alf Cen A"] },
  { name: "Alpha Centauri B", aliases: ["alf Cen B"] },
  { name: "Tau Ceti", aliases: ["HD 10700"] },
  { name: "Epsilon Eridani", aliases: ["eps Eri", "HD 22049"] },
  { name: "TRAPPIST-1", aliases: ["2MASS J23062928-0502285"] },
] as const;

const normalizeIdentity = (value: string): string =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, "");

const editDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? right.length;
};

const findSuggestion = (query: string, identities: readonly SearchIdentity[]): string | null => {
  const normalizedQuery = normalizeIdentity(query);
  if (normalizedQuery.length < 3) return null;

  let best: { distance: number; name: string } | null = null;
  for (const identity of identities) {
    for (const candidate of [identity.name, ...(identity.aliases ?? [])]) {
      const normalizedCandidate = normalizeIdentity(candidate);
      const distance = editDistance(normalizedQuery, normalizedCandidate);
      if (!best || distance < best.distance) best = { distance, name: identity.name };
      if (distance === 0) {
        return identity.name.toLowerCase() === query.toLowerCase() ? null : identity.name;
      }
    }
  }

  const threshold = normalizedQuery.length > 9 ? 3 : normalizedQuery.length > 4 ? 2 : 1;
  return best && best.distance <= threshold ? best.name : null;
};

export const suggestPlanetName = (query: string): string | null =>
  findSuggestion(query, PLANET_IDENTITIES);

export const suggestStarName = (query: string): string | null =>
  findSuggestion(query, STAR_IDENTITIES);

export const planetNotableTrait = (planet: ExoplanetProfile): string => {
  const temperature = planet.observation.equilibriumTemperatureKelvin;
  const radius = planet.observation.radiusEarth;
  if (temperature !== null && temperature >= 1_200) return "Ultra-hot atmosphere";
  if (temperature !== null && temperature < 180) return "Frozen frontier";
  if (
    planet.kind === "rocky" &&
    radius !== null &&
    radius >= 0.75 &&
    radius <= 1.6 &&
    temperature !== null &&
    temperature >= 200 &&
    temperature <= 330
  ) {
    return "Earth-scale & temperate";
  }
  if (planet.kind === "gas-giant") return "Deep hydrogen skies";
  if (planet.kind === "ice-giant") return "Volatile-rich giant";
  if ((planet.observation.discoveryYear ?? 0) >= 2024) return "Recent confirmation";
  return `${planet.observation.discoveryMethod} discovery`;
};

export interface PhysicalPlanetFilters {
  composition: number;
  distance: number;
  habitableZone: boolean;
  scale: number;
  temperature: number;
  weather: number;
  wellMeasured: boolean;
}

export const DEFAULT_PHYSICAL_PLANET_FILTERS: PhysicalPlanetFilters = {
  composition: 50,
  distance: 50,
  habitableZone: false,
  scale: 50,
  temperature: 50,
  weather: 50,
  wellMeasured: false,
};

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

const axisMatches = (control: number, observed: number | null): boolean => {
  if (control >= 34 && control <= 66) return true;
  if (observed === null) return false;
  return control < 34 ? observed <= 0.42 : observed >= 0.58;
};

const measuredFieldCount = (planet: ExoplanetProfile): number => {
  const observation = planet.observation;
  return [
    observation.radiusEarth ?? observation.radiusJupiter,
    observation.massEarth ?? observation.massJupiter,
    observation.equilibriumTemperatureKelvin,
    observation.orbitalPeriodDays,
    observation.semiMajorAxisAu,
    observation.distanceParsecs,
    observation.hostTemperatureKelvin,
    observation.hostRadiusSolar,
  ].filter((value) => value !== null).length;
};

export const filterPlanetsByPhysicalControls = (
  planets: readonly ExoplanetProfile[],
  filters: PhysicalPlanetFilters,
  limit = 24,
): ExoplanetProfile[] =>
  planets
    .map((planet, index) => {
      const observation = planet.observation;
      const composition =
        planet.kind === "rocky"
          ? 0
          : planet.kind === "ice-giant"
            ? 0.68
            : planet.kind === "gas-giant"
              ? 1
              : null;
      const temperature =
        observation.equilibriumTemperatureKelvin === null
          ? null
          : clampUnit((observation.equilibriumTemperatureKelvin - 120) / 1_680);
      const earthRadius =
        observation.radiusEarth ??
        (observation.radiusJupiter === null ? null : observation.radiusJupiter * 11.21);
      const scale = earthRadius === null ? null : clampUnit((earthRadius - 0.5) / 13.5);
      const distance =
        observation.distanceParsecs === null ? null : clampUnit(observation.distanceParsecs / 300);
      const weather =
        temperature === null || composition === null
          ? null
          : clampUnit(temperature * 0.72 + composition * 0.28);
      const habitable =
        planet.kind === "rocky" &&
        observation.equilibriumTemperatureKelvin !== null &&
        observation.equilibriumTemperatureKelvin >= 180 &&
        observation.equilibriumTemperatureKelvin <= 330;
      const matches =
        axisMatches(filters.composition, composition) &&
        axisMatches(filters.temperature, temperature) &&
        axisMatches(filters.scale, scale) &&
        axisMatches(filters.distance, distance) &&
        axisMatches(filters.weather, weather) &&
        (!filters.habitableZone || habitable) &&
        (!filters.wellMeasured || measuredFieldCount(planet) >= 6);
      const score =
        Math.abs(filters.composition / 100 - (composition ?? 0.5)) +
        Math.abs(filters.temperature / 100 - (temperature ?? 0.5)) +
        Math.abs(filters.scale / 100 - (scale ?? 0.5)) +
        Math.abs(filters.distance / 100 - (distance ?? 0.5)) +
        Math.abs(filters.weather / 100 - (weather ?? 0.5));
      return { index, matches, planet, score };
    })
    .filter(({ matches }) => matches)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, Math.max(1, limit))
    .map(({ planet }) => planet);

export const starNotableTrait = (star: StarProfile): string => {
  if ((star.observation.distanceParsecs ?? Number.POSITIVE_INFINITY) < 5) {
    return "Local stellar neighbor";
  }
  if (star.kind === "white-dwarf") return "Compact stellar remnant";
  if (star.kind === "neutron-star") return "Collapsed stellar core";
  if (star.kind === "binary") return "Multi-star system";
  if (star.kind === "variable") return "Changing brightness";
  if (/^[OB]/i.test(star.observation.spectralType ?? "")) return "High-energy blue star";
  if ((star.observation.visualMagnitude ?? Number.POSITIVE_INFINITY) <= 1) return "Naked-eye icon";
  return star.objectType;
};
