import { expect, test } from "vite-plus/test";
import {
  generateCustomBlackHole,
  generateProceduralBlackHoles,
} from "../src/procedural-black-holes.ts";

test("the same seed always produces identical black-hole profiles", () => {
  expect(generateProceduralBlackHoles({ count: 12, seed: 42 })).toEqual(
    generateProceduralBlackHoles({ count: 12, seed: 42 }),
  );
});

test("procedural IDs are unique and stable", () => {
  const profiles = generateProceduralBlackHoles({ count: 20, seed: 42 });

  expect(profiles[6]?.id).toBe("exora-synthetic-42-0007");
  expect(new Set(profiles.map(({ id }) => id)).size).toBe(profiles.length);
});

test("different seeds produce visibly and numerically different profiles", () => {
  const first = generateProceduralBlackHoles({ count: 4, seed: 42 });
  const second = generateProceduralBlackHoles({ count: 4, seed: 43 });

  expect(first.map(({ massSolar }) => massSolar)).not.toEqual(
    second.map(({ massSolar }) => massSolar),
  );
  expect(first.map(({ visual }) => visual)).not.toEqual(second.map(({ visual }) => visual));
});

test("generated profiles cover physical mass classes without claiming observation", () => {
  const profiles = generateProceduralBlackHoles({ count: 100, seed: 9 });

  expect(new Set(profiles.map(({ kind }) => kind))).toEqual(
    new Set(["stellar-mass", "intermediate-mass", "supermassive", "ultramassive"]),
  );
  expect(
    profiles.every(
      ({ provenance, source, status }) =>
        provenance === "procedural" && status === "synthetic" && source.url === undefined,
    ),
  ).toBe(true);
  expect(
    profiles.every(({ observation }) => observation.summary.includes("not telescope measurements")),
  ).toBe(true);
});

test("a larger count preserves the deterministic prefix", () => {
  expect(generateProceduralBlackHoles({ count: 5, seed: 7 })).toEqual(
    generateProceduralBlackHoles({ count: 10, seed: 7 }).slice(0, 5),
  );
});

test("World Forge parameters produce a named black hole with the requested appearance", () => {
  const generated = generateCustomBlackHole({
    diskActivity: 0.82,
    diskHueDegrees: 214,
    diskTiltDegrees: 38,
    jetStrength: 0.67,
    kind: "intermediate-mass",
    mass: 0.5,
    name: "  Janus  ",
    seed: 7319,
  });

  expect(generated.blackHole).toMatchObject({
    id: "custom-black-hole-7319",
    kind: "intermediate-mass",
    massSolar: 3162,
    name: "Janus",
    provenance: "procedural",
    status: "synthetic",
    visual: {
      diskActivity: 0.82,
      diskHueDegrees: 214,
      diskTiltDegrees: 38,
      jetStrength: 0.67,
      seed: 7319,
    },
  });
});
