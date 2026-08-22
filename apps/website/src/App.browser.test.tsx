import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { page, userEvent } from "vite-plus/test/browser/context";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { App } from "./App.tsx";
import { acquireSceneHost } from "./scene-host.ts";
import { featuredPlanet } from "./planet-profile.ts";
import "./style.css";

/**
 * The suite for the things a Node test cannot answer.
 *
 * Everything here needs a real engine: whether a control still has an accessible name after the
 * stylesheet has hidden its label, whether a dialog actually reaches the top layer, whether the
 * page survives a destination it cannot resolve. The unit suite covers the logic behind all of
 * this and covers it faster — what runs here is only what depends on layout, CSS, or the browser's
 * own dialog and history behaviour.
 *
 * Runs at a desktop and a phone viewport, configured as two browser instances, because the
 * defects worth catching here are the ones that appear at exactly one of those widths.
 */

/**
 * The renderer is stubbed rather than driven.
 *
 * Babylon's real output is covered against a NullEngine in `renderer-smoke.test.ts`, which checks
 * the thing worth checking — that each world builds, draws a frame, and releases what it took.
 * Repeating that through SwiftShader here would cost seconds per test and prove less. What these
 * tests need from the renderer is only that it reports a first frame, because until it does, a
 * full-screen loading overlay sits over every control they are trying to reach.
 */
const mountedWorld = () => ({
  console: { entries: [], title: "" },
  dispose: () => undefined,
  focusXrRig: () => undefined,
  restoreDesktopView: () => undefined,
});

vi.mock("./scene-host.ts", () => {
  const host = {
    camera: null,
    canvas: null,
    dispose: () => undefined,
    engine: null,
    enterVr: async () => undefined,
    getFps: () => 60,
    isInXr: () => false,
    isVrSupported: () => false,
    mountWorld: async (build: () => unknown) => build(),
    onRendererStatus: (listener: (status: string) => void) => {
      listener("ready");
      return () => undefined;
    },
    onXrStatus: (listener: (status: string) => void) => {
      listener("unavailable");
      return () => undefined;
    },
    profile: { hardwareScalingLevel: 1, tier: "desktop" },
    qualityTier: "desktop",
    refreshConsole: () => undefined,
    /** How many overlays are currently holding the loop parked, for the assertions below. */
    renderSuspensions: 0,
    suspendRendering: () => {
      host.renderSuspensions += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        host.renderSuspensions -= 1;
      };
    },
    scene: null,
    xrCamera: () => null,
  };

  return { acquireSceneHost: () => host, recreateSceneHost: () => host };
});

/** The stub above, reached through the module the app imports it from. */
const stubbedHost = (): { renderSuspensions: number } =>
  acquireSceneHost(document.createElement("canvas")) as unknown as { renderSuspensions: number };

vi.mock("./planet-scene.ts", () => ({
  createPlanetWorld: (_host: unknown, options: { onFirstFrame: () => void }) => {
    options.onFirstFrame();
    return mountedWorld();
  },
}));

vi.mock("./star-scene.ts", () => ({
  createStarWorld: (_host: unknown, options: { onFirstFrame: () => void }) => {
    options.onFirstFrame();
    return { ...mountedWorld(), setPlanetTargets: () => undefined };
  },
}));

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

const namedPlanet = (name: string): ExoplanetProfile => ({
  ...featuredPlanet,
  id: name.toLowerCase().replaceAll(" ", "-"),
  name,
});

/**
 * A stand-in archive.
 *
 * Answers the shapes the client validates and nothing more. `missing` names the objects this
 * archive should claim not to have, which is how the deep-link tests reproduce a shared URL for a
 * world that has since been renamed or withdrawn.
 */
