import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { page, userEvent } from "vite-plus/test/browser/context";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { App } from "./App.tsx";
import { acquireSceneHost } from "./scene-host.ts";
import { featuredPlanet } from "./planet-profile.ts";
import "./style.css";

const fetchBundledAsset = globalThis.fetch.bind(globalThis);

const planetSceneStub = vi.hoisted(() => ({
  resolveViewModeReady: null as (() => void) | null,
  setViewMode: null as ((mode: "orbit" | "surface" | "transition") => void) | null,
  viewModeReady: Promise.resolve(),
}));

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
  dispose: () => undefined,
  focusXrRig: () => undefined,
  restoreDesktopView: () => undefined,
  setEphemeris: () => undefined,
  setEphemerisTime: () => undefined,
});

vi.mock("./scene-host.ts", () => {
  let insideHeadset = false;
  const host = {
    // Travel is flown by the real renderer's camera, which this suite does not have one of. The
    // page's own half of a jump — panels leaving with the world, the dark over the swap — is
    // driven by the phase, so the stub reports a page that is never between destinations.
    beginTravel: () => undefined,
    cancelTravel: () => undefined,
    camera: null,
    canvas: null,
    dispose: () => undefined,
    engine: null,
    enterImmersive: async () => {
      insideHeadset = true;
    },
    getFps: () => 60,
    isArSupported: () => false,
    isInXr: () => insideHeadset,
    isVrSupported: () => false,
    prefersReducedMotion: () => false,
    mountWorld: async (build: () => unknown) => build(),
    onRendererStatus: (listener: (status: string) => void) => {
      listener("ready");
      return () => undefined;
    },
    onTravelPhase: (listener: (phase: string) => void) => {
      listener("idle");
      return () => undefined;
    },
    onXrStatus: (listener: (status: string) => void) => {
      listener("ready-vr");
      return () => undefined;
    },
    profile: { hardwareScalingLevel: 1, tier: "desktop" },
    qualityTier: "desktop",
    setInXr: (value: boolean) => {
      insideHeadset = value;
    },
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
const stubbedHost = (): {
  renderSuspensions: number;
  setInXr: (value: boolean) => void;
} =>
  acquireSceneHost(document.createElement("canvas")) as unknown as {
    renderSuspensions: number;
    setInXr: (value: boolean) => void;
  };

vi.mock("./planet-scene.ts", () => ({
  createPlanetWorld: (
    _host: unknown,
    options: {
      onFirstFrame: () => void;
      onViewModeChange: (mode: "orbit" | "surface" | "transition") => void;
    },
  ) => {
    planetSceneStub.setViewMode = options.onViewModeChange;
    planetSceneStub.resolveViewModeReady?.();
    options.onFirstFrame();
    return mountedWorld();
  },
}));

vi.mock("./subsystem-scene.ts", () => ({
  createSubsystemWorld: (_host: unknown, options: { onFirstFrame: () => void }) => {
    options.onFirstFrame();
    return mountedWorld();
  },
}));

vi.mock("./star-scene.ts", () => ({
  createStarWorld: (_host: unknown, options: { onFirstFrame: () => void }) => {
    options.onFirstFrame();
    return { ...mountedWorld(), setSystemWorlds: () => undefined };
  },
}));

vi.mock("./black-hole-scene.ts", () => ({
  createBlackHoleWorld: (_host: unknown, options: { onFirstFrame: () => void }) => {
    options.onFirstFrame();
    return mountedWorld();
  },
}));

vi.mock("./solar-region-scene.ts", () => ({
  createSolarRegionWorld: (_host: unknown, options: { onFirstFrame: () => void }) => {
    options.onFirstFrame();
    return mountedWorld();
  },
}));

vi.mock("./mission-scene.ts", () => ({
  createMissionWorld: (_host: unknown, options: { onFirstFrame: () => void }) => {
    options.onFirstFrame();
    return { ...mountedWorld(), setLayerVisible: () => undefined };
  },
}));

/**
 * The one scene stub that keeps a piece of the real thing.
 *
 * Babylon is stubbed out as everywhere else here, but the layout is not: the system view's whole
 * job is printing what the diorama did to the numbers, and a fabricated layout would let those
 * readouts be wrong in exactly the way this test exists to catch.
 */
vi.mock("./system-scene.ts", async () => {
  const { deriveSystemLayout } = await import("./system-layout.ts");
  return {
    createSystemWorld: (
      _host: unknown,
      options: { onFirstFrame: () => void; planets: readonly ExoplanetProfile[] },
    ) => {
      options.onFirstFrame();
      return { ...mountedWorld(), layout: deriveSystemLayout(options.planets) };
    },
  };
});

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

    // API stubbing must not turn a missing production asset into the renderer's intentional
    // seeded-sky fallback. Pass the real catalog request through to Vite's public directory.
    if (url.pathname === "/sky/hyg-v44-vmag65.bin") return fetchBundledAsset(url);

    if (missing.includes(requested)) return new Response(null, { status: 404 });

    if (url.pathname === "/api/ephemerides") {
      const epoch = url.searchParams.get("at") ?? "2026-08-24T00:00:00.000Z";
      const ids = (url.searchParams.get("ids") ?? "399").split(",").map(Number);
      return Response.json({
        data: ids.map((naifId) => ({
          epoch,
          name: `Body ${naifId}`,
          naifId,
          positionAu: { x: 1, y: naifId / 1_000, z: 0 },
          solution: "DE441/JPL orbital solution",
          spkId: String(naifId),
          velocityAuPerDay: { x: 0, y: 0.01, z: 0 },
        })),
        meta: {
          cached: true,
          center: "Sun (10)",
          coordinateFrame: "Ecliptic J2000",
          epoch,
          retrievedAt: epoch,
          source: "NASA/JPL Horizons API",
          sourceVersion: "1.2",
          stale: false,
        },
      });
    }

    if (url.pathname.startsWith("/api/planets/")) {
      return Response.json({
        data: requested === "featured" ? featuredPlanet : namedPlanet(requested),
        meta: { cached: false, source: "NASA Exoplanet Archive" },
      });
    }

    if (url.pathname.startsWith("/api/stars/") && url.pathname.endsWith("/planets")) {
      const starName = decodeURIComponent(
        url.pathname.slice("/api/stars/".length, -"/planets".length),
      );
      return planetList(
        starName,
        ["b", "c"].map((letter) => ({
          ...namedPlanet(`${starName} ${letter}`),
          hostStar: starName,
        })),
      );
    }

    if (url.pathname === "/api/planets") {
      const host = url.searchParams.get("host");
      if (host) {
        // A host answers with its own system, which is what the diorama is built from.
        return planetList(
          host,
          missing.includes(host)
            ? []
            : ["b", "c"].map((letter) => ({
                ...namedPlanet(`${host} ${letter}`),
                hostStar: host,
                observation: {
                  ...featuredPlanet.observation,
                  orbitalPeriodDays: letter === "b" ? 12 : 90,
                  semiMajorAxisAu: letter === "b" ? 0.09 : 0.4,
                },
              })),
        );
      }
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
      const data =
        url.pathname === "/api/stars/featured"
          ? [sirius, { ...sirius, catalogName: "NAME Altair", id: "altair", name: "Altair" }]
          : [sirius];
      return Response.json({
        data,
        meta: {
          cached: false,
          count: data.length,
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
  renderApp();
};

const renderApp = (): void => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  root.render(<App />);
};

const remountAppAtCurrentUrl = (): void => {
  root?.unmount();
  container?.remove();
  root = null;
  container = null;
  renderApp();
};

const openDiscoverSection = async (
  name: "Black Holes" | "Exoplanets" | "Solar System" | "Stars" | "World Forge",
): Promise<void> => {
  await userEvent.click(page.getByRole("button", { name: "Open Discover" }));
  await expect.element(page.getByRole("dialog", { name: /Start close to home/ })).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: new RegExp(name) }).first());
};

beforeEach(() => {
  planetSceneStub.setViewMode = null;
  planetSceneStub.viewModeReady = new Promise<void>((resolve) => {
    planetSceneStub.resolveViewModeReady = () => resolve();
  });
  stubbedHost().setInXr(false);
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
  await expect.element(page.getByRole("button", { name: "Open Discover" })).toBeVisible();
});

test("the browser test server exposes the production sky catalog", async () => {
  stubArchive();
  const response = await fetch("/sky/hyg-v44-vmag65.bin");
  const header = new DataView(await response.arrayBuffer());

  expect(response.status).toBe(200);
  expect(header.getUint32(0, true)).toBe(0x4b_53_58_45);
});

test("Discover opens directly into the Solar System at this width", async () => {
  stubArchive();
  mountApp();

  // The regression this exists for: below 760px the labels are hidden and the glyphs left behind
  // are aria-hidden, so on the mobile instance these buttons resolve by name only because each
  // one carries an aria-label. A Node test cannot see that, because no stylesheet has run.
  await expect.element(page.getByRole("button", { name: "Open Discover" })).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "Open Discover" }));
  await expect.element(page.getByRole("dialog", { name: /Start close to home/ })).toBeVisible();
  await expect.element(page.getByRole("region", { name: "Solar System catalog" })).toBeVisible();

  if (window.innerWidth <= 760) {
    for (const label of ["Solar System", "Exoplanets", "Stars", "Black Holes", "World Forge"]) {
      const button = page.getByRole("button", { name: new RegExp(label) }).first();
      await expect.element(button).toBeVisible();
    }
    const visibleLabels = Array.from(
      document.querySelectorAll<HTMLElement>(".discover-nav-copy"),
    ).filter((label) => getComputedStyle(label).display !== "none");
    expect(visibleLabels).toHaveLength(5);
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

test("a black-hole deep link resolves without an archive request", async () => {
  const calls = stubArchive();
  mountApp("?blackHole=M87*");

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("M87*");
  await expect.element(page.getByText(/INTERPRETIVE GRAVITATIONAL-LENSING MODEL/)).toBeVisible();
  expect(window.location.search).toBe("?blackHole=M87*");
  expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toContain(
    "?blackHole=M87*",
  );
  expect(calls.filter((path) => path.includes("/api/")).length).toBe(0);
});

test("a deep link to a system resolves to the diorama, and says what it compressed", async () => {
  stubArchive();
  mountApp("?system=Kepler-90");

  if (window.innerWidth <= 640) {
    await expect
      .element(page.getByLabelText("Interactive visualization of the Kepler-90 system"))
      .toBeVisible();
    await expect.element(page.getByRole("button", { name: /Orbit controls/ })).toBeVisible();
    expect(getComputedStyle(document.querySelector(".system-experience .hud")!).display).toBe(
      "none",
    );
    return;
  }

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Kepler-90");
  expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toContain(
    "?system=Kepler-90",
  );

  // The three compressions are the reason this view exists in its own right: a diorama that did
  // not state them would be a picture claiming a linear layout it does not have.
  await expect.element(page.getByText(/LOG · .+ AU → .+ m/)).toBeVisible();
  await expect.element(page.getByText(/EARTH ×/)).toBeVisible();
  await expect.element(page.getByText(/^1 s = /)).toBeVisible();
});

test("a world in the diorama is reachable, and offers the way back to the system", async () => {
  stubArchive();
  mountApp("?system=Kepler-90");

  if (window.innerWidth <= 640) {
    await userEvent.click(page.getByRole("button", { name: /Orbit controls/ }));
  }
  await userEvent.click(page.getByRole("button", { name: /Kepler-90 c/ }));

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Kepler-90 c");
  expect(window.location.search).toBe("?planet=Kepler-90%20c");

  // The return leg rides in the telemetry panel's detail rows, which this stylesheet has always
  // hidden below 960px — the same rule that hides "visit star" there. So the assertion holds
  // where the control exists, and the mobile instance is left asserting the outward leg only.
  if (window.innerWidth < 960) return;

  await userEvent.click(page.getByRole("button", { name: /Whole system/ }));

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Kepler-90");
  expect(window.location.search).toBe("?system=Kepler-90");
});

test("a system the archive links no worlds to is identified rather than shown empty", async () => {
  stubArchive({ missing: ["Barren"] });
  mountApp("?system=Barren");

  await expect
    .element(page.getByRole("heading", { name: "DESTINATION UNAVAILABLE" }))
    .toBeVisible();
  await expect.element(page.getByText(/system “Barren”/)).toBeVisible();
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

  await openDiscoverSection("Exoplanets");
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

  await openDiscoverSection("Stars");
  await expect.element(page.getByRole("heading", { name: "Follow the light." })).toBeVisible();

  // The alphabetized catalog is already visible, and searching remains available as a refinement.
  await userEvent.fill(page.getByPlaceholder(/Type a common name or catalog ID/), "Sirius");
  const result = page.getByRole("button", { name: /Sirius/ }).first();
  await expect.element(result).toBeVisible();
  await userEvent.click(result);

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Sirius");
  if (window.innerWidth <= 640) {
    await userEvent.click(page.getByRole("button", { name: /Known worlds/ }));
  }
  await expect.element(page.getByRole("button", { name: /Sirius b/ })).toBeVisible();
  await expect.element(page.getByRole("button", { name: /Sirius c/ })).toBeVisible();
  expect(window.location.search).toBe("?star=Sirius");
});

test("the star catalog preloads destinations alphabetically", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("Stars");
  const destinations = page.getByRole("list").getByRole("button");
  await expect.element(destinations.nth(0)).toHaveTextContent(/Altair/);
  await expect.element(destinations.nth(1)).toHaveTextContent(/Sirius/);
});

test("the black-hole atlas opens and travels to a sourced horizon", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("Black Holes");
  await expect
    .element(page.getByRole("heading", { name: "Follow the light to its edge." }))
    .toBeVisible();
  const destination = page.getByRole("button", { name: /Sagittarius A\*/ });
  await expect.element(destination).toBeVisible();
  await userEvent.click(destination);

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Sagittarius A*");
  const title = document.querySelector<HTMLElement>("#black-hole-name");
  expect(title).not.toBeNull();
  expect(title?.scrollWidth).toBeLessThanOrEqual(title?.clientWidth ?? 0);
  expect(window.location.search).toBe("?blackHole=Sagittarius%20A*");
});

