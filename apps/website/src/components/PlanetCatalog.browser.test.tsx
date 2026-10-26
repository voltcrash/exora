import { createRoot, type Root } from "react-dom/client";
import { page, userEvent } from "vite-plus/test/browser/context";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { featuredPlanet } from "../planet-profile.ts";
import { PlanetCatalog } from "./PlanetCatalog.tsx";
import "../styles/tokens.css";
import "../styles/globals.css";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  root?.unmount();
  container?.remove();
  vi.unstubAllGlobals();
});

test("catalog results follow deferred filters and recover after reset", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: [featuredPlanet],
        meta: { cached: false, count: 1, query: "", source: "NASA Exoplanet Archive" },
      }),
    ),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  root.render(<PlanetCatalog onSelect={vi.fn()} />);

  await userEvent.click(page.getByRole("button", { name: "Filters", exact: true }));
  await expect.element(page.getByText("1 worlds fit these filters")).toBeVisible();
  await userEvent.click(page.getByRole("slider", { name: "Composition", exact: true }));
  await userEvent.keyboard("{Home}");
  await expect
    .element(page.getByText("No worlds fit every filter.", { exact: false }))
    .toBeVisible();

  await userEvent.click(page.getByRole("button", { name: "Reset", exact: true }));
  await expect.element(page.getByText("1 worlds fit these filters")).toBeVisible();
  await expect
    .element(page.getByRole("slider", { name: "Composition", exact: true }))
    .toHaveValue("50");
});
