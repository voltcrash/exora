/**
 * Content model for the in-headset console.
 *
 * Everything the flat page can do has to be reachable from inside a session, which means the
 * headset needs its own copy of the catalog vocabulary, an on-screen keyboard, and the world
 * forge's parameter ranges. All of it is plain data and pure functions here so the console
 * module is left with nothing but Babylon wiring — and so the parts that are easy to get subtly
 * wrong (clamping, paging, key handling) can be tested without a headset.
 */

import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomPlanetParameters, CustomStarParameters } from "@exora/worldgen";
import { formatNumber } from "./planet-utils.tsx";

export interface XrCatalogEntry {
  id: string;
  label: string;
  note: string;
}

/** Mirrors the browser catalog's curated collections so both surfaces offer the same journeys. */
export const PLANET_COLLECTIONS: readonly XrCatalogEntry[] = [
  { id: "most-earth-like", label: "Most Earth-like", note: "Closest to Earth's scale" },
  { id: "nearest-rocky-worlds", label: "Nearest rocky worlds", note: "Small worlds nearby" },
  { id: "recently-confirmed", label: "Recently confirmed", note: "Newest archive additions" },
  { id: "record-breakers", label: "Record breakers", note: "Hottest and most massive" },
];

export const PLANET_CATEGORIES: readonly XrCatalogEntry[] = [
  { id: "earth-like", label: "Earth-like", note: "Familiar scale" },
  { id: "lava-worlds", label: "Lava worlds", note: "Molten terrain" },
  { id: "gas-giants", label: "Gas giants", note: "Vast cloud decks" },
  { id: "ocean-candidates", label: "Ocean worlds", note: "Possible seas" },
  { id: "frozen-worlds", label: "Frozen worlds", note: "Cold frontiers" },
  { id: "extreme-weather", label: "Extreme weather", note: "Violent skies" },
  { id: "potentially-habitable", label: "Habitable", note: "Temperate rock" },
  { id: "recently-discovered", label: "Newest finds", note: "Fresh discoveries" },
];

export const STAR_COLLECTIONS: readonly XrCatalogEntry[] = [
  { id: "closest-neighbors", label: "Closest to home", note: "Nearest neighbours" },
  { id: "solar-analogs", label: "The Sun's cousins", note: "Sun-like spectra" },
  { id: "brightest-stars", label: "Brightest in our sky", note: "Iconic lights" },
  { id: "stellar-extremes", label: "Stellar extremes", note: "Rare and massive" },
];

export const STAR_CATEGORIES: readonly XrCatalogEntry[] = [
  { id: "nearby-stars", label: "Nearby stars", note: "Our neighbourhood" },
  { id: "sun-like", label: "Sun-like", note: "F & G sequence" },
  { id: "red-dwarfs", label: "Red dwarfs", note: "Small and cool" },
  { id: "blue-stars", label: "Blue stars", note: "Hot and luminous" },
  { id: "giants", label: "Giants", note: "Evolved stages" },
  { id: "binary-systems", label: "Binaries", note: "Paired stars" },
  { id: "variable-stars", label: "Variables", note: "Changing light" },
  { id: "stellar-remnants", label: "Remnants", note: "Dwarfs & pulsars" },
];

const keyRow = (keys: string): readonly string[] => keys.split(" ");

/** Key faces for the in-world keyboard, laid out ten to a row to match the panel's grid. */
export const KEYBOARD_ROWS: readonly (readonly string[])[] = [
  keyRow("1 2 3 4 5 6 7 8 9 0"),
  keyRow("Q W E R T Y U I O P"),
  keyRow("A S D F G H J K L -"),
  keyRow("Z X C V B N M . ␣ ⌫"),
];

export type KeyStroke = string;

/** Applies one key face to the query. `⌫`, `␣` and `⌦` are the editing keys. */
export const applyKeyStroke = (query: string, key: KeyStroke, maxLength = 28): string => {
  if (key === "⌫") return query.slice(0, -1);
  if (key === "⌦") return "";
  const character = key === "␣" ? " " : key;
  if (query.length >= maxLength) return query;
  return `${query}${character}`;
};

export interface Page<Item> {
  items: readonly Item[];
  page: number;
  pageCount: number;
}

/** Clamps a page index into range and slices it out, so an empty result never reads as page 2. */
export const paginate = <Item>(
  items: readonly Item[],
  page: number,
  pageSize: number,
): Page<Item> => {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(0, page), pageCount - 1);
  return {
    items: items.slice(current * pageSize, current * pageSize + pageSize),
    page: current,
    pageCount,
  };
};

