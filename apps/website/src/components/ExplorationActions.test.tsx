import type { StarProfile } from "@exora/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vite-plus/test";
import { featuredPlanet } from "../planet-profile.ts";
import { PlanetExperience } from "./PlanetExperience.tsx";
import { StarExperience } from "./StarExperience.tsx";

/**
 * Discover sheds its text on narrow phones and keeps only a decorative orbital mark. The name
 * therefore has to come from an attribute the media query cannot reach.
 *
 * `renderToStaticMarkup` is enough: no effect runs, no scene mounts, and the header is the part
 * of the tree that renders from props alone.
 */
const sirius: StarProfile = {
  catalogName: "* alf CMa",
  id: "alf-cma",
  kind: "binary",
  name: "Sirius",
  objectType: "Spectroscopic binary",
  observation: {
    declinationDegrees: -16.716,
    distanceParsecs: 2.637,
    gaiaMagnitude: null,
    parallaxMas: 379.21,
    properMotionDecMasPerYear: -1223.07,
    properMotionRaMasPerYear: -546.01,
    radialVelocityKmPerSecond: -5.5,
    rightAscensionDegrees: 101.287,
    spectralType: "A0mA1Va",
    visualMagnitude: -1.46,
  },
  source: { archive: "SIMBAD", retrievedOn: "2026-08-14", tables: ["basic", "ident", "allfluxes"] },
};

const planetMarkup = (): string =>
  renderToStaticMarkup(
    <PlanetExperience
      chromeHidden={false}
      host={null}
      onGeneratePlanet={vi.fn()}
      onGenerateStar={vi.fn()}
      onHideChrome={vi.fn()}
      onOpenDiscover={vi.fn()}
      onSelectHostStar={vi.fn()}
      onSelectPlanet={vi.fn()}
      onSelectStar={vi.fn()}
      onSelectSystem={vi.fn()}
      recipeOverride={null}
      result={{ cached: false, mode: "live", planet: featuredPlanet }}
      travelPhase="idle"
    />,
  );

const starMarkup = (): string =>
  renderToStaticMarkup(
    <StarExperience
      chromeHidden={false}
      host={null}
      onGeneratePlanet={vi.fn()}
      onGenerateStar={vi.fn()}
      onHideChrome={vi.fn()}
      onOpenDiscover={vi.fn()}
      onSelectPlanet={vi.fn()}
      onSelectStar={vi.fn()}
      onSelectSystem={vi.fn()}
      result={{ cached: false, mode: "live", star: sirius }}
      systemHostName={null}
      travelPhase="idle"
    />,
  );

/** The buttons in the top bar, which is the first `exploration-actions` group in the markup. */
const explorationActions = (markup: string): string[] => {
  const start = markup.indexOf('class="exploration-actions"');
  expect(start).toBeGreaterThan(-1);
  const group = markup.slice(start, markup.indexOf("</header>", start));
  return [...group.matchAll(/<button[^>]*>/g)].map(([tag]) => tag);
};

test("the Discover entry on the world view names itself", () => {
  const buttons = explorationActions(planetMarkup());

  expect(buttons).toHaveLength(1);
  expect(buttons[0]).toContain('aria-label="Open Discover"');
});

test("the Discover entry on the star view names itself", () => {
  const buttons = explorationActions(starMarkup());

  expect(buttons).toHaveLength(1);
  expect(buttons[0]).toContain('aria-label="Open Discover"');
});

test("the same destination is named the same way from either view", () => {
  const namesOf = (markup: string): string[] =>
    explorationActions(markup)
      .map((button) => /aria-label="([^"]+)"/.exec(button)?.[1] ?? "")
      .sort();

  expect(namesOf(planetMarkup())).toEqual(namesOf(starMarkup()));
});
