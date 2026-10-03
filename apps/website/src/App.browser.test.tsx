import type { BlackHoleProfile, ExoplanetProfile, StarProfile } from "@exora/contracts";
import { page, userEvent } from "vite-plus/test/browser/context";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { App } from "./App.tsx";
import { acquireSceneHost } from "./scene-host.ts";
import { featuredPlanet } from "./planet-profile.ts";
import { BLACK_HOLES } from "./black-holes.ts";
import "./styles/tokens.css";
import "./styles/globals.css";

const desktopTest = test.skipIf(window.innerWidth <= 760);
const fetchBundledAsset = globalThis.fetch.bind(globalThis);

const planetSceneStub = vi.hoisted(() => ({
  resolveViewModeReady: null as (() => void) | null,
  setViewMode: null as ((mode: "orbit" | "surface" | "transition") => void) | null,
  viewModeReady: Promise.resolve(),
}));

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
      listener("ready-ar");
      return () => undefined;
    },
    profile: { hardwareScalingLevel: 1, tier: "desktop" },
    qualityTier: "desktop",
    setInXr: (value: boolean) => {
      insideHeadset = value;
    },
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

vi.mock("./system-scene.ts", async () => {
  const { deriveSystemLayout } = await import("./system-layout.ts");
  return {
    createSystemWorld: (
      _host: unknown,
      options: { onFirstFrame: () => void; planets: readonly ExoplanetProfile[] },
    ) => {
      options.onFirstFrame();
      return {
        ...mountedWorld(),
        layout: deriveSystemLayout(options.planets),
        onSightlineCrossing: () => () => undefined,
        orbitDays: () => 0,
        setClockRate: () => undefined,
      };
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

const observedBlackHole: BlackHoleProfile = {
  ...BLACK_HOLES[3]!,
  aliases: ["V404 Cyg"],
  catalogDesignation: "GS 2023+338",
  id: "blackcat-gs-2023-338",
  massSolar: null,
  massUncertaintySolar: null,
  milestone: "BlackCAT black-hole candidate",
  name: "GS 2023+338",
  observation: {
    ...BLACK_HOLES[3]!.observation,
    companion: "V404 Cyg",
    summary: "An observed BlackCAT candidate with no reliable dynamical mass reported.",
  },
  source: {
    archive: "BlackCAT / CDS VizieR",
    catalog: "J/A+A/587/A61/tablea1 + J/A+A/587/A61/tablea4",
    measurement: "No reliable dynamical mass is reported in BlackCAT.",
    retrievedOn: "2026-08-29",
    title: "BlackCAT",
    url: "https://www.astro.puc.cl/BlackCAT/transients.php",
  },
  status: "candidate",
};

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

    if (url.pathname === "/api/black-holes") {
      return Response.json({
        data: [observedBlackHole],
        meta: {
          cached: false,
          count: 1,
          query: "observed",
          source: "BlackCAT / CDS VizieR",
          stale: false,
        },
      });
    }

    if (url.pathname.startsWith("/api/black-holes/")) {
      return Response.json({
        data: observedBlackHole,
        meta: { cached: false, source: "BlackCAT / CDS VizieR", stale: false },
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

    if (url.pathname === "/api/stars" || url.pathname === "/api/stars/featured") {
      const altair = { ...sirius, catalogName: "NAME Altair", id: "altair", name: "Altair" };
      const data =
        url.pathname === "/api/stars/featured"
          ? [sirius, altair]
          : url.searchParams.get("browse") === "catalog"
            ? [altair, sirius]
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

/*
 * The destination panel is a card beside the world on a desktop and a bottom sheet on a phone.
 * These two helpers say what a visitor does rather than which viewport they are on, so a reading
 * is asserted the same way at every width the suite runs at.
 */
const expandPanel = async (): Promise<void> => {
  await expect
    .poll(() => document.querySelector('[data-testid="panel-disclosure"]') !== null)
    .toBe(true);
  const disclosure = document.querySelector<HTMLButtonElement>('[data-testid="panel-disclosure"]');
  if (!disclosure || getComputedStyle(disclosure).display === "none") return;
  // The sheet opens in steps, from its peek to half the screen to all of it.
  for (let step = 0; step < 2 && disclosure.parentElement?.dataset.snap !== "full"; step += 1) {
    await userEvent.click(page.elementLocator(disclosure));
  }
};

const openPanelSection = async (name: string): Promise<void> => {
  await expandPanel();
  const section = page.getByRole("tab", { name: new RegExp(name) });
  await expect.element(section).toBeVisible();
  await userEvent.click(section);
};

const openDiscoverSection = async (
  name: "Black Holes" | "Exoplanets" | "Solar System" | "Stars" | "World Forge",
): Promise<void> => {
  await userEvent.click(page.getByRole("button", { exact: true, name: "Explore" }));
  await expect.element(page.getByRole("dialog", { name: /Find another world/ })).toBeVisible();
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
  document.documentElement.style.removeProperty("font-family");
  root?.unmount();
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

desktopTest("the landing page reaches a rendered world", async () => {
  stubArchive();
  mountApp();

  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.element(page.getByRole("button", { exact: true, name: "Explore" })).toBeVisible();
  await expect.element(page.getByRole("button", { name: "Go anywhere" })).toBeVisible();
});

desktopTest("the browser test server exposes the production sky catalog", async () => {
  stubArchive();
  const response = await fetch("/sky/hyg-v44-vmag65.bin");
  const header = new DataView(await response.arrayBuffer());

  expect(response.status).toBe(200);
  expect(header.getUint32(0, true)).toBe(0x4b_53_58_45);
});

test("Explore opens directly into Exoplanets at this width", async () => {
  stubArchive();
  mountApp();

  const explore = page.getByRole("button", { exact: true, name: "Explore" });
  await expect.element(explore).toBeVisible();
  await userEvent.click(explore);
  await expect.element(page.getByRole("dialog", { name: /Find another world/ })).toBeVisible();
  await expect.element(page.getByRole("region", { name: "Exoplanet catalog" })).toBeVisible();

  if (window.innerWidth <= 640) {
    const sections = [
      "Exoplanets",
      "Stars",
      "Solar System",
      "Black Holes",
      "Atlas",
      "Guided Tours",
      "World Forge",
    ];
    for (const label of sections) {
      const button = page.getByRole("button", { name: new RegExp(label) }).first();
      await expect.element(button).toBeVisible();
    }
    const visibleLabels = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="discover-nav-copy"]'),
    ).filter((label) => getComputedStyle(label).display !== "none");
    expect(visibleLabels).toHaveLength(sections.length);
  }
});

desktopTest("a deep link to a named world resolves to that world", async () => {
  stubArchive();
  mountApp("?planet=Kepler-22%20b");

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Kepler-22");
  expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toContain(
    "?planet=Kepler-22%20b",
  );
});

desktopTest("a deep link to a named star resolves to that star", async () => {
  stubArchive();
  mountApp("?star=Sirius");

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Sirius");
});

desktopTest("a black-hole deep link resolves without an archive request", async () => {
  const calls = stubArchive();
  mountApp("?blackHole=M87*");

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("M87*");
  await expect.element(page.getByText(/interpretive model of gravitational lensing/)).toBeVisible();
  expect(window.location.search).toBe("?blackHole=M87*");
  expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toContain(
    "?blackHole=M87*",
  );
  expect(calls.filter((path) => path.includes("/api/")).length).toBe(0);
});

desktopTest("an observed BlackCAT deep link resolves through the Exora API", async () => {
  const calls = stubArchive();
  mountApp("?blackHole=GS%202023%2B338");

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("GS 2023+338");
  await expect.element(page.getByText("Observed black hole")).toBeVisible();
  expect(calls.some((path) => path.includes("/api/black-holes/GS%202023%2B338"))).toBe(true);
});

desktopTest(
  "a procedural ID deep link reconstructs locally and remains clearly synthetic",
  async () => {
    const calls = stubArchive();
    mountApp("?blackHole=exora-synthetic-42-0007");

    await expect
      .element(page.getByRole("heading", { level: 1 }))
      .toHaveTextContent("EXORA SYNTHETIC 0007");
    await expect.element(page.getByText("Procedural black hole")).toBeVisible();
    expect(calls.filter((path) => path.includes("/api/")).length).toBe(0);
  },
);

desktopTest(
  "a deep link to a system resolves to the diorama, and says what it compressed",
  async () => {
    stubArchive();
    mountApp("?system=Kepler-90");

    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Kepler-90");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toContain(
      "?system=Kepler-90",
    );

    await openPanelSection("Scale");
    await expect.element(page.getByText(/Log · .+ AU → .+ m/)).toBeVisible();
    await expect.element(page.getByText(/Earth ×/)).toBeVisible();
    await expect.element(page.getByText(/^1 s = /)).toBeVisible();
  },
);

desktopTest(
  "a world in the diorama is reachable, and offers the way back to the system",
  async () => {
    stubArchive();
    mountApp("?system=Kepler-90");

    await expandPanel();
    await userEvent.click(page.getByRole("button", { name: /Kepler-90 c/ }));

    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Kepler-90 c");
    expect(window.location.search).toBe("?planet=Kepler-90%20c");

    await userEvent.click(page.getByRole("button", { name: /Whole system/ }));

    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Kepler-90");
    expect(window.location.search).toBe("?system=Kepler-90");
  },
);

desktopTest(
  "a system the archive links no worlds to is identified rather than shown empty",
  async () => {
    stubArchive({ missing: ["Barren"] });
    mountApp("?system=Barren");

    await expect
      .element(page.getByRole("heading", { name: "Destination unavailable" }))
      .toBeVisible();
    await expect.element(page.getByText(/system “Barren”/)).toBeVisible();
  },
);

desktopTest(
  "an unavailable deep link is identified instead of showing a different world",
  async () => {
    stubArchive({ missing: ["Withdrawn b"] });
    mountApp("?planet=Withdrawn%20b");

    await expect
      .element(page.getByRole("heading", { name: "Destination unavailable" }))
      .toBeVisible();
    await expect.element(page.getByText(/planet “Withdrawn b”/)).toBeVisible();
    expect(window.location.search).toBe("?planet=Withdrawn%20b");

    await userEvent.click(page.getByRole("button", { name: "Go to the featured world" }));

    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("GJ 674");
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
  },
);

desktopTest("the catalog opens, searches, and travels to a result", async () => {
  const calls = stubArchive();
  mountApp();

  await openDiscoverSection("Exoplanets");
  const dialog = page.getByRole("dialog");
  await expect.element(dialog).toBeVisible();

  await userEvent.fill(page.getByPlaceholder(/Search by name or catalog ID/), "TRAPPIST-1 e");
  const result = page.getByRole("button", { name: /TRAPPIST-1 e/ });
  await expect.element(result).toBeVisible();

  await userEvent.click(result);

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("TRAPPIST-1 e");
  expect(window.location.search).toBe("?planet=TRAPPIST-1%20e");
  expect(calls.some((path) => path.includes("q=TRAPPIST-1"))).toBe(true);
});

desktopTest("the star catalog opens and travels to a star", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("Stars");
  await expect.element(page.getByRole("heading", { name: "Follow the light" })).toBeVisible();

  await userEvent.fill(page.getByPlaceholder(/Search by common name or catalog ID/), "Sirius");
  const result = page.getByRole("button", { name: /Sirius/ }).first();
  await expect.element(result).toBeVisible();
  await userEvent.click(result);

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Sirius");
  await expandPanel();
  await expect.element(page.getByRole("button", { name: /Sirius b/ })).toBeVisible();
  await expect.element(page.getByRole("button", { name: /Sirius c/ })).toBeVisible();
  expect(window.location.search).toBe("?star=Sirius");
});

desktopTest("the star catalog preloads destinations alphabetically", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("Stars");
  const destinations = page.getByRole("list").getByRole("button");
  await expect.element(destinations.nth(0)).toHaveTextContent(/Altair/);
  await expect.element(destinations.nth(1)).toHaveTextContent(/Sirius/);
});

desktopTest("the black-hole atlas opens and travels to a sourced horizon", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("Black Holes");
  await expect
    .element(page.getByRole("heading", { name: "Follow the light to its edge" }))
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

desktopTest("the atlas folds archive candidates in beside the curated horizons", async () => {
  stubArchive();
  mountApp();
  await openDiscoverSection("Black Holes");

  const candidate = page.getByRole("button", { name: /GS 2023\+338/ });
  await expect.element(candidate).toBeVisible();
  await expect.element(page.getByText(/· Candidate ·/).first()).toBeVisible();
  await expect.element(page.getByText("Mass unavailable").first()).toBeVisible();
  await expect.element(page.getByRole("button", { name: /Sagittarius A\*/ })).toBeVisible();
});

desktopTest("a black-hole collection narrows the atlas to its own horizons", async () => {
  stubArchive();
  mountApp();
  await openDiscoverSection("Black Holes");
  await expect.element(page.getByRole("button", { name: /GS 2023\+338/ })).toBeVisible();

  await userEvent.click(page.getByRole("button", { name: /Seen with our own eyes/ }));
  await expect.element(page.getByRole("button", { name: /M87\*/ })).toBeVisible();
  await expect.element(page.getByRole("button", { name: /GS 2023\+338/ })).not.toBeInTheDocument();

  await userEvent.click(page.getByRole("button", { exact: true, name: "Stellar mass" }));
  await expect.element(page.getByRole("button", { name: /Cygnus X-1/ })).toBeVisible();
  await expect.element(page.getByRole("button", { name: /M87\*/ })).not.toBeInTheDocument();
});

desktopTest("the atlas search resolves a horizon by its catalog alias", async () => {
  stubArchive();
  mountApp();
  await openDiscoverSection("Black Holes");

  await userEvent.fill(page.getByPlaceholder("Search by name, catalog ID or host galaxy"), "sgr a");
  const destination = page.getByRole("button", { name: /Sagittarius A\*/ });
  await expect.element(destination).toBeVisible();
  await expect.element(page.getByRole("button", { name: /TON 618/ })).not.toBeInTheDocument();

  await userEvent.click(destination);
  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Sagittarius A*");
});

/*
 * Exora asks for its webfont a second after the first paint, so a visitor's first read of a name is
 * in whatever sans their platform supplies — and the widest of those are wide enough to hang a long
 * catalogue word out of the column that holds it. Naming that font keeps this a measurement of the
 * layout rather than of whichever fonts the machine running the suite happens to install.
 */
test("a long destination name stays inside its column before the webfont arrives", async () => {
  stubArchive();
  document.documentElement.style.fontFamily = "Verdana, DejaVu Sans, sans-serif";
  mountApp("?blackHole=Sagittarius%20A*");

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Sagittarius A*");
  const title = document.querySelector<HTMLElement>("#black-hole-name");
  expect(title).not.toBeNull();
  expect(title?.scrollWidth).toBeLessThanOrEqual(title?.clientWidth ?? 0);
});

desktopTest(
  "the Home System catalog opens the Oort Cloud with an explicit inferred-model warning",
  async () => {
    stubArchive();
    mountApp();

    await openDiscoverSection("Solar System");
    await userEvent.click(page.getByRole("button", { exact: true, name: "Regions" }));
    await userEvent.fill(page.getByPlaceholder("Search by name or SPK ID"), "Oort");
    const oortCloud = page.getByRole("button", { name: /Oort Cloud/ });
    await expect.element(oortCloud).toBeVisible();
    await userEvent.click(oortCloud);

    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Oort Cloud");
    await expect.element(page.getByText(/never directly observed/).first()).toBeVisible();
    await expandPanel();
    await expect.element(page.getByLabelText("Region data")).toHaveTextContent("NAIF 10");
    expect(window.location.search).toBe("?region=Oort%20Cloud");
  },
);

desktopTest(
  "a Solar System planet switches into its dedicated parent-centered subsystem",
  async () => {
    stubArchive();
    mountApp("?planet=Jupiter");

    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Jupiter");
    const subsystem = page.getByRole("button", { name: "Explore Jupiter's moons" });
    await expect.element(subsystem).toBeVisible();
    await userEvent.click(subsystem);

    await expect
      .element(
        page.getByText(
          "JPL mean orbits, with distances log-compressed and bodies drawn larger than life.",
          { exact: true },
        ),
      )
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Back to Jupiter" }))
      .toHaveAttribute("aria-pressed", "true");

    await openPanelSection("Moons");
    await expect.element(page.getByRole("button", { name: /Europa/ })).toBeVisible();

    await openPanelSection("Evidence");
    await expect.element(page.getByText("Unresolved surfaces", { exact: true })).toBeVisible();
  },
);

desktopTest(
  "the Solar System diorama distinguishes cached JPL positions from catalog phases",
  async () => {
    stubArchive();
    mountApp("?system=Sun");

    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Sun");
    await openPanelSection("Time");
    await expect
      .element(page.getByText("Simplified catalog orbits", { exact: true }))
      .toBeVisible();
    await userEvent.click(page.getByRole("button", { exact: true, name: "Now" }));

    await expect
      .element(page.getByText("JPL positions, cached on the server", { exact: true }))
      .toBeVisible();
    await expect.element(page.getByRole("button", { exact: true, name: "Play" })).toBeEnabled();
    await userEvent.click(page.getByRole("button", { exact: true, name: "Reverse" }));
    await expect
      .element(page.getByRole("button", { exact: true, name: "Reverse" }))
      .toHaveAttribute("aria-pressed", "true");
    await userEvent.click(page.getByRole("button", { name: "Back to catalog orbits" }));
    await expect
      .element(page.getByText("Simplified catalog orbits", { exact: true }))
      .toBeVisible();
  },
);

desktopTest("the Sun's complete world list scrolls inside the destination panel", async () => {
  stubArchive();
  mountApp("?star=Sun");

  const telemetry = page.getByLabelText("Observed star data");
  await expect.element(telemetry).toHaveTextContent(/Earth distance\s*1\s*AU/);
  await expect.element(telemetry).toHaveTextContent(/Diameter\s*1,391,400\s*km/);
  await expect.element(telemetry).toHaveTextContent(/Temperature\s*5,772\s*K/);

  await openPanelSection("Record");
  await expect.element(telemetry).toHaveTextContent("25.38 d sidereal");
  await expect.element(telemetry).toHaveTextContent(/Axial tilt 7.25°/);

  await openPanelSection("Worlds");
  const worlds = document.querySelector<HTMLElement>('[data-testid="panel-body"]');
  expect(worlds).not.toBeNull();
  expect(getComputedStyle(worlds!).overflowY).toBe("auto");
  expect(getComputedStyle(worlds!).overscrollBehaviorY).toBe("contain");
  expect(worlds!.scrollHeight).toBeGreaterThan(worlds!.clientHeight);

  worlds!.scrollTo({ top: worlds!.scrollHeight });
  expect(worlds!.scrollTop).toBeGreaterThan(0);
  await expect.element(page.getByRole("button", { name: /Makemake/ })).toBeVisible();
});

desktopTest(
  "the Solar System's complete object list scrolls inside the destination panel",
  async () => {
    stubArchive();
    mountApp("?system=Sun");

    await openPanelSection("Worlds");
    await expect.element(page.getByRole("button", { name: /Makemake/ })).toBeVisible();
    const worlds = document.querySelector<HTMLElement>('[data-testid="panel-body"]');
    expect(worlds).not.toBeNull();
    expect(getComputedStyle(worlds!).overflowY).toBe("auto");
    expect(getComputedStyle(worlds!).overscrollBehaviorY).toBe("contain");
    expect(worlds!.scrollHeight).toBeGreaterThan(worlds!.clientHeight);

    worlds!.scrollTo({ top: worlds!.scrollHeight });
    expect(worlds!.scrollTop).toBeGreaterThan(0);
    await expect.element(page.getByRole("button", { name: /Makemake/ })).toBeVisible();
  },
);

desktopTest("a dialog closes on Escape and returns the page", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("Exoplanets");
  await expect.element(page.getByRole("dialog")).toBeVisible();

  await userEvent.keyboard("{Escape}");
  expect(document.querySelector("dialog[open]")).toBeNull();
});

desktopTest("the World Forge opens and builds a world the page then shows", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("World Forge");
  await expect
    .element(page.getByRole("heading", { name: "Make the next discovery" }))
    .toBeVisible();
  await userEvent.click(page.getByRole("button", { name: /GENERATE/i }).first());

  await expect.element(page.getByText("Generated world")).toBeVisible();
  expect(window.location.search).toContain("custom=");
});

desktopTest("the World Forge builds a black hole with a reloadable recipe", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("World Forge");
  await userEvent.click(page.getByRole("tab", { name: "Black hole" }));
  await userEvent.fill(page.getByLabelText("Name", { exact: true }), "Umbra Prime");
  await userEvent.click(page.getByRole("button", { name: /GENERATE BLACK HOLE/i }));

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Umbra Prime");
  const sharedSearch = window.location.search;
  expect(sharedSearch).toMatch(/^\?customBlackHole=[A-Za-z0-9_-]+$/);
  await expect.element(page.getByLabelText(/Procedural visualization/i)).toBeVisible();

  remountAppAtCurrentUrl();

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Umbra Prime");
  expect(window.location.search).toBe(sharedSearch);
});

desktopTest("a generated world survives a reload and its URL opens as a deep link", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("World Forge");
  await userEvent.fill(page.getByLabelText("Name", { exact: true }), "Reloadia");
  await userEvent.click(page.getByRole("button", { name: /GENERATE PLANET/i }));
  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Reloadia");
  const sharedSearch = window.location.search;
  expect(sharedSearch).toMatch(/^\?custom=[A-Za-z0-9_-]+$/);

  remountAppAtCurrentUrl();

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Reloadia");
  expect(window.location.search).toBe(sharedSearch);
  await expect.element(page.getByText("Generated world")).toBeVisible();
});

desktopTest("an invalid custom recipe fails safely with a clear recovery path", async () => {
  stubArchive();
  mountApp("?custom=not-a-valid-recipe");

  await expect
    .element(page.getByRole("heading", { name: "Destination unavailable" }))
    .toBeVisible();
  await expect.element(page.getByText(/World Forge recipe that is invalid/i)).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Go to the featured world" }))
    .toBeVisible();
});

desktopTest("back and forward restore generated planets and stars", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("World Forge");
  await userEvent.fill(page.getByLabelText("Name", { exact: true }), "History World");
  await userEvent.click(page.getByRole("button", { name: /GENERATE PLANET/i }));
  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("History World");
  const planetSearch = window.location.search;

  await openDiscoverSection("World Forge");
  await userEvent.click(page.getByRole("tab", { exact: true, name: "Star" }));
  await userEvent.fill(page.getByLabelText("Name", { exact: true }), "History Star");
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

desktopTest("Backspace toggles Explore open and closed", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  await userEvent.keyboard("{Backspace}");
  await expect.element(page.getByRole("dialog", { name: /Find another world/ })).toBeVisible();

  await userEvent.keyboard("{Backspace}");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
});

desktopTest("Backspace edits an Explore search field instead of closing the screen", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("Exoplanets");
  const search = page.getByPlaceholder(/Search by name or catalog ID/i);
  await userEvent.fill(search, "Kepler");
  await userEvent.keyboard("{Backspace}");

  await expect.element(search).toHaveValue("Keple");
  await expect.element(page.getByRole("dialog")).toBeVisible();
});