test("the Home System catalog opens the Oort Cloud with an explicit inferred-model warning", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("Solar System");
  await userEvent.click(page.getByRole("button", { exact: true, name: "REGIONS" }));
  await userEvent.fill(page.getByPlaceholder("Name or SPK ID"), "Oort");
  const oortCloud = page.getByRole("button", { name: /Oort Cloud/ });
  await expect.element(oortCloud).toBeVisible();
  await userEvent.click(oortCloud);

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Oort Cloud");
  await expect
    .element(page.getByText(/MODELED \/ INDIRECTLY INFERRED · NOT DIRECTLY OBSERVED/).first())
    .toBeVisible();
  await expect
    .element(page.getByLabelText("Permanent anchor identifiers"))
    .toHaveTextContent("NAIF 10");
  expect(window.location.search).toBe("?region=Oort%20Cloud");
});

test("a Solar System planet switches into its dedicated parent-centered subsystem", async () => {
  stubArchive();
  mountApp("?planet=Jupiter");

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Jupiter");
  const subsystem = page.getByRole("button", { name: /Jupiter system/ });
  await expect.element(subsystem).toBeVisible();
  await userEvent.click(subsystem);

  if (window.innerWidth <= 640) {
    expect(
      getComputedStyle(document.querySelector(".subsystem-experience .world-intro")!).display,
    ).toBe("none");
    expect(
      getComputedStyle(document.querySelector(".subsystem-experience .telemetry")!).display,
    ).toBe("none");
    await userEvent.click(page.getByRole("button", { name: /Orbit guide/ }));
    await expect
      .element(
        page.getByText("JPL mean orbits · log-compressed distance · body sizes exaggerated", {
          exact: true,
        }),
      )
      .toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect
      .element(page.getByRole("button", { name: /Close orbit view/ }))
      .toHaveAttribute("aria-pressed", "true");
    return;
  }

  await expect
    .element(
      page.getByText(
        window.innerWidth < 960
          ? /SYSTEM SCALE · JPL MEAN ORBITS/
          : "JPL MEAN ORBITS · LOG-COMPRESSED DISTANCE · BODY SIZES EXAGGERATED",
        { exact: window.innerWidth >= 960 },
      ),
    )
    .toBeVisible();
  await expect
    .element(
      page.getByText(
        window.innerWidth < 960
          ? /UNRESOLVED SURFACES · NO INVENTED GEOGRAPHY/
          : "UNRESOLVED SURFACES",
        { exact: window.innerWidth >= 960 },
      ),
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: /Jupiter close view/ }))
    .toHaveAttribute("aria-pressed", "true");
});

