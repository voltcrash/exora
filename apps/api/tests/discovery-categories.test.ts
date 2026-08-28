import { expect, test } from "vite-plus/test";
import {
  PLANET_DISCOVERY_CATEGORIES,
  PLANET_DISCOVERY_FILTERS,
  renderPlanetOrder,
  renderPlanetPredicate,
  type PlanetDiscoveryCategory,
} from "../src/discovery-categories.ts";

const categories = Object.keys(PLANET_DISCOVERY_FILTERS) as PlanetDiscoveryCategory[];

const render = (category: PlanetDiscoveryCategory): string => {
  const filter = PLANET_DISCOVERY_FILTERS[category];
  return `${renderPlanetPredicate(filter.where)} | ${renderPlanetOrder(filter.order)}`;
};

test("the twelve curated collections are the ones the API accepts", () => {
  expect(categories).toHaveLength(12);
  expect([...PLANET_DISCOVERY_CATEGORIES].sort()).toEqual([...categories].sort());
});

test("NASA's TAP service is never sent a nulls-ordering modifier it rejects", () => {
  for (const category of categories) {
    expect(render(category), category).not.toContain("nulls last");
  }
});

test("an ascending sort needs no modifier", () => {
  const order = PLANET_DISCOVERY_FILTERS["nearest-rocky-worlds"].order;

  expect(renderPlanetOrder(order)).toBe("sy_dist, pl_rade");
});

test("a disjunction is parenthesised so an enclosing conjunction cannot swallow it", () => {
  const where = renderPlanetPredicate(PLANET_DISCOVERY_FILTERS["extreme-weather"].where);

  expect(where).toBe("pl_eqt >= 1200 and (pl_radj >= 0.45 or pl_bmassj >= 0.08)");
});

test("nearest-first ordering measures distance from the reference value", () => {
  const order = PLANET_DISCOVERY_FILTERS["earth-like"].order;

  expect(renderPlanetOrder(order)).toBe("abs(pl_rade - 1), abs(pl_eqt - 255)");
});

test("every collection filters and orders on something", () => {
  for (const category of categories) {
    const filter = PLANET_DISCOVERY_FILTERS[category];

    expect(renderPlanetPredicate(filter.where), category).not.toBe("");
    expect(filter.order.length, category).toBeGreaterThan(0);
  }
});
