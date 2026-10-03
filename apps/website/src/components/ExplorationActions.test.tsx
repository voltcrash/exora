import type { StarProfile } from "@exora/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vite-plus/test";
import { ChromeContext } from "../chrome-context.ts";
import { featuredPlanet } from "../planet-profile.ts";
import type { XrStatus } from "../scene-host.ts";
import { PlanetExperience } from "./PlanetExperience.tsx";
import { StarExperience } from "./StarExperience.tsx";
import { TopBar } from "./shell/TopBar.tsx";

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

const withChrome = (node: ReactNode, chromeHidden = false): string =>
  renderToStaticMarkup(
    <ChromeContext
      value={{
        chromeHidden,
        openDiscover: vi.fn(),
        openPalette: vi.fn(),
        toggleChrome: vi.fn(),
      }}
    >
      {node}
    </ChromeContext>,
  );

const planetMarkup = (chromeHidden = false): string =>
  withChrome(
    <PlanetExperience
      host={null}
      onSelectHostStar={vi.fn()}
      onSelectPlanet={vi.fn()}
      onSelectStar={vi.fn()}
      onSelectSystem={vi.fn()}
      recipeOverride={null}
      result={{ cached: false, mode: "live", planet: featuredPlanet }}
      travelPhase="idle"
    />,
    chromeHidden,
  );

const starMarkup = (): string =>
  withChrome(
    <StarExperience
      host={null}
      onSelectPlanet={vi.fn()}
      onSelectSystem={vi.fn()}
      result={{ cached: false, mode: "live", star: sirius }}
      systemHostName={null}
      travelPhase="idle"
    />,
  );

const topBarMarkup = (xrStatus: XrStatus): string =>
  withChrome(<TopBar host={null} xrStatus={xrStatus} />);

const deckButtons = (markup: string): string[] => {
  const start = markup.indexOf('data-testid="control-deck"');
  expect(start).toBeGreaterThan(-1);
  const deck = markup.slice(start, markup.indexOf("</header>", start));
  return [...deck.matchAll(/<button[^>]*>/g)].map(([tag]) => tag);
};

const deckNames = (markup: string): string[] => {
  const start = markup.indexOf('data-testid="control-deck"');
  const deck = markup.slice(start, markup.indexOf("</header>", start));
  return [...deck.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map(
    ([, attributes, contents]) =>
      /aria-label="([^"]+)"/.exec(attributes ?? "")?.[1] ??
      (contents ?? "").replaceAll(/<[^>]+>/g, "").trim(),
  );
};

test("the world view gathers every control into the top bar", () => {
  const markup = planetMarkup();
  const header = markup.slice(markup.indexOf("<header"), markup.indexOf("</header>"));

  expect(deckNames(markup)).toEqual(["Explore", "Hide the interface"]);
  expect(header).toContain('aria-label="Go anywhere"');
  expect(header).toContain('aria-label="Exora home"');
});

test("the star view offers the same controls under the same names", () => {
  expect(deckNames(starMarkup())).toEqual(deckNames(planetMarkup()));
});

test.each([
  ["ready-vr", "Enter VR"],
  ["ready-ar", "View in AR"],
  ["ready-ar-launch", "View in AR"],
] as const)("the immersive control appears once %s is ready", (status, label) => {
  const markup = topBarMarkup(status);
  const immersive = deckButtons(markup).find((button) => button.includes('data-testid="enter-vr"'));

  expect(deckNames(markup)).toContain(label);
  expect(immersive).toBeDefined();
  expect(immersive).not.toContain("disabled");
});

test.each(["checking", "unavailable", "in-xr"] as const)(
  "the immersive control stays away while XR is %s",
  (status) => {
    expect(topBarMarkup(status)).not.toContain('data-testid="enter-vr"');
  },
);

test("the clear-view control becomes the way back when the interface is hidden", () => {
  const markup = planetMarkup(true);

  expect(deckNames(markup)).toContain("Show the interface");
  expect(deckButtons(markup).find((button) => button.includes("Show the interface"))).toContain(
    'aria-pressed="true"',
  );
  expect(markup).toContain('data-testid="restore-view"');
  expect(markup).toContain("chrome-hidden");
});

test("a world is introduced under its host star's light", () => {
  const markup = planetMarkup();

  expect(markup).toMatch(/--light-rgb:\s*\d+ \d+ \d+/);
  expect(markup).toContain("Confirmed world");
  expect(markup).toContain(`Visit ${featuredPlanet.hostStar}`);
  expect(markup).toContain("Whole system");
});