test("the Solar System diorama distinguishes cached JPL positions from catalog phases", async () => {
  stubArchive();
  mountApp("?system=Sun");

  if (window.innerWidth <= 640) {
    await userEvent.click(page.getByRole("button", { name: /Orbit controls/ }));
    await expect.element(page.getByText("CATALOG POSITIONS", { exact: true })).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "APPLY JPL" }));
    await expect.element(page.getByText("CACHED JPL POSITIONS", { exact: true })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "PLAY" })).toBeEnabled();
    await userEvent.click(page.getByRole("button", { name: "CATALOG ORBITS" }));
    await expect.element(page.getByText("CATALOG POSITIONS", { exact: true })).toBeVisible();
    return;
  }

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Sun");
  await expect.element(page.getByText("SIMPLIFIED CATALOG", { exact: true })).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "NOW" }));

  await expect.element(page.getByText("SERVER-CACHED JPL", { exact: true })).toBeVisible();
  await expect.element(page.getByRole("button", { name: /PLAY/ })).toBeEnabled();
  await userEvent.click(page.getByRole("button", { name: /REVERSE/ }));
  await expect
    .element(page.getByRole("button", { name: /REVERSE/ }))
    .toHaveAttribute("aria-pressed", "true");
  await userEvent.click(page.getByRole("button", { name: "CATALOG ORBITS" }));
  await expect.element(page.getByText("SIMPLIFIED CATALOG", { exact: true })).toBeVisible();
});

