/**
 * The twelve curated planet collections, defined once.
 *
 * Every category has to be expressed twice — once as ADQL against NASA's `pscomppars`, once as
 * SQL against the synchronized `exoplanets` table — because which one runs depends on whether
 * `DATABASE_URL` is set. Written out twice, the pair was free to drift: a threshold nudged in one
 * dialect left the other quietly disagreeing, and nothing in the suite compared them. That is a
 * particularly bad failure to have, because the two paths are meant to be indistinguishable to a
 * caller and the difference only shows up as a slightly different list of worlds.
 *
 * So the rules live here as data, and each repository renders them into its own dialect. The two
 * differ in column names and in null ordering, and nothing else — which is exactly the claim the
 * shared definition now makes structurally instead of by hand.
 */

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

/** A measured quantity, named for what it is rather than for either archive's column. */
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
  /** Orders by `abs(field - target)`: closest to a reference value first. */
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

/** A giant by either measure: some rows carry a radius, some only a mass. */
const IS_GIANT = any(compare("radiusJupiter", ">=", 0.45), compare("massJupiter", ">=", 0.08));

/** Earth's scale and a temperate equilibrium, the reference both "earth-like" orders point at. */
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

export interface PlanetQueryDialect {
  column: Readonly<Record<PlanetField, string>>;
  /**
   * Whether a descending sort has to say where nulls go.
   *
   * PostgreSQL sorts nulls first on `DESC`, which would front the rows with nothing measured;
   * NASA's TAP service does not accept the modifier at all. Only some categories can actually
   * surface a null in a sort key, but emitting it uniformly is a no-op for the rest — their
   * `where` clause has already excluded nulls from that column.
   */
  nullsLastOnDescending: boolean;
}

export const NASA_DIALECT: PlanetQueryDialect = {
  column: {
    discoveryYear: "disc_year",
    distanceParsecs: "sy_dist",
    equilibriumTemperature: "pl_eqt",
    massJupiter: "pl_bmassj",
    name: "pl_name",
    radiusEarth: "pl_rade",
    radiusJupiter: "pl_radj",
  },
  nullsLastOnDescending: false,
};

export const POSTGRES_DIALECT: PlanetQueryDialect = {
  column: {
    discoveryYear: "discovery_year",
    distanceParsecs: "distance_parsecs",
    equilibriumTemperature: "equilibrium_temperature_kelvin",
    massJupiter: "mass_jupiter",
    name: "name",
    radiusEarth: "radius_earth",
    radiusJupiter: "radius_jupiter",
  },
  nullsLastOnDescending: true,
};

export const renderPlanetPredicate = (
  predicate: PlanetPredicate,
  dialect: PlanetQueryDialect,
): string => {
  switch (predicate.kind) {
    case "between": {
      const column = dialect.column[predicate.field];
      return `${column} between ${predicate.minimum} and ${predicate.maximum}`;
    }
    case "compare":
      return `${dialect.column[predicate.field]} ${predicate.operator} ${predicate.value}`;
    case "present":
      return `${dialect.column[predicate.field]} is not null`;
    case "all":
      return predicate.of.map((term) => renderPlanetPredicate(term, dialect)).join(" and ");
    case "any":
      // Parenthesised because an `any` is routinely one side of an enclosing `all`, where the
      // looser binding of `or` would otherwise swallow the other conditions.
      return `(${predicate.of.map((term) => renderPlanetPredicate(term, dialect)).join(" or ")})`;
  }
};

export const renderPlanetOrder = (
  order: readonly PlanetOrderTerm[],
  dialect: PlanetQueryDialect,
): string =>
  order
    .map((term) => {
      const column = dialect.column[term.field];
      if (term.kind === "nearest") return `abs(${column} - ${term.target})`;
      if (term.direction === "ascending") return column;
      return dialect.nullsLastOnDescending ? `${column} desc nulls last` : `${column} desc`;
    })
    .join(", ");