test("H toggles the interface away and back, and only on the main screen", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  const clearView = page.getByRole("button", { name: "Hide the interface" });
  await expect.element(clearView).toBeVisible();

  const panels = ["topbar", "world-intro", "telemetry"].map((testId) => {
    const selector = `[data-testid="${testId}"]`;
    const panel = document.querySelector<HTMLElement>(selector);
    expect(panel, selector).not.toBeNull();
    return panel!;
  });
  const mobile = window.innerWidth <= 760;
  // Found by test id, since a hidden button is not in the accessibility tree to be found by role.
  const restore = page.getByTestId("restore-view");
  const expectCleared = async (): Promise<void> => {
    for (const panel of panels) await expect.element(panel).not.toBeVisible();
    await expect.element(restore).toBeVisible();
    await expect.element(restore).toHaveAccessibleName("Show the interface");
  };
  const expectRestored = async (): Promise<void> => {
    for (const panel of panels) await expect.element(panel).toBeVisible();
    await expect.element(restore).not.toBeVisible();
  };

  await userEvent.click(clearView);
  await expectCleared();

  await userEvent.keyboard("{Backspace}");
  await expect.element(page.getByRole("dialog")).toBeVisible();
  await userEvent.keyboard("{Backspace}");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await expectCleared();

  if (mobile) await userEvent.click(restore);
  else await userEvent.keyboard("h");
  await expectRestored();

  if (mobile) await userEvent.click(page.getByRole("button", { name: "Hide the interface" }));
  else await userEvent.keyboard("h");
  await expectCleared();

  await userEvent.click(restore);
  await expectRestored();
});

