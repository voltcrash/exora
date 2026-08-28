export type PlanetDiscoveryCategory =
  | "earth-like"
  | "lava-worlds"
  | "gas-giants"
  | "ocean-candidates"
  | "frozen-worlds"
  | "extreme-weather"
  | "potentially-habitable"
  | "recently-discovered"
  | "most-earth-like"
  | "nearest-rocky-worlds"
  | "recently-confirmed"
  | "record-breakers";

export type PlanetField =
  | "discoveryYear"
  | "distanceParsecs"
  | "equilibriumTemperature"
  | "massJupiter"
  | "name"
  | "radiusEarth"
  | "radiusJupiter";

export type PlanetPredicate =
  | { field: PlanetField; kind: "between"; maximum: number; minimum: number }
  | { field: PlanetField; kind: "compare"; operator: "<" | "<=" | ">" | ">="; value: number }
  | { field: PlanetField; kind: "present" }
  | { kind: "all"; of: readonly PlanetPredicate[] }
  | { kind: "any"; of: readonly PlanetPredicate[] };

export type PlanetOrderTerm =
  | { direction: "ascending" | "descending"; field: PlanetField; kind: "column" }
  | { field: PlanetField; kind: "nearest"; target: number };

export interface PlanetDiscoveryFilter {
  order: readonly PlanetOrderTerm[];
  where: PlanetPredicate;
}

const between = (field: PlanetField, minimum: number, maximum: number): PlanetPredicate => ({
  field,
  kind: "between",
  maximum,
  minimum,
});

const compare = (
  field: PlanetField,
  operator: "<" | "<=" | ">" | ">=",
  value: number,
): PlanetPredicate => ({ field, kind: "compare", operator, value });

const present = (field: PlanetField): PlanetPredicate => ({ field, kind: "present" });
const all = (...of: PlanetPredicate[]): PlanetPredicate => ({ kind: "all", of });
const any = (...of: PlanetPredicate[]): PlanetPredicate => ({ kind: "any", of });

const ascending = (field: PlanetField): PlanetOrderTerm => ({
  direction: "ascending",
  field,
  kind: "column",
});
const descending = (field: PlanetField): PlanetOrderTerm => ({
  direction: "descending",
  field,
  kind: "column",
});
const nearest = (field: PlanetField, target: number): PlanetOrderTerm => ({
  field,
  kind: "nearest",
  target,
});

const IS_GIANT = any(compare("radiusJupiter", ">=", 0.45), compare("massJupiter", ">=", 0.08));

const EARTH_LIKE_ORDER: readonly PlanetOrderTerm[] = [
  nearest("radiusEarth", 1),
  nearest("equilibriumTemperature", 255),
];

export const PLANET_DISCOVERY_FILTERS: Readonly<
  Record<PlanetDiscoveryCategory, PlanetDiscoveryFilter>
> = {
  "earth-like": {
    where: all(between("radiusEarth", 0.8, 1.6), between("equilibriumTemperature", 220, 320)),
    order: EARTH_LIKE_ORDER,
  },
  "lava-worlds": {
    where: all(compare("equilibriumTemperature", ">=", 1_000), compare("radiusEarth", "<", 3)),
    order: [descending("equilibriumTemperature")],
  },
  "gas-giants": {
    where: IS_GIANT,
    order: [descending("radiusJupiter")],
  },
  "ocean-candidates": {
    where: all(between("radiusEarth", 1.3, 2.6), between("equilibriumTemperature", 200, 350)),
    order: [nearest("equilibriumTemperature", 275), ascending("radiusEarth")],
  },
  "frozen-worlds": {
    where: compare("equilibriumTemperature", "<", 180),
    order: [ascending("equilibriumTemperature")],
  },
  "extreme-weather": {
    where: all(compare("equilibriumTemperature", ">=", 1_200), IS_GIANT),
    order: [descending("equilibriumTemperature")],
  },
  "potentially-habitable": {
    where: all(between("radiusEarth", 0.5, 1.8), between("equilibriumTemperature", 180, 330)),
    order: EARTH_LIKE_ORDER,
  },
  "recently-discovered": {
    where: present("discoveryYear"),
    order: [descending("discoveryYear"), ascending("name")],
  },
  "most-earth-like": {
    where: all(between("radiusEarth", 0.75, 1.5), between("equilibriumTemperature", 210, 320)),
    order: EARTH_LIKE_ORDER,
  },
  "nearest-rocky-worlds": {
    where: all(compare("radiusEarth", "<=", 2), present("distanceParsecs")),
    order: [ascending("distanceParsecs"), ascending("radiusEarth")],
  },
  "recently-confirmed": {
    where: present("discoveryYear"),
    order: [descending("discoveryYear"), ascending("name")],
  },
  "record-breakers": {
    where: any(compare("equilibriumTemperature", ">=", 1_500), compare("massJupiter", ">=", 5)),
    order: [descending("equilibriumTemperature"), descending("massJupiter")],
  },
};

export const PLANET_DISCOVERY_CATEGORIES = new Set<PlanetDiscoveryCategory>(
  Object.keys(PLANET_DISCOVERY_FILTERS) as PlanetDiscoveryCategory[],
);

const NASA_COLUMN: Readonly<Record<PlanetField, string>> = {
  discoveryYear: "disc_year",
  distanceParsecs: "sy_dist",
  equilibriumTemperature: "pl_eqt",
  massJupiter: "pl_bmassj",
  name: "pl_name",
  radiusEarth: "pl_rade",
  radiusJupiter: "pl_radj",
};

export const renderPlanetPredicate = (predicate: PlanetPredicate): string => {
  switch (predicate.kind) {
    case "between": {
      const column = NASA_COLUMN[predicate.field];
      return `${column} between ${predicate.minimum} and ${predicate.maximum}`;
    }
    case "compare":
      return `${NASA_COLUMN[predicate.field]} ${predicate.operator} ${predicate.value}`;
    case "present":
      return `${NASA_COLUMN[predicate.field]} is not null`;
    case "all":
      return predicate.of.map(renderPlanetPredicate).join(" and ");
    case "any":
      return `(${predicate.of.map(renderPlanetPredicate).join(" or ")})`;
  }
};

export const renderPlanetOrder = (order: readonly PlanetOrderTerm[]): string =>
  order
    .map((term) => {
      const column = NASA_COLUMN[term.field];
      if (term.kind === "nearest") return `abs(${column} - ${term.target})`;
      if (term.direction === "ascending") return column;
      return `${column} desc`;
    })
    .join(", ");
