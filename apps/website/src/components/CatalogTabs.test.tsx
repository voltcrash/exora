import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vite-plus/test";
import { WorldForge } from "./CustomPlanetBuilder.tsx";

/**
 * The tab list is only worth anything if the panel it opens is actually announced as the tab's
 * panel. `renderToStaticMarkup` gives us the wiring without needing a DOM — the dialog never
 * opens, but the markup carries the relationship a screen reader reads.
 */
const forgeMarkup = (): string =>
  renderToStaticMarkup(
    <WorldForge
      initialMode="planet"
      open
      onClose={vi.fn()}
      onGeneratePlanet={vi.fn()}
      onGenerateStar={vi.fn()}
    />,
  );

test("each tab is identified so its panel can point back at it", () => {
  const markup = forgeMarkup();

  expect(markup).toContain('id="forge-mode-tab-planet"');
  expect(markup).toContain('id="forge-mode-tab-star"');
});

test("only the tab whose panel is mounted claims to control one", () => {
  const markup = forgeMarkup();

  expect(markup).toContain('aria-controls="forge-mode-panel-planet"');
  // The star panel is not rendered while the planet tab is open, so pointing at it would leave
  // a dangling IDREF.
  expect(markup).not.toContain('aria-controls="forge-mode-panel-star"');
});

test("the visible panel is labelled by its own tab", () => {
  const markup = forgeMarkup();

  expect(markup).toContain('id="forge-mode-panel-planet"');
  expect(markup).toContain('aria-labelledby="forge-mode-tab-planet"');
  expect(markup).toContain('role="tabpanel"');
});

test("only the selected tab is in the page's tab order", () => {
  const markup = forgeMarkup();
  const tabs = [...markup.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map(([tag]) => tag);

  expect(tabs).toHaveLength(2);
  expect(tabs.filter((tag) => tag.includes('tabindex="0"'))).toHaveLength(1);
  expect(tabs.filter((tag) => tag.includes('tabindex="-1"'))).toHaveLength(1);
  // The one stop in the tab order is the selected tab, not an arbitrary one.
  const selected = tabs.find((tag) => tag.includes('aria-selected="true"'));
  expect(selected).toContain('tabindex="0"');
});