desktopTest("terrain view fades every interface region and reveals the hovered one", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  const shell = document.querySelector<HTMLElement>(".experience-shell");
  expect(shell).not.toBeNull();
  await planetSceneStub.viewModeReady;
  planetSceneStub.setViewMode?.("surface");
  await expect.poll(() => shell!.classList.contains("view-surface")).toBe(true);
  const canvas = document.querySelector<HTMLCanvasElement>("canvas");
  expect(canvas).not.toBeNull();
  await page.elementLocator(canvas!).hover();

  const regions = ["topbar", "world-intro", "telemetry"].map((testId) =>
    document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!,
  );
  for (const region of regions) {
    await expect.poll(() => getComputedStyle(region).opacity).toBe("0.38");
  }

  const hoveredRegion = regions[1]!;
  await page.elementLocator(hoveredRegion).hover();

  await expect.poll(() => getComputedStyle(hoveredRegion).opacity).toBe("1");
  for (const region of regions) {
    if (region !== hoveredRegion) expect(getComputedStyle(region).opacity).toBe("0.38");
  }
});

desktopTest("Tab only ever moves focus, and never hides the interface", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  const shell = document.querySelector<HTMLElement>(".experience-shell");
  expect(shell).not.toBeNull();

  await userEvent.keyboard("{Tab}");
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  expect(shell!.classList.contains("chrome-hidden")).toBe(false);

  await openDiscoverSection("Exoplanets");
  await expect.element(page.getByRole("dialog")).toBeVisible();

  await userEvent.keyboard("{Tab}");
  expect(shell!.classList.contains("chrome-hidden")).toBe(false);
  await expect.element(page.getByRole("dialog")).toBeVisible();
});

