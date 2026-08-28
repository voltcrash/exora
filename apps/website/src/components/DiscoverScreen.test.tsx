import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vite-plus/test";
import { DiscoverScreen, type DiscoverSection } from "./DiscoverScreen.tsx";

const discoverMarkup = (initialSection?: DiscoverSection): string =>
  renderToStaticMarkup(
    <DiscoverScreen
      initialForgeMode="planet"
      {...(initialSection ? { initialSection } : {})}
      onClose={vi.fn()}
      onGeneratePlanet={vi.fn()}
      onGenerateStar={vi.fn()}
      onSelectBlackHole={vi.fn()}
      onSelectPlanet={vi.fn()}
      onSelectRegion={vi.fn()}
      onSelectStar={vi.fn()}
    />,
  );

test("Discover starts directly in the Exoplanet catalog", () => {
  const markup = discoverMarkup();
  const navigation = markup.slice(markup.indexOf("<nav"), markup.indexOf("</nav>"));

  expect(markup).toContain("Solar System");
  expect(markup).toContain("Exoplanets");
  expect(markup).toContain("Stars");
  expect(markup).toContain("Black Holes");
  expect(markup).toContain("World Forge");
  expect(markup).toContain('aria-label="Discover destinations"');
  expect(markup).toContain('aria-label="Exoplanet catalog"');
  expect(markup).toContain("Find another world.");
  expect(markup).toContain('data-icon="solar"');
  expect(markup).toContain('data-icon="worlds"');
  expect(markup).toContain('data-icon="stars"');
  expect(markup).toContain('data-icon="black-holes"');
  expect(markup).toContain('data-icon="forge"');
  expect(markup).not.toContain("All of space. One way in.");
  expect(navigation).toMatch(
    /Exoplanets[\s\S]*Stars[\s\S]*Solar System[\s\S]*Black Holes[\s\S]*World Forge/,
  );
});

test("the Solar System catalog retains regions without removed feature collections", () => {
  const markup = discoverMarkup("solar");

  expect(markup).toContain("Regions · statistical populations and measured boundaries");
  expect(markup).not.toContain("Missions · optional trajectories and exploration sites");
  expect(markup).not.toContain("Asteroids · mission encounters and targets");
  expect(markup).not.toContain("Dwarf-planet systems · 4 unresolved moons");
  expect(markup).not.toContain("Comets · measured nuclei and simulated activity");
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
