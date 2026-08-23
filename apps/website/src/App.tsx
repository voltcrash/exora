import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomStar, CustomWorld, WorldRecipe } from "@exora/worldgen";
import { lazy, Suspense, useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  loadPlanetByName,
  type PlanetLoadResult,
  type StarLoadResult,
  type SystemLoadResult,
} from "./api-client.ts";
import { reachStar, reachSystem } from "./destination-cache.ts";
import { PlanetExperience } from "./components/PlanetExperience.tsx";
import { RecoveryScreen } from "./components/RecoveryScreen.tsx";
import { featuredPlanet } from "./planet-profile.ts";
import { hasRenderer } from "./planet-utils.tsx";
import { canonicalUrlForSearch } from "./canonical-url.ts";
import { togglesClearView } from "./clear-view-shortcut.ts";
import { opensSearchShortcut } from "./search-shortcut.ts";
import { TRAVEL_CROSS_MS, TRAVEL_REVEAL_MS, type TravelPhase } from "./travel-transition.ts";
import { useSceneHost } from "./use-scene-host.ts";
import { findSolarStar, findSolarWorld } from "./solar-system.ts";

const PlanetCatalog = lazy(() =>
  import("./components/PlanetCatalog.tsx").then((module) => ({ default: module.PlanetCatalog })),
);
const StarCatalog = lazy(() =>
  import("./components/StarCatalog.tsx").then((module) => ({ default: module.StarCatalog })),
);
const SolarSystemCatalog = lazy(() =>
  import("./components/SolarSystemCatalog.tsx").then((module) => ({
    default: module.SolarSystemCatalog,
  })),
);
const StarExperience = lazy(() =>
  import("./components/StarExperience.tsx").then((module) => ({ default: module.StarExperience })),
);
const SystemExperience = lazy(() =>
  import("./components/SystemExperience.tsx").then((module) => ({
    default: module.SystemExperience,
  })),
);
const WorldForge = lazy(() =>
  import("./components/CustomPlanetBuilder.tsx").then((module) => ({ default: module.WorldForge })),
);

type ActiveObject =
  | { result: PlanetLoadResult; type: "planet" }
  | { result: StarLoadResult; type: "star" }
  | { result: SystemLoadResult; type: "system" }
  | { kind: "planet" | "star" | "system"; name: string; type: "missing" };

const defaultPlanetObject = (): ActiveObject => ({
  result: { cached: true, mode: "fallback", planet: featuredPlanet },
  type: "planet",
});

const loadRequestedObject = async (): Promise<ActiveObject> => {
  const parameters = new URLSearchParams(window.location.search);
  const starName = parameters.get("star");
  if (starName) {
    const localStar = findSolarStar(starName);
    if (localStar)
      return { result: { cached: true, mode: "solar", star: localStar }, type: "star" };
    const star = await reachStar(starName);
    if (star) return { result: star, type: "star" };
    return { kind: "star", name: starName, type: "missing" };
  }

  const systemName = parameters.get("system");
  if (systemName) {
    const system = await reachSystem(systemName);
    if (system) return { result: system, type: "system" };
    return { kind: "system", name: systemName, type: "missing" };
  }

  const name = parameters.get("planet");
  if (!name) return defaultPlanetObject();

  const localWorld = findSolarWorld(name);
  if (localWorld) {
    return { result: { cached: true, mode: "solar", planet: localWorld }, type: "planet" };
  }

  const requested = await loadPlanetByName(name);
  return requested && hasRenderer(requested.planet)
    ? { result: requested, type: "planet" }
    : { kind: "planet", name, type: "missing" };
};