const stubArchive = ({ missing = [] as string[] } = {}) => {
  const calls: string[] = [];

  const planetList = (query: string, planets: ExoplanetProfile[]): Response =>
    Response.json({
      data: planets,
      meta: {
        cached: false,
        count: planets.length,
        query,
        source: "NASA Exoplanet Archive",
      },
    });

  vi.stubGlobal("fetch", async (input: string | URL | Request): Promise<Response> => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(path);
    const url = new URL(path, window.location.origin);
    const requested = decodeURIComponent(url.pathname.split("/").pop() ?? "");

    if (missing.includes(requested)) return new Response(null, { status: 404 });

    if (url.pathname.startsWith("/api/planets/")) {
      return Response.json({
        data: requested === "featured" ? featuredPlanet : namedPlanet(requested),
        meta: { cached: false, source: "NASA Exoplanet Archive" },
      });
    }

    if (url.pathname === "/api/planets") {
      const query = url.searchParams.get("q") ?? url.searchParams.get("category") ?? "";
      return planetList(query, [namedPlanet(query || "Kepler-186 f")]);
    }

    if (url.pathname.startsWith("/api/stars/") && requested !== "featured") {
      return Response.json({
        data: { ...sirius, name: requested },
        meta: { cached: false, source: "SIMBAD" },
      });
    }

    // `/api/stars/featured` is a collection despite its shape, which is why it is answered here
    // rather than alongside the single-object lookup above.
    if (url.pathname === "/api/stars" || url.pathname === "/api/stars/featured") {
      return Response.json({
        data: [sirius],
        meta: {
          cached: false,
          count: 1,
          query: url.searchParams.get("q") ?? url.searchParams.get("category") ?? "",
          source: "SIMBAD",
        },
      });
    }

    return new Response(null, { status: 404 });
  });

  return calls;
};

let root: Root | null = null;
let container: HTMLElement | null = null;

/**
 * Renders without `act`, deliberately.
 *
 * These tests drive the page the way a visitor does — real clicks, real typing, real navigation —
 * and `act` exists to flush updates that nothing real is waiting on. Declaring an act environment
 * around genuine events makes React warn about every one of them. Readiness comes instead from
 * `expect.element`, which retries until the page has caught up, which is the same thing a visitor
 * experiences and the only thing worth asserting.
 */
const mountApp = (search = ""): void => {
  window.history.replaceState({}, "", `/${search}`);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  root.render(<App />);
};

beforeEach(() => {
  document.head.querySelector('link[rel="canonical"]')?.remove();
  const canonical = document.createElement("link");
  canonical.rel = "canonical";
  document.head.append(canonical);
});

