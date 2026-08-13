import { expect, test } from "vite-plus/test";
import { featuredPlanet } from "./planet-profile.ts";
import { deriveWorldRecipe } from "./world-recipe.ts";

test("world recipes are deterministic for the same planet", () => {
  const first = deriveWorldRecipe(featuredPlanet);
  const second = deriveWorldRecipe(featuredPlanet);

  expect(second).toEqual(first);
});

test("hot massive gas giants produce the intended visual family", () => {
  const recipe = deriveWorldRecipe(featuredPlanet);

  expect(recipe.classification).toBe("Young super-Jupiter");
  expect(recipe.atmosphere.label).toContain("inferred");
  expect(recipe.radiusSceneUnits).toBeGreaterThan(4);
});
