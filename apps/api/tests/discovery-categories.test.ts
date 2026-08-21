import { expect, test } from "vite-plus/test";
import {
  NASA_DIALECT,
  PLANET_DISCOVERY_CATEGORIES,
  PLANET_DISCOVERY_FILTERS,
  POSTGRES_DIALECT,
  renderPlanetOrder,
  renderPlanetPredicate,
  type PlanetDiscoveryCategory,
} from "../src/discovery-categories.ts";

const categories = Object.keys(PLANET_DISCOVERY_FILTERS) as PlanetDiscoveryCategory[];

const render = (category: PlanetDiscoveryCategory, dialect: typeof NASA_DIALECT): string => {
  const filter = PLANET_DISCOVERY_FILTERS[category];
  return `${renderPlanetPredicate(filter.where, dialect)} | ${renderPlanetOrder(filter.order, dialect)}`;
};

test("the twelve curated collections are the ones the API accepts", () => {
  expect(categories).toHaveLength(12);
  expect([...PLANET_DISCOVERY_CATEGORIES].sort()).toEqual([...categories].sort());
});

test("the two dialects differ only in column names and null ordering", () => {
  // The whole reason these live in one place: the archive path and the database path are meant
  // to be indistinguishable to a caller, and this is the assertion that says so.
  for (const category of categories) {
    const asPostgres = render(category, POSTGRES_DIALECT).replaceAll(" desc nulls last", " desc");
    let translated = render(category, NASA_DIALECT);
    for (const field of Object.keys(NASA_DIALECT.column) as (keyof typeof NASA_DIALECT.column)[]) {
      translated = translated.replaceAll(
        NASA_DIALECT.column[field],
        POSTGRES_DIALECT.column[field],
      );
    }

    expect(translated, category).toBe(asPostgres);
  }
});

test("neither dialect leaks the other's column names", () => {
  for (const category of categories) {
    const nasa = render(category, NASA_DIALECT);
    const postgres = render(category, POSTGRES_DIALECT);

    // `name` is a substring of nothing here, but every other Postgres column is distinctive.
    for (const field of ["radius_earth", "equilibrium_temperature_kelvin", "distance_parsecs"]) {
      expect(nasa, category).not.toContain(field);
    }
    for (const field of ["pl_rade", "pl_eqt", "sy_dist", "pl_radj", "pl_bmassj"]) {
      expect(postgres, category).not.toContain(field);
    }
  }
});

test("PostgreSQL descending sorts push unmeasured rows to the back", () => {
  // Left alone, PostgreSQL sorts nulls first on DESC, fronting the rows that measured nothing.
  const postgres = renderPlanetOrder(
    PLANET_DISCOVERY_FILTERS["record-breakers"].order,
    POSTGRES_DIALECT,
  );
  expect(postgres).toBe(
    "equilibrium_temperature_kelvin desc nulls last, mass_jupiter desc nulls last",
  );
});

test("NASA's TAP service is never sent a nulls-ordering modifier it rejects", () => {
  for (const category of categories) {
    expect(render(category, NASA_DIALECT), category).not.toContain("nulls last");
  }
});

test("an ascending sort needs no modifier in either dialect", () => {
  const order = PLANET_DISCOVERY_FILTERS["nearest-rocky-worlds"].order;

  expect(renderPlanetOrder(order, NASA_DIALECT)).toBe("sy_dist, pl_rade");
  expect(renderPlanetOrder(order, POSTGRES_DIALECT)).toBe("distance_parsecs, radius_earth");
});

test("a disjunction is parenthesised so an enclosing conjunction cannot swallow it", () => {
  // `extreme-weather` is a temperature bound AND a giant-by-either-measure test; without the
  // parentheses `or` binds loosest and the temperature bound would apply to only one branch.
  const where = renderPlanetPredicate(
    PLANET_DISCOVERY_FILTERS["extreme-weather"].where,
    NASA_DIALECT,
  );

  expect(where).toBe("pl_eqt >= 1200 and (pl_radj >= 0.45 or pl_bmassj >= 0.08)");
});

test("nearest-first ordering measures distance from the reference value", () => {
  const order = PLANET_DISCOVERY_FILTERS["earth-like"].order;

  expect(renderPlanetOrder(order, NASA_DIALECT)).toBe("abs(pl_rade - 1), abs(pl_eqt - 255)");
});

test("every collection filters and orders on something", () => {
  for (const category of categories) {
    const filter = PLANET_DISCOVERY_FILTERS[category];

    expect(renderPlanetPredicate(filter.where, NASA_DIALECT), category).not.toBe("");
    expect(filter.order.length, category).toBeGreaterThan(0);
  }
});
