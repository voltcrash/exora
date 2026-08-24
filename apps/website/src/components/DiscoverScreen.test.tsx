import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vite-plus/test";
import { DiscoverScreen, type DiscoverSection } from "./DiscoverScreen.tsx";

const discoverMarkup = (initialSection: DiscoverSection = "overview"): string =>
  renderToStaticMarkup(
    <DiscoverScreen
      initialForgeMode="planet"
      initialSection={initialSection}
      onClose={vi.fn()}
      onGeneratePlanet={vi.fn()}
      onGenerateStar={vi.fn()}
      onSelectAsteroid={vi.fn()}
      onSelectBlackHole={vi.fn()}
      onSelectComet={vi.fn()}
      onSelectMission={vi.fn()}
      onSelectPlanet={vi.fn()}
      onSelectRegion={vi.fn()}
      onSelectStar={vi.fn()}
    />,
  );

test("one Discover directory exposes every exploration surface", () => {
  const markup = discoverMarkup();

  expect(markup).toContain("Solar System");
  expect(markup).toContain("Exoplanets");
  expect(markup).toContain("Stars");
  expect(markup).toContain("Black Holes");
  expect(markup).toContain("World Forge");
  expect(markup).toContain('aria-label="Discover destinations"');
});

test("the black-hole destination exposes the five sourced landmarks", () => {
  const markup = discoverMarkup("black-holes");

  expect(markup).toContain('aria-label="Black hole catalog"');
  expect(markup).toContain("Sagittarius A*");
  expect(markup).toContain("M87*");
  expect(markup).toContain("TON 618");
  expect(markup).toContain("Cygnus X-1");
  expect(markup).toContain("Gaia BH1");
  expect(markup).toContain("interpretive gravitational-lensing visualization");
});

test("an embedded catalog becomes a named region inside the full-screen dialog", () => {
  const markup = discoverMarkup("worlds");

  expect(markup).toContain('aria-label="Exoplanet catalog"');
  expect(markup).toContain('role="region"');
  expect(markup).not.toContain('aria-label="Close planet catalog"');
  expect(markup).toContain('aria-label="Close Discover"');
});
