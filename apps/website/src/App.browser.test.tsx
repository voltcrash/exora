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
  setEphemeris: () => undefined,
  setEphemerisTime: () => undefined,
});

vi.mock("./scene-host.ts", () => {
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
    enterVr: async () => undefined,
    getFps: () => 60,
    isInXr: () => false,
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
      listener("unavailable");
      return () => undefined;
    },
    profile: { hardwareScalingLevel: 1, maxIrregularBodyTriangles: 900_000, tier: "desktop" },
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

vi.mock("./small-body-scene.ts", () => ({
  createSmallBodyWorld: (_host: unknown, options: { onFirstFrame: () => void }) => {
    options.onFirstFrame();
    return mountedWorld();
  },
}));

vi.mock("./comet-scene.ts", () => ({
  createCometWorld: (_host: unknown, options: { onFirstFrame: () => void }) => {
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
          solution: "DE441/JPL small-body solution",
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

    if (url.pathname === "/api/mission-trajectories") {
      const spkId = url.searchParams.get("spk") ?? "-31";
      const stepDays = Number(url.searchParams.get("step") ?? "60");
      return Response.json({
        data: [
          {
            calendarTdb: "A.D. 1977-Sep-06 00:00:00.0000 TDB",
            julianDateTdb: 2_443_392.5,
            positionAu: { x: 1, y: 0, z: 0 },
            velocityAuPerDay: { x: 0, y: 0.02, z: 0 },
          },
          {
            calendarTdb: "A.D. 2035-Jan-01 00:00:00.0000 TDB",
            julianDateTdb: 2_464_327.5,
            positionAu: { x: 190, y: 30, z: 4 },
            velocityAuPerDay: { x: 0.01, y: 0, z: 0 },
          },
        ],
        meta: {
          cached: true,
          center: "Sun (10)",
          coordinateFrame: "Ecliptic J2000",
          retrievedAt: "2026-08-24T12:00:00.000Z",
          solution: "Voyager_1_ST+refit2022_m",
          source: "NASA/JPL Horizons API",
          sourceVersion: "1.2",
          spkId,
          stale: false,
          stepDays,
          targetName: "Voyager 1",
        },
      });
    }

    if (url.pathname === "/api/small-bodies") {
      const query = url.searchParams.get("q") ?? "";
      return Response.json({
        data: {
          closeApproaches: [
            {
              body: "Earth",
              calendarDate: "2029-Apr-13 21:46",
              distanceAu: 0.000254,
              distanceMaximumAu: 0.000256,
              distanceMinimumAu: 0.000252,
              julianDate: 2462239.407,
              relativeVelocityKilometersPerSecond: 7.42,
              timeUncertaintySeconds: 3.1,
            },
          ],
          designation: "99942",
          fullName: "99942 Apophis (2004 MN4)",
          kind: "asteroid",
          nearEarth: true,
          orbit: {
            conditionCode: "0",
            dataArcDays: 7600,
            elements: [
              {
                name: "a",
                reference: null,
                title: "semi-major axis",
                uncertainty: "1e-10",
                units: "au",
                value: "0.9224",
              },
            ],
            epochJulianDate: 2461000.5,
            firstObservation: "2004-03-15",
            lastObservation: "2026-08-01",
            solutionDate: "2026-08-02 12:00:00",
            solutionId: "220",
          },
          orbitClass: { code: "ATE", name: "Aten" },
          physicalParameters: [],
          potentiallyHazardous: true,
          spkId: "2099942",
        },
        matches: [],
        meta: {
          cached: true,
          lookup: "auto",
          query,
          retrievedAt: "2026-08-24T12:00:00.000Z",
          source: "NASA/JPL Small-Body Database (SBDB) API",
          sourceVersion: "1.3",
          stale: false,
          status: "match",
        },
      });
    }

    if (url.pathname.startsWith("/api/planets/")) {
      return Response.json({
        data: requested === "featured" ? featuredPlanet : namedPlanet(requested),
        meta: { cached: false, source: "NASA Exoplanet Archive" },
      });
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

const openDiscoverSection = async (
  name: "Exoplanets" | "Solar System" | "Stars" | "World Forge",
): Promise<void> => {
  await userEvent.click(page.getByRole("button", { name: "Open Discover" }));
  await expect.element(page.getByRole("dialog", { name: /All of space/ })).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: new RegExp(name) }).first());
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
  await expect.element(page.getByRole("button", { name: "Open Discover" })).toBeVisible();
});

test("Discover is reachable and named at this width", async () => {
  stubArchive();
  mountApp();

  // The regression this exists for: below 760px the labels are hidden and the glyphs left behind
  // are aria-hidden, so on the mobile instance these buttons resolve by name only because each
  // one carries an aria-label. A Node test cannot see that, because no stylesheet has run.
  await expect.element(page.getByRole("button", { name: "Open Discover" })).toBeVisible();
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

test("a mission deep link keeps its optional trajectory hidden until requested", async () => {
  stubArchive();
  mountApp("?mission=Voyager%201");

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Voyager 1");
  const toggle = page.getByRole("button", { name: "SHOW MISSION LAYER" });
  await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
  await userEvent.click(toggle);
  await expect
    .element(page.getByRole("button", { name: "HIDE MISSION LAYER" }))
    .toHaveAttribute("aria-pressed", "true");
  expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toContain(
    "?mission=Voyager%201",
  );
});

test("a deep link to a system resolves to the diorama, and says what it compressed", async () => {
  stubArchive();
  mountApp("?system=Kepler-90");

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

  // The star catalog opens on its curated collections with no results loaded, so reaching one
  // means searching for it.
  await userEvent.fill(page.getByPlaceholder(/Type a common name or catalog ID/), "Sirius");
  const result = page.getByRole("button", { name: /Sirius/ }).first();
  await expect.element(result).toBeVisible();
  await userEvent.click(result);

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Sirius");
  expect(window.location.search).toBe("?star=Sirius");
});

test("the Home System catalog filters mission asteroids and opens measured geometry", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("Solar System");
  await expect.element(page.getByRole("heading", { name: "Start close to home." })).toBeVisible();

  await userEvent.click(page.getByRole("button", { name: "ASTEROIDS" }));
  await userEvent.fill(page.getByPlaceholder("Name, designation, or SPK ID"), "20101955");
  const bennu = page.getByRole("button", { name: /101955 Bennu/ });
  await expect.element(bennu).toBeVisible();
  await userEvent.click(bennu);

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("101955 Bennu");
  await expect.element(page.getByText("MEASURED GEOMETRY", { exact: true })).toBeVisible();
  await expect
    .element(page.getByLabelText("Permanent identifiers"))
    .toHaveTextContent("SPK 20101955");
  expect(window.location.search).toBe("?asteroid=101955%20Bennu");
});

test("the Home System mission filter opens measured sites as an optional layer", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("Solar System");
  await userEvent.click(page.getByRole("button", { exact: true, name: "MISSIONS" }));
  await userEvent.fill(page.getByPlaceholder("Name, designation, or SPK ID"), "Apollo");
  const apollo = page.getByRole("button", { name: /Apollo landing sites/ });
  await expect.element(apollo).toBeVisible();
  await userEvent.click(apollo);

  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Apollo");
  const toggle = page.getByRole("button", { name: "SHOW MISSION LAYER" });
  await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
  await userEvent.click(toggle);
  await expect
    .element(page.getByRole("button", { name: "HIDE MISSION LAYER" }))
    .toHaveAttribute("aria-pressed", "true");
  expect(window.location.search).toBe("?mission=Apollo%20landing%20sites");
});

test("the Home System catalog searches JPL SBDB without inventing missing physical data", async () => {
  const calls = stubArchive();
  mountApp();

  await openDiscoverSection("Solar System");
  await userEvent.fill(page.getByPlaceholder("Name, designation, or SPK ID"), "Apophis");
  await userEvent.click(page.getByRole("button", { name: "SEARCH JPL SBDB" }));

  await expect
    .element(page.getByRole("heading", { name: "99942 Apophis (2004 MN4)" }))
    .toBeVisible();
  await expect.element(page.getByText("POTENTIALLY HAZARDOUS", { exact: true })).toBeVisible();
  await expect
    .element(page.getByText("No physical parameters are available in this SBDB record."))
    .toBeVisible();
  expect(calls.some((path) => path.includes("/api/small-bodies?"))).toBe(true);
});

test("the Home System catalog opens a measured comet with explicitly simulated activity", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("Solar System");
  await userEvent.click(page.getByRole("button", { exact: true, name: "COMETS" }));
  await userEvent.fill(page.getByPlaceholder("Name, designation, or SPK ID"), "1000012");
  const rosettaComet = page.getByRole("button", { name: /67P\/Churyumov/ });
  await expect.element(rosettaComet).toBeVisible();
  await userEvent.click(rosettaComet);

  await expect
    .element(page.getByRole("heading", { level: 1 }))
    .toHaveTextContent("67P/Churyumov–Gerasimenko");
  await expect.element(page.getByText("SIMULATED ACTIVITY", { exact: true })).toBeVisible();
  await expect
    .element(page.getByLabelText("Permanent identifiers"))
    .toHaveTextContent("SPK 1000012");
  await expect.element(page.getByLabelText("Heliocentric distance")).toBeVisible();
  expect(window.location.search).toBe("?comet=67P%2FChuryumov%E2%80%93Gerasimenko");
});

test("the Home System catalog opens the Oort Cloud with an explicit inferred-model warning", async () => {
  stubArchive();
  mountApp();

  await openDiscoverSection("Solar System");
  await userEvent.click(page.getByRole("button", { exact: true, name: "REGIONS" }));
  await userEvent.fill(page.getByPlaceholder("Name, designation, or SPK ID"), "Oort");
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

  await expect.element(page.getByRole("heading", { name: "Worlds in the diorama" })).toBeVisible();
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

  await userEvent.click(page.getByRole("button", { name: /GENERATE/i }).first());

  await expect.element(page.getByText("GENERATED WORLD")).toBeVisible();
  expect(window.location.search).toContain("custom=");
});

test("Backspace toggles Discover open and closed", async () => {
  stubArchive();
  mountApp();

  await userEvent.keyboard("{Backspace}");
  await expect.element(page.getByRole("dialog", { name: /All of space/ })).toBeVisible();

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

  // Both instances offer the control: only a touch-only device is refused it, and neither of
  // these emulates one. What the phone instance adds is that the button loses its copy at that
  // width, so it resolves by name here only because it carries an aria-label.
  const clearView = page.getByRole("button", { name: "Hide the interface" });
  await expect.element(clearView).toBeVisible();

  // Held as nodes rather than queried again after the press. Panels are hidden rather than faded,
  // which takes them out of the accessibility tree as well as off the screen — so a role query
  // would stop finding the very elements the assertions below are about.
  const panels = [".topbar", ".hud", ".mission-control"].map((selector) => {
    const panel = document.querySelector<HTMLElement>(selector);
    expect(panel, selector).not.toBeNull();
    return panel!;
  });

  // The button and the key do the same thing, so the button goes first and the key brings it back.
  await userEvent.click(clearView);
  for (const panel of panels) await expect.element(panel).not.toBeVisible();

  // Discover remains reachable when the chrome is hidden, and closing it returns to that same
  // uncluttered renderer rather than silently restoring the panels behind it.
  await userEvent.keyboard("{Backspace}");
  await expect.element(page.getByRole("dialog")).toBeVisible();
  await userEvent.keyboard("{Backspace}");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  for (const panel of panels) await expect.element(panel).not.toBeVisible();

  await userEvent.keyboard("{Tab}");
  for (const panel of panels) await expect.element(panel).toBeVisible();

  // …and the same key takes them away again, which is the half a one-way restore key never had.
  await userEvent.keyboard("{Tab}");
  for (const panel of panels) await expect.element(panel).not.toBeVisible();

  await userEvent.keyboard("{Tab}");
  for (const panel of panels) await expect.element(panel).toBeVisible();
});

test("terrain view fades every interface region and reveals the hovered one", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  const shell = document.querySelector<HTMLElement>(".experience-shell");
  expect(shell).not.toBeNull();
  shell!.classList.replace("view-orbit", "view-surface");
  await new Promise((resolve) => window.setTimeout(resolve, 300));

  const regions = document.querySelectorAll<HTMLElement>(
    ".topbar > *, .hud > *, .mission-control > *",
  );
  expect(regions.length).toBeGreaterThan(2);
  for (const region of regions) expect(getComputedStyle(region).opacity).toBe("0.34");

  const hoveredRegion = document.querySelector<HTMLElement>(".world-intro");
  expect(hoveredRegion).not.toBeNull();
  await userEvent.hover(hoveredRegion!);
  await new Promise((resolve) => window.setTimeout(resolve, 300));

  expect(getComputedStyle(hoveredRegion!).opacity).toBe("1");
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

test("overlay scrolling stays inside a contained surface without a viewport blur", async () => {
  stubArchive();
  mountApp();
  await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();

  await openDiscoverSection("Exoplanets");
  const catalog = document.querySelector<HTMLDialogElement>(".planet-catalog");
  const catalogScroller = catalog?.querySelector<HTMLElement>(".catalog-scroll-region");
  expect(getComputedStyle(catalog!).overflowY).toBe("hidden");
  expect(getComputedStyle(catalogScroller!).overflowY).toBe("auto");
  expect(getComputedStyle(catalogScroller!).contain).toContain("paint");
  expect(getComputedStyle(catalog!, "::backdrop").backdropFilter).toBe("none");

  await userEvent.click(page.getByRole("button", { name: "Close Discover" }));
  await openDiscoverSection("World Forge");
  const forge = document.querySelector<HTMLDialogElement>(".planet-builder");
  const forgeScroller = forge?.querySelector<HTMLFormElement>("form");
  expect(getComputedStyle(forge!).overflowY).toBe("hidden");
  expect(getComputedStyle(forgeScroller!).overflowY).toBe("auto");
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
