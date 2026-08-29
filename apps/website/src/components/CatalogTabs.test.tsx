import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vite-plus/test";
import { WorldForge } from "./CustomPlanetBuilder.tsx";

const forgeMarkup = (): string =>
  renderToStaticMarkup(
    <WorldForge
      initialMode="planet"
      onClose={vi.fn()}
      onGenerateBlackHole={vi.fn()}
      onGeneratePlanet={vi.fn()}
      onGenerateStar={vi.fn()}
    />,
  );

test("connects the selected tab to the mounted panel", () => {
  const markup = forgeMarkup();

  expect(markup).toContain('id="forge-mode-tab-planet"');
  expect(markup).toContain('id="forge-mode-tab-star"');
  expect(markup).toContain('id="forge-mode-tab-black-hole"');
  expect(markup).toContain('aria-controls="forge-mode-panel-planet"');
  expect(markup).not.toContain('aria-controls="forge-mode-panel-star"');
  expect(markup).toContain('id="forge-mode-panel-planet"');
  expect(markup).toContain('aria-labelledby="forge-mode-tab-planet"');
  expect(markup).toContain('role="tabpanel"');
  const tabs = [...markup.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map(([tag]) => tag);

  expect(tabs).toHaveLength(3);
  expect(tabs.filter((tag) => tag.includes('tabindex="0"'))).toHaveLength(1);
  expect(tabs.filter((tag) => tag.includes('tabindex="-1"'))).toHaveLength(2);
  const selected = tabs.find((tag) => tag.includes('aria-selected="true"'));
  expect(selected).toContain('tabindex="0"');
});
