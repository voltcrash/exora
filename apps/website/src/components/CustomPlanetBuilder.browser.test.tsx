import { createRoot, type Root } from "react-dom/client";
import { page, userEvent } from "vite-plus/test/browser/context";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { WorldForge } from "./CustomPlanetBuilder.tsx";
import "../styles/tokens.css";
import "../styles/globals.css";

const sizeSlider = () => page.getByRole("slider", { name: "Size" });

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  root?.unmount();
  container?.remove();
});

test("Forge updates its deferred preview and generates from the latest controls", async () => {
  const onGeneratePlanet = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  root.render(
    <WorldForge
      initialMode="planet"
      onGeneratePlanet={onGeneratePlanet}
      onGenerateStar={vi.fn()}
      onGenerateBlackHole={vi.fn()}
    />,
  );

  await page.getByLabelText("Kind of world", { exact: false }).selectOptions("gas-giant");
  await expect
    .poll(() => container?.querySelector("[data-renderer]")?.getAttribute("data-renderer"))
    .toBe("gas-giant");

  await userEvent.click(sizeSlider());
  await userEvent.keyboard("{End}");
  await expect.element(sizeSlider()).toHaveValue("1");
  await userEvent.click(page.getByRole("button", { name: /Generate planet/i }));

  expect(onGeneratePlanet).toHaveBeenCalledWith(
    expect.objectContaining({
      parameters: expect.objectContaining({ kind: "gas-giant", radius: 1 }),
      planet: expect.objectContaining({ kind: "gas-giant" }),
    }),
  );
});