test("the Sun's complete world list scrolls inside its left panel", async () => {
  stubArchive();
  mountApp("?star=Sun");

  if (window.innerWidth <= 640) {
    await userEvent.click(page.getByRole("button", { name: /Known worlds/ }));
    await expect.element(page.getByRole("heading", { name: "Known worlds" })).toBeVisible();
    const sheet = document.querySelector<HTMLElement>(".mobile-sheet-body");
    expect(sheet).not.toBeNull();
    expect(getComputedStyle(sheet!).overflowY).toBe("auto");
    await expect.element(page.getByRole("button", { name: /Makemake/ })).toBeVisible();
    return;
  }

  const telemetry = page.getByLabelText("Observed star data");
  await expect.element(telemetry).toHaveTextContent(/Earth distance\s*1\s*AU/);
  await expect.element(telemetry).toHaveTextContent(/Diameter\s*1,391,400\s*KM/);
  await expect.element(telemetry).toHaveTextContent(/Temperature\s*5,772\s*K/);
  await expect.element(telemetry).toHaveTextContent("25.38 D SIDEREAL");
  await expect.element(telemetry).toHaveTextContent(/AXIAL TILT 7.25°/);
  await expect.element(page.getByRole("heading", { name: "Known worlds" })).toBeVisible();
  const intro = document.querySelector<HTMLElement>(".star-experience .world-intro");
  expect(intro).not.toBeNull();
  expect(getComputedStyle(intro!).overflowY).toBe("auto");
  expect(getComputedStyle(intro!).overscrollBehaviorY).toBe("contain");
  expect(intro!.scrollHeight).toBeGreaterThan(intro!.clientHeight);

  intro!.scrollTo({ top: intro!.scrollHeight });
  expect(intro!.scrollTop).toBeGreaterThan(0);
  await expect.element(page.getByRole("button", { name: /Makemake/ })).toBeVisible();
});

