import { generateProceduralBlackHoles } from "@exora/worldgen";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vite-plus/test";
import { BLACK_HOLES } from "../black-holes.ts";
import { BlackHoleCard } from "./BlackHoleCatalog.tsx";

test("observed cards carry an OBSERVED badge and their real source link", () => {
  const markup = renderToStaticMarkup(
    <BlackHoleCard blackHole={BLACK_HOLES[0]!} index={0} onSelect={vi.fn()} />,
  );

  expect(markup).toContain("OBSERVED");
  expect(markup).toContain('href="https://www.nasa.gov/');
});

test("procedural cards are labeled and never render a source link", () => {
  const synthetic = generateProceduralBlackHoles({ count: 1, seed: 42 })[0]!;
  const markup = renderToStaticMarkup(
    <BlackHoleCard blackHole={synthetic} index={0} onSelect={vi.fn()} />,
  );

  expect(markup).toContain("PROCEDURAL");
  expect(markup).toContain("EXORA SYNTHETIC 0001");
  expect(markup).not.toContain("href=");
  expect(markup).not.toContain("OBSERVED");
});

test("an observed candidate with unknown mass renders an honest unavailable state", () => {
  const candidate = {
    ...BLACK_HOLES[3]!,
    massSolar: null,
    status: "candidate" as const,
  };
  const markup = renderToStaticMarkup(
    <BlackHoleCard blackHole={candidate} index={0} onSelect={vi.fn()} />,
  );

  expect(markup).toContain("Mass unavailable");
  expect(markup).not.toContain("NaN");
  expect(markup).not.toContain("undefined");
});
