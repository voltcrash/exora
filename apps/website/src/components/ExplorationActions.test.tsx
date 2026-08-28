import type { StarProfile } from "@exora/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vite-plus/test";
import { featuredPlanet } from "../planet-profile.ts";
import { PlanetExperience } from "./PlanetExperience.tsx";
import { StarExperience } from "./StarExperience.tsx";
import { MissionControl } from "./MissionControl.tsx";

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
      onToggleChrome={vi.fn()}
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
      onToggleChrome={vi.fn()}
      onOpenDiscover={vi.fn()}
      onSelectPlanet={vi.fn()}
      onSelectSystem={vi.fn()}
      result={{ cached: false, mode: "live", star: sirius }}
      systemHostName={null}
      travelPhase="idle"
    />,
  );

const deckButtons = (markup: string): string[] => {
  const start = markup.indexOf('class="control-deck"');
  expect(start).toBeGreaterThan(-1);
  const deck = markup.slice(start, markup.indexOf("</footer>", start));
  return [...deck.matchAll(/<button[^>]*>/g)].map(([tag]) => tag);
};

const deckNames = (markup: string): string[] =>
  deckButtons(markup).map((button) => /aria-label="([^"]+)"/.exec(button)?.[1] ?? "");

test("the world view gathers every control onto one named deck", () => {
  const markup = planetMarkup();

  expect(deckNames(markup)).toEqual(["Open Discover", "Hide the interface", "XR: NOT AVAILABLE"]);
  expect(markup).toContain('<kbd class="shortcut-icon" aria-label="Backspace or Delete">⌫</kbd>');
  expect(markup).toContain('<kbd class="shortcut-icon" aria-label="Tab">⇥</kbd>');
  expect(markup).toContain('class="discover-trigger-icon"');
  expect(markup).toContain('class="clear-view-icon"');
  expect(markup).toContain("<small>XR</small><strong>NOT AVAILABLE</strong>");

  const header = markup.slice(markup.indexOf("<header"), markup.indexOf("</header>"));
  expect([...header.matchAll(/<button[^>]*>/g)]).toHaveLength(0);
});

test("the star view gathers the same controls onto the same deck", () => {
  expect(deckNames(starMarkup())).toEqual([
    "Open Discover",
    "Hide the interface",
    "XR: NOT AVAILABLE",
  ]);
});

test("the same control is named the same way from either view", () => {
  expect(deckNames(planetMarkup())).toEqual(deckNames(starMarkup()));
});

test.each([
  ["ready-vr", "VR AVAILABLE"],
  ["ready-ar", "AR AVAILABLE"],
  ["ready-ar-launch", "AR AVAILABLE"],
] as const)("the shared immersive control reflects the selected %s mode", (status, copy) => {
  const markup = renderToStaticMarkup(
    <MissionControl
      chromeHidden={false}
      hints={[]}
      onOpenDiscover={vi.fn()}
      onToggleChrome={vi.fn()}
      sceneFailed={false}
      xr={{ host: null, status }}
    />,
  );

  expect(markup).toContain(`<strong>${copy}</strong>`);
  expect(markup).toContain("<small>XR</small>");
  expect(markup).toContain('class="immersive-mode-icon"');
  expect(markup).not.toContain("disabled");
});

test("the unavailable immersive control reports its XR state", () => {
  const markup = renderToStaticMarkup(
    <MissionControl
      chromeHidden={false}
      hints={[]}
      onOpenDiscover={vi.fn()}
      onToggleChrome={vi.fn()}
      sceneFailed={false}
      xr={{ host: null, status: "unavailable" }}
    />,
  );

  expect(markup).toContain("<small>XR</small><strong>NOT AVAILABLE</strong>");
  expect(markup).toContain('class="immersive-mode-icon"');
  expect(markup).toContain("disabled");
});

test("the clear-view control becomes the way back when the interface is hidden", () => {
  const markup = renderToStaticMarkup(
    <PlanetExperience
      chromeHidden
      host={null}
      onToggleChrome={vi.fn()}
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

  expect(deckNames(markup)).toContain("Show the interface");
  expect(deckButtons(markup).find((button) => button.includes("Show the interface"))).toContain(
    'aria-pressed="true"',
  );
});