test("the Solar System's complete object list scrolls inside its left panel", async () => {
  stubArchive();
  mountApp("?system=Sun");

  if (window.innerWidth <= 640) {
    await userEvent.click(page.getByRole("button", { name: /Orbit controls/ }));
    await expect
      .element(page.getByRole("heading", { name: "Worlds in the diorama" }))
      .toBeVisible();
    const sheet = document.querySelector<HTMLElement>(".mobile-sheet-body");
    expect(sheet).not.toBeNull();
    expect(getComputedStyle(sheet!).overflowY).toBe("auto");
    await expect.element(page.getByRole("button", { name: /Makemake/ })).toBeVisible();
    return;
  }

  await expect.element(page.getByRole("heading", { name: "Worlds in the diorama" })).toBeVisible();
  // The renderer now starts after the first paint, so the heading can be visible while the
  // measured orbit list is still being laid out. Wait for the list item the scroll assertion uses.
  await expect.element(page.getByRole("button", { name: /Makemake/ })).toBeVisible();
  const intro = document.querySelector<HTMLElement>(".system-experience .world-intro");
  expect(intro).not.toBeNull();
  expect(getComputedStyle(intro!).overflowY).toBe("auto");
  expect(getComputedStyle(intro!).overscrollBehaviorY).toBe("contain");
  expect(intro!.scrollHeight).toBeGreaterThan(intro!.clientHeight);

  intro!.scrollTo({ top: intro!.scrollHeight });
  expect(intro!.scrollTop).toBeGreaterThan(0);
  await expect.element(page.getByRole("button", { name: /Makemake/ })).toBeVisible();
});

