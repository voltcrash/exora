import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vite-plus/test";
import { DiscoverScreen, type DiscoverSection } from "./DiscoverScreen.tsx";

const discoverMarkup = (initialSection?: DiscoverSection): string =>
  renderToStaticMarkup(
    <DiscoverScreen
      initialForgeMode="planet"
      {...(initialSection ? { initialSection } : {})}
      onClose={vi.fn()}
      onGenerateBlackHole={vi.fn()}
      onGeneratePlanet={vi.fn()}
      onGenerateStar={vi.fn()}
      onSelectBlackHole={vi.fn()}
      onSelectPlanet={vi.fn()}
      onSelectRegion={vi.fn()}
      onSelectStar={vi.fn()}
      onStartTour={vi.fn()}
    />,
  );

test("Explore starts directly in the Exoplanet catalog", () => {
  const markup = discoverMarkup();
  const navigation = markup.slice(markup.indexOf("<nav"), markup.indexOf("</nav>"));

  expect(markup).toContain('aria-label="Explore destinations"');
  expect(markup).toContain('aria-label="Exoplanet catalog"');
  expect(markup).toContain("Find another world");
  for (const icon of ["worlds", "stars", "solar", "black-holes", "atlas", "tours", "forge"]) {
    expect(navigation).toContain(`data-icon="${icon}"`);
  }
  expect(navigation).toMatch(
    /Browse[\s\S]*Exoplanets[\s\S]*Stars[\s\S]*Solar System[\s\S]*Black Holes[\s\S]*Learn[\s\S]*Atlas[\s\S]*Guided Tours[\s\S]*Create[\s\S]*World Forge/,
  );
  expect(navigation).toContain('aria-current="page"');
});

test("the Solar System catalog keeps its regions", () => {
  const markup = discoverMarkup("solar");

  expect(markup).toContain("Regions · statistical populations and measured boundaries");
  expect(markup).not.toContain("Missions · optional trajectories and exploration sites");
  expect(markup).not.toContain("Comets · measured nuclei and simulated activity");
});

test("the black-hole catalog lists the five sourced landmarks", () => {
  const markup = discoverMarkup("black-holes");

  expect(markup).toContain('aria-label="Black hole catalog"');
  for (const name of ["Sagittarius A*", "M87*", "TON 618", "Cygnus X-1", "Gaia BH1"]) {
    expect(markup).toContain(name);
  }
});

test("search leads every searchable catalog, with a way to be surprised beside it", () => {
  for (const [section, random] of [
    ["worlds", "Random world"],
    ["stars", "Random star"],
    ["black-holes", "Random horizon"],
  ] as const) {
    const markup = discoverMarkup(section);
    const searchPosition = markup.indexOf('type="search"');
    const collectionsPosition = markup.indexOf("All ");

    expect(searchPosition).toBeGreaterThan(-1);
    expect(searchPosition).toBeLessThan(collectionsPosition);
    expect(markup.match(/type="search"/g)).toHaveLength(1);
    expect(markup).toContain(random);
  }
});

test("collections and kinds share one rail, with everything selected first", () => {
  const markup = discoverMarkup("worlds");

  expect(markup).toContain('aria-label="Planet collections"');
  expect(markup).toMatch(/aria-pressed="true"[^>]*>All worlds</);
  expect(markup).toContain("Most Earth-like");
  expect(markup).toContain("Lava worlds");
});

test("a catalog is a named region inside the full-screen dialog", () => {
  const markup = discoverMarkup("worlds");

  expect(markup).toContain('aria-label="Exoplanet catalog"');
  expect(markup).not.toContain("<dialog id=");
  expect(markup).toContain('aria-label="Close Explore"');
});

test("Explore lists the guided tours with their first and last stops", () => {
  const markup = discoverMarkup("tours");

  expect(markup).toContain("Guided Tours");
  expect(markup).toContain("Home to the edge");
  expect(markup).toContain("Earth → Sagittarius A*");
});
