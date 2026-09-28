import { expect, test } from "vite-plus/test";
import { readProvenance } from "./measurement-provenance.ts";

test("a radial-velocity world reads as a minimum mass with an estimated radius", () => {
  const reading = readProvenance({ massProvenance: "minimum", radiusProvenance: "estimated" });

  expect(reading).toMatchObject({
    massLabel: "Min. mass",
    massPrefix: "≥",
    radiusLabel: "Radius (est.)",
    radiusPrefix: "~",
    summary: "Minimum mass · Estimated radius",
  });
  expect(reading.note).toMatch(/^The mass is a minimum \(M sin i\).* never transited\.$/);
});

test("a mass from the archive's relation is marked as an estimate", () => {
  const reading = readProvenance({ massProvenance: "estimated", radiusProvenance: "measured" });

  expect(reading).toMatchObject({
    massLabel: "Mass (est.)",
    massPrefix: "~",
    radiusLabel: "Radius",
  });
  expect(reading.note).toMatch(/mass–radius relation/);
});

test("measured values and records without provenance read plainly", () => {
  for (const reading of [
    readProvenance({ massProvenance: "measured", radiusProvenance: "measured" }),
    readProvenance({}),
  ]) {
    expect(reading).toEqual({
      massLabel: "Mass",
      massPrefix: "",
      note: null,
      radiusLabel: "Radius",
      radiusPrefix: "",
      summary: null,
    });
  }
});