test("a dialog closes on Escape and returns the page", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("Exoplanets");
  await expect.element(page.getByRole("dialog")).toBeVisible();

  // Discover owns Escape so the same close path works from every embedded workspace.
  await userEvent.keyboard("{Escape}");
  expect(document.querySelector("dialog[open]")).toBeNull();
});

test("the World Forge opens and builds a world the page then shows", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("World Forge");
  await expect
    .element(page.getByRole("heading", { name: "Make the next discovery." }))
    .toBeVisible();
  await expect
    .element(page.getByText(/generated URL includes this versioned recipe/i))
    .toBeVisible();

  await userEvent.click(page.getByRole("button", { name: /GENERATE/i }).first());

  await expect.element(page.getByText("GENERATED WORLD")).toBeVisible();
  expect(window.location.search).toContain("custom=");
});

test("a generated world survives a reload and its URL opens as a deep link", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("World Forge");
  await userEvent.fill(page.getByLabelText("WORLD NAME"), "Reloadia");
  await userEvent.click(page.getByRole("button", { name: /GENERATE PLANET/i }));
  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Reloadia");
  const sharedSearch = window.location.search;
  expect(sharedSearch).toMatch(/^\?custom=[A-Za-z0-9_-]+$/);

  remountAppAtCurrentUrl();

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Reloadia");
  expect(window.location.search).toBe(sharedSearch);
  await expect.element(page.getByText("GENERATED WORLD")).toBeVisible();
});

test("an invalid custom recipe fails safely with a clear recovery path", async () => {
  stubArchive();
  mountApp("?custom=not-a-valid-recipe");

  await expect
    .element(page.getByRole("heading", { name: "DESTINATION UNAVAILABLE" }))
    .toBeVisible();
  await expect.element(page.getByText(/invalid or incompatible World Forge recipe/i)).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "RETURN TO FEATURED WORLD" }))
    .toBeVisible();
});

test("back and forward restore generated planets and stars", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("World Forge");
  await userEvent.fill(page.getByLabelText("WORLD NAME"), "History World");
  await userEvent.click(page.getByRole("button", { name: /GENERATE PLANET/i }));
  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("History World");
  const planetSearch = window.location.search;

  await openDiscoverSection("World Forge");
  await userEvent.click(page.getByRole("tab", { name: /IGNITE A STAR/i }));
  await userEvent.fill(page.getByLabelText("STAR NAME"), "History Star");
  await userEvent.click(page.getByRole("button", { name: /GENERATE STAR/i }));
  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("History Star");
  const starSearch = window.location.search;

  window.history.back();
  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("History World");
  expect(window.location.search).toBe(planetSearch);

  window.history.forward();
  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("History Star");
  expect(window.location.search).toBe(starSearch);
});

test("Backspace toggles Discover open and closed", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  await userEvent.keyboard("{Backspace}");
  await expect.element(page.getByRole("dialog", { name: /Start close to home/ })).toBeVisible();

  await userEvent.keyboard("{Backspace}");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
});

