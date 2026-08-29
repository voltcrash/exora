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

test("renders every curated discovery collection as valid NASA TAP predicates and ordering", () => {
  expect(categories).toHaveLength(12);
  expect([...PLANET_DISCOVERY_CATEGORIES].sort()).toEqual([...categories].sort());
  for (const category of categories) {
    expect(render(category), category).not.toContain("nulls last");
    const filter = PLANET_DISCOVERY_FILTERS[category];
    expect(renderPlanetPredicate(filter.where), category).not.toBe("");
    expect(filter.order.length, category).toBeGreaterThan(0);
  }
  const order = PLANET_DISCOVERY_FILTERS["nearest-rocky-worlds"].order;
  expect(renderPlanetOrder(order)).toBe("sy_dist, pl_rade");
  const where = renderPlanetPredicate(PLANET_DISCOVERY_FILTERS["extreme-weather"].where);
  expect(where).toBe("pl_eqt >= 1200 and (pl_radj >= 0.45 or pl_bmassj >= 0.08)");
  expect(renderPlanetOrder(PLANET_DISCOVERY_FILTERS["earth-like"].order)).toBe(
    "abs(pl_rade - 1), abs(pl_eqt - 255)",
  );
});