const percentage = (value: number): string => `${Math.round(value * 100)}%`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export type PlanetForgeKey =
  | "activity"
  | "atmosphere"
  | "axialTilt"
  | "radius"
  | "rotation"
  | "temperatureKelvin"
  | "water";

export interface PlanetForgeField {
  format: (parameters: CustomPlanetParameters) => string;
  key: PlanetForgeKey;
  label: (parameters: CustomPlanetParameters) => string;
  max: number;
  min: number;
  step: number;
  visible?: (parameters: CustomPlanetParameters) => boolean;
}

const planetRadiusLabel = (parameters: CustomPlanetParameters): string =>
  parameters.kind === "rocky"
    ? `${(0.45 + parameters.radius * 1.65).toFixed(2)} R⊕`
    : parameters.kind === "ice-giant"
      ? `${(2.1 + parameters.radius * 4.2).toFixed(1)} R⊕`
      : `${(0.72 + parameters.radius * 1.18).toFixed(2)} RJ`;

export const PLANET_FORGE_FIELDS: readonly PlanetForgeField[] = [
  {
    format: planetRadiusLabel,
    key: "radius",
    label: () => "Planet scale",
    max: 1,
    min: 0,
    step: 0.05,
  },
  {
    format: (parameters) => `${parameters.temperatureKelvin} K`,
    key: "temperatureKelvin",
    label: () => "Temperature",
    max: 2_400,
    min: 60,
    step: 40,
  },
  {
    format: (parameters) => percentage(parameters.activity),
    key: "activity",
    label: (parameters) => (parameters.kind === "rocky" ? "Terrain activity" : "Storm activity"),
    max: 1,
    min: 0,
    step: 0.05,
  },
  {
    format: (parameters) => percentage(parameters.atmosphere),
    key: "atmosphere",
    label: (parameters) => (parameters.kind === "rocky" ? "Cloud density" : "Atmosphere depth"),
    max: 1,
    min: 0,
    step: 0.05,
  },
  {
    format: (parameters) =>
      parameters.temperatureKelvin >= 650 ? "VAPORIZED" : percentage(parameters.water),
    key: "water",
    label: () => "Surface water",
    max: 1,
    min: 0,
    step: 0.05,
    visible: (parameters) => parameters.kind === "rocky",
  },
  {
    format: (parameters) => percentage(parameters.rotation),
    key: "rotation",
    label: () => "Rotation rate",
    max: 1,
    min: 0,
    step: 0.05,
  },
  {
    format: (parameters) => `${Math.round((parameters.axialTilt - 0.5) * 90)}°`,
    key: "axialTilt",
    label: () => "Axial tilt",
    max: 1,
    min: 0,
    step: 0.05,
  },
];

export type StarForgeKey = "activity" | "radius" | "rotation" | "temperatureKelvin";

export interface StarForgeField {
  format: (parameters: CustomStarParameters) => string;
  key: StarForgeKey;
  label: string;
  max: number;
  min: number;
  step: number;
}

export const STAR_FORGE_FIELDS: readonly StarForgeField[] = [
  {
    format: (parameters) => `${parameters.temperatureKelvin.toLocaleString("en")} K`,
    key: "temperatureKelvin",
    label: "Temperature",
    max: 40_000,
    min: 2_000,
    step: 500,
  },
  {
    format: (parameters) => percentage(parameters.radius),
    key: "radius",
    label: "Visual scale",
    max: 1,
    min: 0,
    step: 0.05,
  },
  {
    format: (parameters) => percentage(parameters.activity),
    key: "activity",
    label: "Surface activity",
    max: 1,
    min: 0,
    step: 0.05,
  },
  {
    format: (parameters) => percentage(parameters.rotation),
    key: "rotation",
    label: "Rotation rate",
    max: 1,
    min: 0,
    step: 0.05,
  },
];

const roundStep = (value: number, step: number): number =>
  step < 1 ? Math.round(value * 100) / 100 : Math.round(value);

export const adjustPlanetField = (
  parameters: CustomPlanetParameters,
  field: PlanetForgeField,
  direction: -1 | 1,
): CustomPlanetParameters => {
  const next = { ...parameters };
  next[field.key] = roundStep(
    clamp(parameters[field.key] + field.step * direction, field.min, field.max),
    field.step,
  );
  return next;
};

