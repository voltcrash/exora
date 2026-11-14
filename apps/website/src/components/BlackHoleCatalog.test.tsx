import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vite-plus/test";
import { BLACK_HOLES, findBlackHole } from "../black-holes.ts";
import { BlackHoleResult } from "./BlackHoleCatalog.tsx";

test("a result carries its name, family and measured mass, without restating confirmation", () => {
  const markup = renderToStaticMarkup(
    <BlackHoleResult blackHole={BLACK_HOLES[0]!} onSelect={vi.fn()} />,
  );

  expect(markup).toContain("Sagittarius A*");
  expect(markup).toContain("Supermassive");
  expect(markup).toContain("4.3 million M☉");
  expect(markup).not.toContain("Confirmed");
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
  expect(markup).toContain("Candidate");
  expect(markup).not.toContain("NaN");
  expect(markup).not.toContain("undefined");
});
