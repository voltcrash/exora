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
  expect(markup).toContain("World Forge");
  expect(markup).toContain('aria-label="Discover destinations"');
});

test("an embedded catalog becomes a named region inside the full-screen dialog", () => {
  const markup = discoverMarkup("worlds");

  expect(markup).toContain('aria-label="Exoplanet catalog"');
  expect(markup).toContain('role="region"');
  expect(markup).not.toContain('aria-label="Close planet catalog"');
  expect(markup).toContain('aria-label="Close Discover"');
});
