import { expect, test } from "vite-plus/test";
import {
  countByGroup,
  createNearestIndex,
  decodePopulation,
  discoveriesByYear,
  logPosition,
  matchWorlds,
  METHOD_GROUPS,
  plotWorlds,
} from "./atlas-model.ts";

const worlds = decodePopulation({
  methods: ["Transit", "Radial Velocity", "Imaging", "Microlensing"],
  rows: [
    ["TRAPPIST-1 e", 6.099, 0.92, 0.692, 249.7, 12.43, 2017, 0, 0],
    ["51 Peg b", 4.231, 13.4, 146, 1260, 15.47, 1995, 1, 1 | 2],
    ["HIP 65426 b", null, 16.8, 2860, 1500, 108.9, 2017, 2, 0],
    ["OGLE-2005-BLG-390L b", 3_500, 1.9, 5.5, 50, 6_570, 2005, 3, 1 | 4],
  ],
});

test("methods fold into four groups whose colours never move", () => {
  expect(worlds.map((world) => world.group)).toEqual([
    "transit",
    "radial-velocity",
    "other",
    "microlensing",
  ]);
  expect(METHOD_GROUPS.map((group) => group.id)).toEqual([
    "transit",
    "radial-velocity",
    "microlensing",
    "other",
  ]);
});

test("log positions put a domain's ends at zero and one", () => {
  expect(logPosition(0.1, [0.1, 1_000])).toBe(0);
  expect(logPosition(1_000, [0.1, 1_000])).toBe(1);
  expect(logPosition(10, [0.1, 1_000])).toBeCloseTo(0.5, 9);
});

test("estimated radii are left off the radius plane unless asked for, then marked", () => {
  const hidden = new Set<never>();
  const measuredOnly = plotWorlds(worlds, "radius", { hidden, includeEstimates: false });
  const withEstimates = plotWorlds(worlds, "radius", { hidden, includeEstimates: true });

  expect(measuredOnly.map((point) => worlds[point.index]!.name)).toEqual(["TRAPPIST-1 e"]);
  expect(withEstimates.filter((point) => point.estimated)).toHaveLength(2);
  expect(withEstimates.some((point) => worlds[point.index]!.name === "HIP 65426 b")).toBe(false);
});

test("a minimum mass is still a measurement on the mass plane; a relation-filled one is not", () => {
  const plotted = plotWorlds(worlds, "mass", { hidden: new Set(), includeEstimates: false });

  expect(plotted.map((point) => worlds[point.index]!.name).sort()).toEqual([
    "51 Peg b",
    "TRAPPIST-1 e",
  ]);
});

test("hidden method groups drop out without repainting the rest", () => {
  const plotted = plotWorlds(worlds, "mass", {
    hidden: new Set(["transit"]),
    includeEstimates: true,
  });

  expect(plotted.map((point) => worlds[point.index]!.group)).toEqual([
    "radial-velocity",
    "microlensing",
  ]);
});

test("the nearest index finds the closest world within reach and nothing beyond it", () => {
  const points = [
    { estimated: false, index: 0, x: 0.2, y: 0.2 },
    { estimated: false, index: 1, x: 0.8, y: 0.8 },
    { estimated: false, index: 2, x: 0.02, y: 0.5 },
  ];
  const nearest = createNearestIndex(points);

  expect(nearest(0.21, 0.19, 0.05)?.index).toBe(0);
  expect(nearest(0.79, 0.82, 0.05)?.index).toBe(1);
  expect(nearest(0.5, 0.5, 0.05)).toBeNull();
  expect(nearest(0.0, 0.5, 0.05)?.index).toBe(2);
});

test("discoveries are tallied per year with the empty years kept", () => {
  const years = discoveriesByYear(worlds);

  expect(years[0]).toMatchObject({ total: 1, year: 1995 });
  expect(years).toHaveLength(2017 - 1995 + 1);
  expect(years.at(-1)).toMatchObject({ counts: { other: 1, transit: 1 }, total: 2, year: 2017 });
  expect(years.find((entry) => entry.year === 2000)?.total).toBe(0);
  expect(countByGroup(worlds)).toEqual({
    microlensing: 1,
    other: 1,
    "radial-velocity": 1,
    transit: 1,
  });
});

test("the find box ignores case and punctuation and prefers prefixes", () => {
  expect(matchWorlds(worlds, "trappist1").map((world) => world.name)).toEqual(["TRAPPIST-1 e"]);
  expect(matchWorlds(worlds, "b").map((world) => world.name)[0]).toBe("51 Peg b");
  expect(matchWorlds(worlds, "  ")).toEqual([]);
});
