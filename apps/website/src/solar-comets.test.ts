import { expect, test } from "vite-plus/test";
import { validateIrregularBodyDescriptor } from "./irregular-body.ts";
import { cometActivityAtDistance, findSolarComet, SOLAR_SYSTEM_COMETS } from "./solar-comets.ts";

test("the landmark collection contains every requested comet", () => {
  expect(SOLAR_SYSTEM_COMETS.map((comet) => comet.name)).toEqual([
    "1P/Halley",
    "67P/Churyumov–Gerasimenko",
    "9P/Tempel 1",
    "81P/Wild 2",
    "19P/Borrelly",
    "C/1995 O1 Hale–Bopp",
    "D/1993 F2 Shoemaker–Levy 9",
  ]);
});

test("every comet retains permanent identity, parent, uncertainty, and valid nucleus geometry", () => {
  for (const comet of SOLAR_SYSTEM_COMETS) {
    expect(comet.spkId).toMatch(/^\d+$/u);
    expect(comet.parent).toMatch(/^(?:Jupiter|Sun)$/u);
    expect(comet.uncertaintyNote.length).toBeGreaterThan(40);
    expect(validateIrregularBodyDescriptor(comet.descriptor)).toEqual([]);
  }
});

test("mission-resolved nuclei use archived plates while unresolved surfaces remain neutral", () => {
  for (const name of ["Halley", "67P", "Tempel 1", "Wild 2"]) {
    expect(findSolarComet(name)?.descriptor.shapeModel?.lods[0]?.triangleCount).toBeGreaterThan(
      5_000,
    );
  }
  for (const name of ["Borrelly", "Hale-Bopp", "Shoemaker-Levy 9"]) {
    expect(findSolarComet(name)?.descriptor.shapeModel).toBeUndefined();
  }
  expect(findSolarComet("Wild 2")?.uncertaintyNote).toContain("omitted");
});

test("activity is driven by heliocentric distance and becomes dormant beyond onset", () => {
  const comet = findSolarComet("67P")!;
  expect(cometActivityAtDistance(comet, 1.24)).toBeGreaterThan(cometActivityAtDistance(comet, 2.5));
  expect(cometActivityAtDistance(comet, comet.activity.onsetAu)).toBe(0);
  expect(cometActivityAtDistance(comet, 8)).toBe(0);
});

test("Shoemaker-Levy 9 uses a representative fragment identifier without claiming a measured shape", () => {
  const comet = findSolarComet("SL9")!;
  expect(comet.spkId).toBe("1000190");
  expect(comet.evidence.geometry).toBe("modeled-fragment");
  expect(comet.uncertaintyNote).toContain("fragment K");
});