test("Backspace edits a Discover search field instead of closing the screen", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("Exoplanets");
  const search = page.getByPlaceholder(/Type a name or catalog ID/i);
  await userEvent.fill(search, "Kepler");
  await userEvent.keyboard("{Backspace}");

  await expect.element(search).toHaveValue("Keple");
  await expect.element(page.getByRole("dialog")).toBeVisible();
});

test("Tab toggles the interface away and back, and only on the main screen", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Both instances offer the control. What the phone instance adds is that the button loses its
  // copy at that width, so it resolves by name here only because it carries an aria-label.
  const clearView = page.getByRole("button", { name: "Hide the interface" });
  await expect.element(clearView).toBeVisible();

  // Held as nodes rather than queried again after the press. Panels are hidden rather than faded,
  // which takes them out of the accessibility tree as well as off the screen — so a role query
  // would stop finding the very elements the assertions below are about.
  const panels = [".topbar", ".hud", ".mission-control"].map((selector) => {
    const panel = document.querySelector<HTMLElement>(selector);
    expect(panel, selector).not.toBeNull();
    return { panel: panel!, selector };
  });
  const mobile = window.innerWidth <= 760;
  const expectCleared = async (): Promise<void> => {
    for (const { panel, selector } of panels) {
      if (mobile && selector === ".mission-control") await expect.element(panel).toBeVisible();
      else await expect.element(panel).not.toBeVisible();
    }
  };

  // The button goes first. A phone keeps that one control visible so touch can bring the chrome
  // back; desktop has Tab and clears the entire deck.
  await userEvent.click(clearView);
  await expectCleared();
  if (mobile) {
    await expect.element(page.getByRole("button", { name: "Show the interface" })).toBeVisible();
  }

  // Discover remains reachable when the chrome is hidden, and closing it returns to that same
  // uncluttered renderer rather than silently restoring the panels behind it.
  await userEvent.keyboard("{Backspace}");
  await expect.element(page.getByRole("dialog")).toBeVisible();
  await userEvent.keyboard("{Backspace}");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await expectCleared();

  if (mobile) await userEvent.click(page.getByRole("button", { name: "Show the interface" }));
  else await userEvent.keyboard("{Tab}");
  for (const { panel } of panels) await expect.element(panel).toBeVisible();

  // …and the same control takes them away again, which is the half a one-way action never had.
  if (mobile) await userEvent.click(page.getByRole("button", { name: "Hide the interface" }));
  else await userEvent.keyboard("{Tab}");
  await expectCleared();

  if (mobile) await userEvent.click(page.getByRole("button", { name: "Show the interface" }));
  else await userEvent.keyboard("{Tab}");
  for (const { panel } of panels) await expect.element(panel).toBeVisible();
});

test("terrain view fades every interface region and reveals the hovered one", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  const shell = document.querySelector<HTMLElement>(".experience-shell");
  expect(shell).not.toBeNull();
  // The heading can commit one render before the async world-mount effect installs this callback.
  // Await the mocked scene's lifecycle signal instead of making runner speed part of the test.
  await planetSceneStub.viewModeReady;
  planetSceneStub.setViewMode?.("surface");
  await expect.poll(() => shell!.classList.contains("view-surface")).toBe(true);
  const canvas = document.querySelector<HTMLCanvasElement>("canvas");
  expect(canvas).not.toBeNull();
  await page.elementLocator(canvas!).hover();

  const regions = document.querySelectorAll<HTMLElement>(
    ".topbar > *, .hud > *, .mission-control > *",
  );
  expect(regions.length).toBeGreaterThan(2);
  for (const region of regions) {
    await expect.poll(() => getComputedStyle(region).opacity).toBe("0.34");
  }

  const hoveredRegion = document.querySelector<HTMLElement>(".world-intro");
  expect(hoveredRegion).not.toBeNull();
  await page.elementLocator(hoveredRegion!).hover();

  await expect.poll(() => getComputedStyle(hoveredRegion!).opacity).toBe("1");
  for (const region of regions) {
    if (region !== hoveredRegion) expect(getComputedStyle(region).opacity).toBe("0.34");
  }
});