afterEach(() => {
  root?.unmount();
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

test("the landing page reaches a rendered world", async () => {
  stubArchive();
  mountApp();

  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The loading overlay is fixed at z-index 10 over everything, so a control being visible is
  // also the assertion that the first frame was reported and the overlay stood down.
  await expect
    .element(page.getByRole("button", { name: "Open NASA exoplanet catalog" }))
    .toBeVisible();
});

test("every top-bar destination is reachable and named at this width", async () => {
  stubArchive();
  mountApp();

  // The regression this exists for: below 760px the labels are hidden and the glyphs left behind
  // are aria-hidden, so on the mobile instance these buttons resolve by name only because each
  // one carries an aria-label. A Node test cannot see that, because no stylesheet has run.
  for (const name of [
    "Open NASA exoplanet catalog",
    "Open SIMBAD star catalog",
    "Open World Forge",
  ]) {
    await expect.element(page.getByRole("button", { name })).toBeVisible();
  }
});

test("a deep link to a named world resolves to that world", async () => {
  stubArchive();
  mountApp("?planet=Kepler-22%20b");

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Kepler-22");
  expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toContain(
    "?planet=Kepler-22%20b",
  );
});

test("a deep link to a named star resolves to that star", async () => {
  stubArchive();
  mountApp("?star=Sirius");

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Sirius");
});

test("an unavailable deep link is identified instead of showing a different world", async () => {
  stubArchive({ missing: ["Withdrawn b"] });
  mountApp("?planet=Withdrawn%20b");

  await expect
    .element(page.getByRole("heading", { name: "DESTINATION UNAVAILABLE" }))
    .toBeVisible();
  await expect.element(page.getByText(/planet “Withdrawn b”/)).toBeVisible();
  expect(window.location.search).toBe("?planet=Withdrawn%20b");

  await userEvent.click(page.getByRole("button", { name: "RETURN TO FEATURED WORLD" }));

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Kepler-297");
  expect(window.location.pathname).toBe("/");
  expect(window.location.search).toBe("");
});

test("the catalog opens, searches, and travels to a result", async () => {
  const calls = stubArchive();
  mountApp();

  await userEvent.click(page.getByRole("button", { name: "Open NASA exoplanet catalog" }));
  const dialog = page.getByRole("dialog");
  await expect.element(dialog).toBeVisible();

  await userEvent.fill(page.getByPlaceholder(/Type a name or catalog ID/), "TRAPPIST-1 e");
  const result = page.getByRole("button", { name: /TRAPPIST-1 e/ });
  await expect.element(result).toBeVisible();

  await userEvent.click(result);

  // Travel closes the dialog, swaps the world, and rewrites the URL so the destination is
  // shareable — the three halves of one action, none of which a Node test observes.
  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("TRAPPIST-1 e");
  expect(window.location.search).toBe("?planet=TRAPPIST-1%20e");
  expect(calls.some((path) => path.includes("q=TRAPPIST-1"))).toBe(true);
});

test("the star catalog opens and travels to a star", async () => {
  stubArchive();
  mountApp();

  await userEvent.click(page.getByRole("button", { name: "Open SIMBAD star catalog" }));
  await expect
    .element(page.getByRole("heading", { name: "Choose a star to discover" }))
    .toBeVisible();

  // The star catalog opens on its curated collections with no results loaded, so reaching one
  // means searching for it.
  await userEvent.fill(page.getByPlaceholder(/Type a common name or catalog ID/), "Sirius");
  const result = page.getByRole("button", { name: /Sirius/ }).first();
  await expect.element(result).toBeVisible();
  await userEvent.click(result);

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Sirius");
  expect(window.location.search).toBe("?star=Sirius");
});

test("a dialog closes on Escape and returns the page", async () => {
  stubArchive();
  mountApp();

  await userEvent.click(page.getByRole("button", { name: "Open NASA exoplanet catalog" }));
  await expect.element(page.getByRole("dialog")).toBeVisible();

  // `showModal` puts the dialog in the top layer, where Escape is the browser's own behaviour
  // rather than anything the component implements. That only exists in a real engine.
  await userEvent.keyboard("{Escape}");
  expect(document.querySelector("dialog[open]")).toBeNull();
});

test("the World Forge opens and builds a world the page then shows", async () => {
  stubArchive();
  mountApp();

  await userEvent.click(page.getByRole("button", { name: "Open World Forge" }));
  await expect
    .element(page.getByRole("heading", { name: "Design a celestial object" }))
    .toBeVisible();

  await userEvent.click(page.getByRole("button", { name: /GENERATE/i }).first());

  await expect.element(page.getByText("GENERATED WORLD")).toBeVisible();
  expect(window.location.search).toContain("custom=");
});

test("the `/` shortcut opens the catalog", async () => {
  stubArchive();
  mountApp();

  await userEvent.keyboard("/");
  await expect.element(page.getByRole("dialog")).toBeVisible();
});

test("an open overlay parks the renderer, and closing it starts the loop again", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  // The reason this matters is not the wasted GPU time on its own. A modal covers the canvas
  // with a blurred scrim, and a canvas that keeps changing underneath one forces the browser to
  // rebuild that blur over the entire viewport every frame — which is what made the catalog and
  // the forge drop frames while a reader was only scrolling a list or dragging a slider.
  expect(stubbedHost().renderSuspensions).toBe(0);

  await userEvent.click(page.getByRole("button", { name: "Open NASA exoplanet catalog" }));
  await expect.element(page.getByRole("dialog")).toBeVisible();
  expect(stubbedHost().renderSuspensions).toBe(1);

  await userEvent.click(page.getByRole("button", { name: "Close planet catalog" }));
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  expect(stubbedHost().renderSuspensions).toBe(0);

  // The forge is a separate overlay over the same canvas and has to hold the loop just as the
  // catalog did — the release is per-overlay, not a single global flag someone can leave set.
  await userEvent.click(page.getByRole("button", { name: "Open World Forge" }));
  await expect.element(page.getByRole("dialog")).toBeVisible();
  expect(stubbedHost().renderSuspensions).toBe(1);

  await userEvent.click(page.getByRole("button", { name: "Close world forge" }));
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  expect(stubbedHost().renderSuspensions).toBe(0);
});

test("nothing overflows the viewport horizontally", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Cheap, but it is the failure that a phone viewport actually produces: one control that did
  // not shrink drags a horizontal scrollbar across the whole experience.
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    document.documentElement.clientWidth,
  );
});