desktopTest("the search pill opens the palette, which travels by name", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  await userEvent.click(page.getByRole("button", { name: "Go anywhere" }));
  const field = page.getByRole("combobox");
  await expect.element(field).toHaveFocus();
  await userEvent.fill(field, "Sagittarius");
  const option = page.getByRole("option", { name: /Sagittarius A\*/ });
  await expect.element(option).toBeVisible();
  await userEvent.click(option);

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Sagittarius A*");
});

desktopTest(
  "an open overlay parks the renderer, and closing it starts the loop again",
  async () => {
    stubArchive();
    mountApp();
    await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

    expect(stubbedHost().renderSuspensions).toBe(0);

    await openDiscoverSection("Exoplanets");
    await expect.element(page.getByRole("dialog")).toBeVisible();
    expect(stubbedHost().renderSuspensions).toBe(1);

    await userEvent.click(page.getByRole("button", { name: "Close Explore" }));
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(stubbedHost().renderSuspensions).toBe(0);

    await openDiscoverSection("World Forge");
    await expect.element(page.getByRole("dialog")).toBeVisible();
    expect(stubbedHost().renderSuspensions).toBe(1);

    await userEvent.click(page.getByRole("button", { name: "Close Explore" }));
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(stubbedHost().renderSuspensions).toBe(0);
  },
);

