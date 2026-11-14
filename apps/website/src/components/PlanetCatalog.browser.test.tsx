import { createRoot, type Root } from "react-dom/client";
import { page, userEvent } from "vite-plus/test/browser/context";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { featuredPlanet } from "../planet-profile.ts";
import { PlanetCatalog } from "./PlanetCatalog.tsx";
import "../styles/tokens.css";
import "../styles/globals.css";

vi.mock("../planet-catalog.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../planet-catalog.ts")>();
  return { ...original, loadPlanetCatalog: () => original.loadPlanetCatalog(fetch) };
});

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

test("a failed page keeps its cursor and can be retried", async () => {
  let pages = 0;
  const second = { ...featuredPlanet, id: "second-world", name: "Second world" };
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      window.location.origin,
    );
    if (!url.pathname.startsWith("/api/")) return new Response(null, { status: 503 });
    const more = url.searchParams.get("cursor") === "first";
    if (more && ++pages === 1) return new Response(null, { status: 502 });
    return Response.json({
      data: [more ? second : featuredPlanet],
      meta: {
        cached: false,
        count: 1,
        query: "physical-controls",
        source: "NASA Exoplanet Archive",
        nextCursor: more ? null : "first",
      },
    });
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  root.render(<PlanetCatalog onSelect={vi.fn()} />);
  await expect
    .element(page.getByRole("button", { name: "Retry loading more", exact: true }))
    .toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "Retry loading more", exact: true }));
  await expect.element(page.getByText("Second world", { exact: true })).toBeVisible();
  expect(pages).toBe(2);
});
