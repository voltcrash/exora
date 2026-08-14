import { expect, test } from "vite-plus/test";
import { suggestPlanetName, suggestStarName } from "./search-discovery.ts";

test("corrects planet misspellings and punctuation-free catalog numbers", () => {
  expect(suggestPlanetName("keplar-452 b")).toBe("Kepler-452 b");
  expect(suggestPlanetName("wasp39b")).toBe("WASP-39 b");
});

test("matches familiar and catalog star identities", () => {
  expect(suggestStarName("betelguese")).toBe("Betelgeuse");
  expect(suggestStarName("HD10700")).toBe("Tau Ceti");
});

test("does not suggest unrelated or incomplete signals", () => {
  expect(suggestPlanetName("xy")).toBeNull();
  expect(suggestStarName("something unrelated")).toBeNull();
});
