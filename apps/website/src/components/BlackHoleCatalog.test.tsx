import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vite-plus/test";
import { BLACK_HOLES, findBlackHole } from "../black-holes.ts";
import { BlackHoleResult } from "./BlackHoleCatalog.tsx";

test("a result carries its catalog identity, family, status and measured mass", () => {
  const markup = renderToStaticMarkup(
    <BlackHoleResult blackHole={BLACK_HOLES[0]!} onSelect={vi.fn()} />,
  );

  expect(markup).toContain("Sagittarius A*");
  expect(markup).toContain("Sgr A*");
  expect(markup).toContain("SUPERMASSIVE · CONFIRMED");
  expect(markup).toContain("4.3 million M☉");
});

test("an imaged horizon says so rather than repeating its milestone", () => {
  const markup = renderToStaticMarkup(
    <BlackHoleResult blackHole={findBlackHole("M87*")!} onSelect={vi.fn()} />,
  );

  expect(markup).toContain("Directly imaged horizon");
});

test("an observed candidate with unknown mass renders an honest unavailable state", () => {
  const candidate = {
    ...BLACK_HOLES[3]!,
    massSolar: null,
    status: "candidate" as const,
  };
  const markup = renderToStaticMarkup(<BlackHoleResult blackHole={candidate} onSelect={vi.fn()} />);

  expect(markup).toContain("Mass unavailable");
  expect(markup).toContain("CANDIDATE");
  expect(markup).not.toContain("NaN");
  expect(markup).not.toContain("undefined");
});