export const App = () => {
  // The canvas and the renderer behind it belong to the page, not to either view. Travelling
  // from a world to its host star swaps which view is mounted, and a WebXR session cannot
  // survive its WebGL context being torn down and rebuilt underneath it.
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const {
    host: sceneHost,
    restart: restartSceneHost,
    status: sceneHostStatus,
  } = useSceneHost(canvas);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [starCatalogOpen, setStarCatalogOpen] = useState(false);
  const [solarSystemCatalogOpen, setSolarSystemCatalogOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [activeObject, setActiveObject] = useState<ActiveObject | null>(() => {
    const parameters = new URLSearchParams(window.location.search);
    return parameters.has("planet") || parameters.has("star") || parameters.has("system")
      ? null
      : defaultPlanetObject();
  });
  const [customRecipe, setCustomRecipe] = useState<WorldRecipe | null>(null);
  const [systemHostName, setSystemHostName] = useState<string | null>(null);

  // Whether the interface has been put away, leaving the world on its own. Held here rather than
  // in the view showing it, for the same reason the travel phase is: it is a property of the page
  // and has to survive one destination being exchanged for another.
  const [chromeHidden, setChromeHidden] = useState(false);

  // Held here rather than inside each view, because the point of the phase is that it outlives
  // the swap: the destination arriving has to be mounted already knowing a jump is in the air,
  // or it paints its own loading card over the flight for the frame before it finds out.
  const [travelPhase, setTravelPhase] = useState<TravelPhase>("idle");
  useEffect(() => sceneHost?.onTravelPhase(setTravelPhase), [sceneHost]);

  // Every one of these covers the canvas with a modal dialog, so for as long as one is open the
  // scene behind it is being rendered for nobody — and worse, keeping it moving forces the
  // browser to rebuild the scrim's backdrop blur every frame. Parking the loop reclaims both.
  const overlayOpen = builderOpen || catalogOpen || starCatalogOpen || solarSystemCatalogOpen;
  useEffect(() => {
    if (!sceneHost || !overlayOpen) return;
    return sceneHost.suspendRendering();
  }, [overlayOpen, sceneHost]);

  // Whether a destination is what is on screen, with nothing layered over it. Everything else the
  // page can be showing — a dialog, a recovery screen, the first load — is somewhere the Tab
  // shortcut below has to stand down and let the key go back to traversing focus.
  const onMainScreen =
    !overlayOpen &&
    activeObject !== null &&
    activeObject.type !== "missing" &&
    (sceneHostStatus === "initializing" || sceneHostStatus === "ready");

  const loadFromLocation = useCallback(() => {
    setCustomRecipe(null);
    setSystemHostName(null);
    void loadRequestedObject().then(setActiveObject);
  }, []);

  useEffect(() => {
    loadFromLocation();
    window.addEventListener("popstate", loadFromLocation);
    return () => window.removeEventListener("popstate", loadFromLocation);
  }, [loadFromLocation]);

  // The `/` shortcut the catalog button advertises with its `<kbd>`.
  //
  // It belongs here rather than inside the catalog, because the catalog is only mounted once it
  // is already open: a listener living there could never see the press that is supposed to open
  // it. It stands down for as long as the interface is hidden: a cleared view opening a dialog
  // over itself would be no kind of clearing.
  useEffect(() => {
    if (chromeHidden) return;

    const openCatalogWithShortcut = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        !opensSearchShortcut({
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          key: event.key,
          metaKey: event.metaKey,
          target: target instanceof HTMLElement ? target : null,
        })
      ) {
        return;
      }

      // Only once the press is known to be the shortcut is suppressing the browser's own
      // quick-find the right thing to do.
      event.preventDefault();
      setCatalogOpen(true);
    };

    document.addEventListener("keydown", openCatalogWithShortcut);
    return () => document.removeEventListener("keydown", openCatalogWithShortcut);
  }, [chromeHidden]);

  // Tab puts the interface away and brings it back. It is the whole of the way back, because the
  // button that hides the interface is hidden along with it — which is why that button wears the
  // key on its face, the way the catalog trigger wears `/`.
  //
  // Taking the browser's focus key is only defensible taken narrowly, so `togglesClearView`
  // declines everywhere the key already means something: over a dialog, inside a text field, in a
  // chord. Shift+Tab is left traversing, which is what still reaches this page's controls.
  useEffect(() => {
    const toggleChrome = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        !togglesClearView({
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          key: event.key,
          metaKey: event.metaKey,
          onMainScreen,
          shiftKey: event.shiftKey,
          target: target instanceof HTMLElement ? target : null,
        })
      ) {
        return;
      }

      // Only once the press is known to be the shortcut is suppressing the browser's own focus
      // traversal the right thing to do.
      event.preventDefault();
      setChromeHidden((hidden) => !hidden);
    };

    document.addEventListener("keydown", toggleChrome);
    return () => document.removeEventListener("keydown", toggleChrome);
  }, [onMainScreen]);

  // Keeps the canonical link and the shared-link URL on the destination actually being shown.
  // Travel rewrites the query string through `pushState`, which moves neither on its own, so
  // without this every world would go on claiming to be the landing page — and `sitemap.xml`
  // would be offering destinations that each declare themselves a duplicate of the root.
  useEffect(() => {
    const canonical = canonicalUrlForSearch(window.location.search);
    document
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.setAttribute("href", canonical);
    document
      .querySelector<HTMLMetaElement>('meta[property="og:url"]')
      ?.setAttribute("content", canonical);
  }, [activeObject]);

  // Stable identities: the immersive console hands these to the Babylon scene, and a new
  // function on every render would tear the renderer down and rebuild it mid-session.
  const selectPlanet = useCallback((planet: ExoplanetProfile, cached: boolean): void => {
    window.history.pushState({}, "", `?planet=${encodeURIComponent(planet.name)}`);
    setCatalogOpen(false);
    setCustomRecipe(null);
    setSolarSystemCatalogOpen(false);
    setActiveObject({
      result: { cached, mode: planet.solarSystem ? "solar" : "live", planet },
      type: "planet",
    });
  }, []);

  const selectStar = useCallback((star: StarProfile, cached: boolean): void => {
    window.history.pushState({}, "", `?star=${encodeURIComponent(star.name)}`);
    setStarCatalogOpen(false);
    setSolarSystemCatalogOpen(false);
    setCustomRecipe(null);
    setSystemHostName(null);
    setActiveObject({
      result: { cached, mode: star.solarSystem ? "solar" : "live", star },
      type: "star",
    });
  }, []);

  /**
   * Travel to a whole host system, from a world in it, from its star, or from the console.
   *
   * Reports back whether the archive had anything to place, the way `selectHostStar` does, so
   * the view that asked can say so rather than the page going somewhere empty.
   */
  const selectSystem = useCallback(async (hostStar: string): Promise<boolean> => {
    const system = await reachSystem(hostStar);
    if (!system) return false;
    window.history.pushState({}, "", `?system=${encodeURIComponent(hostStar)}`);
    setCustomRecipe(null);
    setSystemHostName(hostStar);
    setActiveObject({ result: system, type: "system" });
    return true;
  }, []);

  const selectHostStar = useCallback(async (hostStar: string): Promise<boolean> => {
    const result = await reachStar(hostStar);
    if (!result) return false;
    window.history.pushState({}, "", `?star=${encodeURIComponent(result.star.name)}`);
    setCustomRecipe(null);
    setSystemHostName(hostStar);
    setActiveObject({ result, type: "star" });
    return true;
  }, []);

  const generatePlanet = useCallback(({ planet, recipe }: CustomWorld): void => {
    window.history.pushState({}, "", `?custom=${encodeURIComponent(planet.name)}`);
    setBuilderOpen(false);
    setCustomRecipe(recipe);
    setActiveObject({
      result: { cached: false, mode: "custom", planet },
      type: "planet",
    });
  }, []);

  const generateStar = useCallback(({ star }: CustomStar): void => {
    window.history.pushState({}, "", `?customStar=${encodeURIComponent(star.name)}`);
    setBuilderOpen(false);
    setCustomRecipe(null);
    setActiveObject({
      result: { cached: false, mode: "custom", star },
      type: "star",
    });
  }, []);

  const returnHome = useCallback((): void => {
    window.history.replaceState({}, "", "/");
    setCustomRecipe(null);
    setSystemHostName(null);
    setActiveObject(defaultPlanetObject());
  }, []);

  const subject =
    activeObject && activeObject.type !== "missing"
      ? activeObject.type === "planet"
        ? activeObject.result.planet.name
        : activeObject.type === "system"
          ? `the ${activeObject.result.hostStar} system`
          : activeObject.result.star.name
      : null;

  return (
    <>
      <canvas
        ref={setCanvas}
        id="render-canvas"
        aria-label={
          subject ? `Interactive visualization of ${subject}` : "Celestial object visualization"
        }
        tabIndex={0}
      />
      {/*
        The dark a jump crosses in. It covers the swap itself — the one moment of travel that
        cannot be flown through, because building a destination stalls the frame loop while it
        runs — and belongs to the page rather than to either view, so that it survives the two of
        them being exchanged underneath it. The renderer times the flight by the same constants.
      */}
      <div
        className={`travel-veil ${travelPhase === "crossing" ? "crossing" : ""}`}
        aria-hidden="true"
        style={
          {
            "--travel-cross": `${TRAVEL_CROSS_MS}ms`,
            "--travel-reveal": `${TRAVEL_REVEAL_MS}ms`,
          } as CSSProperties
        }
      />
      {sceneHostStatus === "context-lost" || sceneHostStatus === "recovering" ? (
        <RecoveryScreen
          action="RESTART NOW"
          detail={
            sceneHostStatus === "context-lost"
              ? "The browser paused graphics access. Exora will resume when the GPU context returns."
              : "Graphics access returned. Exora is rebuilding the current destination."
          }
          heading={sceneHostStatus === "context-lost" ? "RECONNECTING TO GPU" : "RESTORING SCENE"}
          onRetry={restartSceneHost}
          pending
        />
      ) : null}
      {sceneHostStatus === "failed" ? (
        <RecoveryScreen
          action="RESTART RENDERER"
          detail="The graphics session could not be restored. Restarting keeps the current destination selected."
          heading="RENDERER OFFLINE"
          onRetry={restartSceneHost}
        />
      ) : null}
      {!activeObject ? (
        <div className="loading-screen initial-loading" role="status">
          <div className="loading-orbit" aria-hidden="true">
            <span />
          </div>
          <p>CONTACTING OBSERVATORIES</p>
          <small>RESOLVING CELESTIAL OBJECT</small>
        </div>
      ) : activeObject.type === "missing" ? (
        <RecoveryScreen
          action="RETURN TO FEATURED WORLD"
          detail={`The ${activeObject.kind} “${activeObject.name}” could not be resolved from its archive or is not yet supported by Exora.`}
          heading="DESTINATION UNAVAILABLE"
          onRetry={returnHome}
        />
      ) : activeObject.type === "planet" ? (
        <PlanetExperience
          key={activeObject.result.planet.id}
          chromeHidden={chromeHidden}
          host={sceneHost}
          result={activeObject.result}
          onGeneratePlanet={generatePlanet}
          onGenerateStar={generateStar}
          onHideChrome={() => setChromeHidden(true)}
          onOpenCatalog={() => setCatalogOpen(true)}
          onOpenBuilder={() => setBuilderOpen(true)}
          onOpenStars={() => setStarCatalogOpen(true)}
          onOpenSolarSystem={() => setSolarSystemCatalogOpen(true)}
          onSelectHostStar={selectHostStar}
          onSelectPlanet={selectPlanet}
          onSelectStar={selectStar}
          onSelectSystem={selectSystem}
          recipeOverride={customRecipe}
          travelPhase={travelPhase}
        />
      ) : activeObject.type === "system" ? (
        <Suspense fallback={null}>
          <SystemExperience
            key={activeObject.result.hostStar}
            chromeHidden={chromeHidden}
            host={sceneHost}
            result={activeObject.result}
            onGeneratePlanet={generatePlanet}
            onGenerateStar={generateStar}
            onHideChrome={() => setChromeHidden(true)}
            onSelectHostStar={selectHostStar}
            onSelectPlanet={selectPlanet}
            onSelectStar={selectStar}
            onOpenBuilder={() => setBuilderOpen(true)}
            onOpenPlanets={() => setCatalogOpen(true)}
            onOpenStars={() => setStarCatalogOpen(true)}
            onOpenSolarSystem={() => setSolarSystemCatalogOpen(true)}
            travelPhase={travelPhase}
          />
        </Suspense>
      ) : (
        <Suspense fallback={null}>
          <StarExperience
            key={activeObject.result.star.id}
            chromeHidden={chromeHidden}
            host={sceneHost}
            result={activeObject.result}
            systemHostName={systemHostName}
            onGeneratePlanet={generatePlanet}
            onGenerateStar={generateStar}
            onHideChrome={() => setChromeHidden(true)}
            onSelectPlanet={selectPlanet}
            onSelectStar={selectStar}
            onSelectSystem={selectSystem}
            onOpenPlanets={() => setCatalogOpen(true)}
            onOpenStars={() => setStarCatalogOpen(true)}
            onOpenBuilder={() => setBuilderOpen(true)}
            onOpenSolarSystem={() => setSolarSystemCatalogOpen(true)}
            travelPhase={travelPhase}
          />
        </Suspense>
      )}
      {catalogOpen ? (
        <Suspense fallback={null}>
          <PlanetCatalog onClose={() => setCatalogOpen(false)} onSelect={selectPlanet} />
        </Suspense>
      ) : null}
      {starCatalogOpen ? (
        <Suspense fallback={null}>
          <StarCatalog onClose={() => setStarCatalogOpen(false)} onSelect={selectStar} />
        </Suspense>
      ) : null}
      {solarSystemCatalogOpen ? (
        <Suspense fallback={null}>
          <SolarSystemCatalog
            onClose={() => setSolarSystemCatalogOpen(false)}
            onSelectPlanet={selectPlanet}
            onSelectStar={selectStar}
          />
        </Suspense>
      ) : null}
      {builderOpen && activeObject && activeObject.type !== "missing" ? (
        <Suspense fallback={null}>
          <WorldForge
            initialMode={activeObject.type === "star" ? "star" : "planet"}
            onClose={() => setBuilderOpen(false)}
            onGeneratePlanet={generatePlanet}
            onGenerateStar={generateStar}
          />
        </Suspense>
      ) : null}
    </>
  );
};