desktopTest(
  "AR presents the active destination without a console and exits to the same browser view",
  async () => {
    stubArchive();
    mountApp();
    const destination = page.getByRole("heading", { level: 1 });
    await expect.element(destination).toBeVisible();
    const destinationName = destination.element().textContent;

    await userEvent.click(page.getByRole("button", { name: "View in AR" }));
    expect(page.getByRole("dialog")).not.toBeInTheDocument();

    stubbedHost().setInXr(false);
    await expect.element(destination).toBeVisible();
    expect(destination.element().textContent).toBe(destinationName);
    expect(page.getByRole("dialog")).not.toBeInTheDocument();
  },
);

test("Explore scrolls as one surface, with the Forge's action kept in reach", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  await openDiscoverSection("Exoplanets");
  const catalog = document.querySelector<HTMLElement>('[data-testid="planet-catalog"]');
  const discoverStage = document.querySelector<HTMLElement>('[data-testid="discover-stage"]');
  expect(getComputedStyle(catalog!).overflowY).toBe("visible");
  expect(getComputedStyle(discoverStage!).overflowY).toBe("auto");
  expect(
    getComputedStyle(document.querySelector('[data-testid="catalog-results"]')!).overflowY,
  ).toBe("visible");

  await userEvent.click(page.getByRole("button", { name: "Close Explore" }));
  await openDiscoverSection("World Forge");
  const forge = document.querySelector<HTMLElement>('[data-testid="planet-builder"]');
  const forgeForm = forge?.querySelector<HTMLFormElement>('[data-testid="planet-builder-form"]');
  const forgeFooter = forge?.querySelector<HTMLElement>('[data-style-role="builder-footer"]');
  expect(getComputedStyle(forge!).overflowY).toBe("visible");
  expect(getComputedStyle(forgeForm!).overflowY).toBe("visible");
  expect(getComputedStyle(forgeFooter!).position).toBe("sticky");
});