test("Tab keeps traversing focus wherever the shortcut stands down", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  const shell = document.querySelector<HTMLElement>(".experience-shell");
  expect(shell).not.toBeNull();

  // Shift+Tab is what the shortcut leaves alone, and is therefore what still reaches the page's
  // own controls from the keyboard now that plain Tab is spoken for.
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  expect(shell!.classList.contains("chrome-hidden")).toBe(false);

  // A dialog is not the main screen: it traps focus for its own controls, and Tab has to keep
  // moving between them rather than hiding an interface nobody can see behind the scrim.
  await openDiscoverSection("Exoplanets");
  await expect.element(page.getByRole("dialog")).toBeVisible();

  await userEvent.keyboard("{Tab}");
  expect(shell!.classList.contains("chrome-hidden")).toBe(false);
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

  await openDiscoverSection("Exoplanets");
  await expect.element(page.getByRole("dialog")).toBeVisible();
  expect(stubbedHost().renderSuspensions).toBe(1);

  await userEvent.click(page.getByRole("button", { name: "Close Discover" }));
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  expect(stubbedHost().renderSuspensions).toBe(0);

  // The forge is a separate overlay over the same canvas and has to hold the loop just as the
  // catalog did — the release is per-overlay, not a single global flag someone can leave set.
  await openDiscoverSection("World Forge");
  await expect.element(page.getByRole("dialog")).toBeVisible();
  expect(stubbedHost().renderSuspensions).toBe(1);

  await userEvent.click(page.getByRole("button", { name: "Close Discover" }));
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  expect(stubbedHost().renderSuspensions).toBe(0);
});

test("VR presents the active destination without a console and exits to the same browser view", async () => {
  stubArchive();
  mountApp();
  const destination = page.getByRole("heading", { level: 1 });
  await expect.element(destination).toBeVisible();
  const destinationName = destination.element().textContent;

  await userEvent.click(page.getByRole("button", { name: "XR: VR AVAILABLE" }));
  expect(page.getByRole("dialog")).not.toBeInTheDocument();

  // Session exit does not select another destination or alter the browser interface.
  stubbedHost().setInXr(false);
  await expect.element(destination).toBeVisible();
  expect(destination.element().textContent).toBe(destinationName);
  expect(page.getByRole("dialog")).not.toBeInTheDocument();
});

test("Discover uses one scrolling surface without a viewport blur", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  await openDiscoverSection("Exoplanets");
  const catalog = document.querySelector<HTMLDialogElement>(".planet-catalog");
  const catalogScroller = catalog?.querySelector<HTMLElement>(".catalog-scroll-region");
  const discoverStage = document.querySelector<HTMLElement>(".discover-stage");
  expect(getComputedStyle(catalog!).overflowY).toBe("visible");
  expect(getComputedStyle(discoverStage!).overflowY).toBe("auto");
  expect(getComputedStyle(catalogScroller!).overflowY).toBe("visible");
  expect(getComputedStyle(document.querySelector(".catalog-results")!).overflowY).toBe("visible");
  expect(getComputedStyle(catalog!, "::backdrop").backdropFilter).toBe("none");

  await userEvent.click(page.getByRole("button", { name: "Close Discover" }));
  await openDiscoverSection("World Forge");
  const forge = document.querySelector<HTMLDialogElement>(".planet-builder");
  const forgeScroller = forge?.querySelector<HTMLFormElement>("form");
  expect(getComputedStyle(forge!).overflowY).toBe("visible");
  expect(getComputedStyle(forgeScroller!).overflowY).toBe("visible");
  expect(getComputedStyle(forge!, "::backdrop").backdropFilter).toBe("none");
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

test("the navigation deck keeps an even gap between every control", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  const discover = document
    .querySelector<HTMLElement>(".discover-trigger")!
    .getBoundingClientRect();
  const clearView = document.querySelector<HTMLElement>(".clear-view")!.getBoundingClientRect();
  const xr = document.querySelector<HTMLElement>(".enter-vr")!.getBoundingClientRect();
  const firstGap = clearView.left - discover.right;
  const secondGap = xr.left - clearView.right;

  expect(Math.abs(firstGap - secondGap)).toBeLessThanOrEqual(1);
});
