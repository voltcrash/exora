import { expect, test } from "vite-plus/test";
import {
  CONSTELLATION_NAMES,
  constellationAtB1875,
  constellationOf,
  latitudeReach,
  midnightSeason,
  precessFromJ2000,
  skyFacts,
  viewingAid,
} from "./sky-position.ts";
import { CONSTELLATION_BOUNDARIES } from "./constellation-boundaries.ts";

test("every boundary names one of the 88 constellations", () => {
  const names = new Set(CONSTELLATION_BOUNDARIES.map(([, , , name]) => name));

  expect(names.size).toBe(88);
  expect([...names].every((name) => CONSTELLATION_NAMES[name])).toBe(true);
});

test("Roman's own B1875 examples land where the paper says", () => {
  // Roman (1987) lists these after precessing B1950 inputs; the 1875 positions differ by under a degree.
  expect(constellationAtB1875(9, 65)).toBe("UMa");
  expect(constellationAtB1875(5.1, 9.1)).toBe("Ori");
  expect(constellationAtB1875(19, -40)).toBe("CrA");
  expect(constellationAtB1875(6.2, -81.1)).toBe("Men");
});

test("precession to 1875 moves a position by about 50 arcseconds a year", () => {
  const b1875 = precessFromJ2000(0, 0, 2_405_889.258_550_475);
  const shiftArcseconds =
    Math.hypot(b1875.rightAscensionDegrees - 360, b1875.declinationDegrees) * 3_600;

  expect(shiftArcseconds / 125).toBeCloseTo(50, -1);
});

test("familiar objects fall in the constellations they are known in", () => {
  expect(constellationOf(88.793, 7.407).name).toBe("Orion");
  expect(constellationOf(37.955, 89.264).name).toBe("Ursa Minor");
  expect(constellationOf(101.287, -16.716).name).toBe("Canis Major");
  expect(constellationOf(217.429, -62.679).name).toBe("Centaurus");
  expect(constellationOf(346.626, -5.043).name).toBe("Aquarius");
  expect(constellationOf(266.417, -29.008).name).toBe("Sagittarius");
  expect(constellationOf(279.235, 38.784).name).toBe("Lyra");
  expect(constellationOf(10.684, 41.269).name).toBe("Andromeda");
});

test("an object opposite the Sun culminates at midnight in the right season", () => {
  expect(midnightSeason(88.8)).toMatch(/December/);
  expect(midnightSeason(279.2)).toMatch(/^(late June|early July)$/);
  expect(midnightSeason(346.6)).toMatch(/(August|September)/);
});

test("declination alone decides who can see it and who never loses it", () => {
  expect(latitudeReach(-62.7)).toEqual({
    circumpolarBeyond: { hemisphere: "south", latitude: 27.3 },
    neverRisesBeyond: { hemisphere: "north", latitude: 27.3 },
  });
  expect(latitudeReach(0.2)).toEqual({ circumpolarBeyond: null, neverRisesBeyond: null });
});

test("magnitude decides the instrument", () => {
  expect(viewingAid(-1.46)).toBe("naked eye");
  expect(viewingAid(8)).toBe("binoculars");
  expect(viewingAid(11)).toBe("small telescope");
  expect(viewingAid(18.8)).toBe("large telescope");
});

test("sky facts read a position into a constellation, season, reach, instrument and journey", () => {
  const facts = skyFacts({
    declinationDegrees: -62.679,
    distanceParsecs: 1.3012,
    rightAscensionDegrees: 217.429,
    visualMagnitude: 11.13,
  });

  expect(facts.map(({ label, value }) => [label, value])).toEqual([
    ["Constellation", "Centaurus"],
    ["Best seen", expect.stringMatching(/(April|May)/)],
    ["Who can see it", "South of 27.3° N"],
    ["To see it", "A small telescope"],
    ["Voyager 1 would take", "75.3 thousand years"],
  ]);
  expect(
    skyFacts({
      declinationDegrees: null,
      distanceParsecs: 1,
      rightAscensionDegrees: 0,
      visualMagnitude: null,
    }),
  ).toEqual([]);
});