export const adjustStarField = (
  parameters: CustomStarParameters,
  field: StarForgeField,
  direction: -1 | 1,
): CustomStarParameters => {
  const next = { ...parameters };
  next[field.key] = roundStep(
    clamp(parameters[field.key] + field.step * direction, field.min, field.max),
    field.step,
  );
  return next;
};

export const PLANET_FORGE_KINDS: readonly CustomPlanetParameters["kind"][] = [
  "rocky",
  "ice-giant",
  "gas-giant",
];

export const STAR_FORGE_KINDS: readonly CustomStarParameters["kind"][] = [
  "main-sequence",
  "evolved",
  "variable",
  "binary",
  "white-dwarf",
  "neutron-star",
];

/** Steps through a fixed list of choices, which is how a headset picks from a `<select>`. */
export const cycle = <Item>(values: readonly Item[], current: Item, direction: -1 | 1): Item => {
  const index = values.indexOf(current);
  const next = (index + direction + values.length) % values.length;
  return values[next] ?? current;
};

export const forgeSeed = (random: () => number = Math.random): number =>
  Math.floor(random() * 1_000_000);

export const forgePlanetKindLabel = (kind: CustomPlanetParameters["kind"]): string =>
  kind === "rocky" ? "Rocky world" : kind === "ice-giant" ? "Ice giant" : "Gas giant";

export const forgeStarKindLabel = (kind: CustomStarParameters["kind"]): string =>
  ({
    binary: "Binary system",
    evolved: "Giant star",
    "main-sequence": "Main-sequence",
    "neutron-star": "Neutron star",
    star: "Star",
    variable: "Variable star",
    "white-dwarf": "White dwarf",
  })[kind];

const kelvin = (value: number | null): string => (value === null ? "—" : `${Math.round(value)} K`);

/** One line of catalog context per result, short enough to survive the row's width. */
export const planetCellDetail = (planet: ExoplanetProfile): string => {
  const { distanceParsecs, equilibriumTemperatureKelvin } = planet.observation;
  return [
    planet.kind.replace("-", " "),
    equilibriumTemperatureKelvin === null ? null : kelvin(equilibriumTemperatureKelvin),
    distanceParsecs === null ? null : `${formatNumber(distanceParsecs, 0)} pc`,
  ]
    .filter(Boolean)
    .join(" · ");
};

export const starCellDetail = (star: StarProfile): string => {
  const { distanceParsecs, spectralType, visualMagnitude } = star.observation;
  return [
    spectralType ?? star.kind.replaceAll("-", " "),
    distanceParsecs === null ? null : `${formatNumber(distanceParsecs, 0)} pc`,
    visualMagnitude === null ? null : `mag ${formatNumber(visualMagnitude, 1)}`,
  ]
    .filter(Boolean)
    .join(" · ");
};

export const planetFacts = (planet: ExoplanetProfile): { label: string; value: string }[] => {
  const observation = planet.observation;
  return [
    {
      label: "Mass",
      value:
        observation.massJupiter === null
          ? `${formatNumber(observation.massEarth)} M⊕`
          : `${formatNumber(observation.massJupiter)} MJ`,
    },
    {
      label: "Radius",
      value:
        observation.radiusJupiter === null
          ? `${formatNumber(observation.radiusEarth)} R⊕`
          : `${formatNumber(observation.radiusJupiter)} RJ`,
    },
    { label: "Equilibrium", value: kelvin(observation.equilibriumTemperatureKelvin) },
    { label: "Orbit", value: `${formatNumber(observation.semiMajorAxisAu, 2)} AU` },
    { label: "Period", value: `${formatNumber(observation.orbitalPeriodDays, 1)} d` },
    { label: "Distance", value: `${formatNumber(observation.distanceParsecs, 0)} pc` },
    { label: "Host star", value: planet.hostStar },
    { label: "Discovery", value: observation.discoveryMethod },
  ];
};

export const starFacts = (star: StarProfile): { label: string; value: string }[] => {
  const observation = star.observation;
  return [
    { label: "Object type", value: star.objectType },
    { label: "Spectrum", value: observation.spectralType ?? "—" },
    { label: "Distance", value: `${formatNumber(observation.distanceParsecs, 1)} pc` },
    { label: "Parallax", value: `${formatNumber(observation.parallaxMas, 2)} mas` },
    { label: "Visual magnitude", value: formatNumber(observation.visualMagnitude, 2) },
    { label: "Gaia magnitude", value: formatNumber(observation.gaiaMagnitude, 2) },
    { label: "Catalog", value: star.catalogName },
  ];
};