desktopTest("Explore resets its scroll position when changing sections", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  await openDiscoverSection("Solar System");
  const discoverStage = document.querySelector<HTMLElement>('[data-testid="discover-stage"]')!;
  discoverStage.scrollTop = 500;
  expect(discoverStage.scrollTop).toBeGreaterThan(0);

  await userEvent.click(page.getByRole("button", { name: /Stars/ }).first());
  await expect.poll(() => discoverStage.scrollTop).toBe(0);
});

test("Explore content fits the mobile viewport in every section", async () => {
  if (window.innerWidth > 760) return;

  stubArchive();
  mountApp();
  await openDiscoverSection("Exoplanets");

  for (const section of [
    "Exoplanets",
    "Stars",
    "Solar System",
    "Black Holes",
    "Atlas",
    "Guided Tours",
    "World Forge",
  ] as const) {
    await userEvent.click(page.getByRole("button", { name: new RegExp(section) }).first());
    const stage = document.querySelector<HTMLElement>('[data-testid="discover-stage"]')!;
    expect(stage.scrollWidth).toBeLessThanOrEqual(stage.clientWidth);
  }
});

test("nothing overflows the viewport horizontally", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    document.documentElement.clientWidth,
  );
});

test("the navigation deck keeps an even gap between every control", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  const discover = document
    .querySelector<HTMLElement>('[data-testid="discover-trigger"]')!
    .getBoundingClientRect();
  const clearView = document
    .querySelector<HTMLElement>('[data-testid="clear-view"]')!
    .getBoundingClientRect();
  const xr = document
    .querySelector<HTMLElement>('[data-testid="enter-vr"]')!
    .getBoundingClientRect();
  const firstGap = clearView.left - discover.right;
  const secondGap = xr.left - clearView.right;

  expect(Math.abs(firstGap - secondGap)).toBeLessThanOrEqual(1);
});
