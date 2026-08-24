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
import { CometExperience } from "./components/CometExperience.tsx";
import { SmallBodyExperience } from "./components/SmallBodyExperience.tsx";
import { RecoveryScreen } from "./components/RecoveryScreen.tsx";
import { featuredPlanet } from "./planet-profile.ts";
import { hasRenderer } from "./planet-utils.tsx";
import { canonicalUrlForSearch } from "./canonical-url.ts";
import type { BlackHoleProfile } from "./black-holes.ts";
import { togglesClearView } from "./clear-view-shortcut.ts";
import { togglesDiscoverShortcut } from "./discover-shortcut.ts";
import { TRAVEL_CROSS_MS, TRAVEL_REVEAL_MS, type TravelPhase } from "./travel-transition.ts";
import { useSceneHost } from "./use-scene-host.ts";
import { findSolarStar, findSolarWorld } from "./solar-system.ts";
import { findSolarAsteroid, type AsteroidProfile } from "./solar-asteroids.ts";
import { findSolarComet, type CometProfile } from "./solar-comets.ts";
import { findSolarRegion, type SolarRegionProfile } from "./solar-regions.ts";
import { findSolarMission, type SolarMissionProfile } from "./solar-missions.ts";

const DiscoverScreen = lazy(() =>
  import("./components/DiscoverScreen.tsx").then((module) => ({ default: module.DiscoverScreen })),
);
const StarExperience = lazy(() =>
  import("./components/StarExperience.tsx").then((module) => ({ default: module.StarExperience })),
);
const SystemExperience = lazy(() =>
  import("./components/SystemExperience.tsx").then((module) => ({
    default: module.SystemExperience,
  })),
);
const RegionExperience = lazy(() =>
  import("./components/RegionExperience.tsx").then((module) => ({
    default: module.RegionExperience,
  })),
);
const BlackHoleExperience = lazy(() =>
  import("./components/BlackHoleExperience.tsx").then((module) => ({
    default: module.BlackHoleExperience,
  })),
);
const MissionExperience = lazy(() =>
  import("./components/MissionExperience.tsx").then((module) => ({
    default: module.MissionExperience,
  })),
);
type ActiveObject =
  | { asteroid: AsteroidProfile; type: "asteroid" }
  | { blackHole: BlackHoleProfile; type: "black-hole" }
  | { comet: CometProfile; type: "comet" }
  | { mission: SolarMissionProfile; type: "mission" }
  | { result: PlanetLoadResult; type: "planet" }
  | { result: StarLoadResult; type: "star" }
  | { result: SystemLoadResult; type: "system" }
  | { region: SolarRegionProfile; type: "region" }
  | {
      kind:
        | "asteroid"
        | "black hole"
        | "comet"
        | "mission"
        | "planet"
        | "region"
        | "star"
        | "system";
      name: string;
      type: "missing";
    };

const defaultPlanetObject = (): ActiveObject => ({
  result: { cached: true, mode: "fallback", planet: featuredPlanet },
  type: "planet",
});

const loadRequestedObject = async (): Promise<ActiveObject> => {
  const parameters = new URLSearchParams(window.location.search);
  const blackHoleName = parameters.get("blackHole");
  if (blackHoleName) {
    const { findBlackHole } = await import("./black-holes.ts");
    const blackHole = findBlackHole(blackHoleName);
    return blackHole
      ? { blackHole, type: "black-hole" }
      : { kind: "black hole", name: blackHoleName, type: "missing" };
  }
  const missionName = parameters.get("mission");
  if (missionName) {
    const mission = findSolarMission(missionName);
    return mission
      ? { mission, type: "mission" }
      : { kind: "mission", name: missionName, type: "missing" };
  }
  const regionName = parameters.get("region");
  if (regionName) {
    const region = findSolarRegion(regionName);
    return region
      ? { region, type: "region" }
      : { kind: "region", name: regionName, type: "missing" };
  }
  const cometName = parameters.get("comet");
  if (cometName) {
    const comet = findSolarComet(cometName);
    return comet ? { comet, type: "comet" } : { kind: "comet", name: cometName, type: "missing" };
  }
  const asteroidName = parameters.get("asteroid");
  if (asteroidName) {
    const asteroid = findSolarAsteroid(asteroidName);
    return asteroid
      ? { asteroid, type: "asteroid" }
      : { kind: "asteroid", name: asteroidName, type: "missing" };
  }

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
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [activeObject, setActiveObject] = useState<ActiveObject | null>(() => {
    const parameters = new URLSearchParams(window.location.search);
    return parameters.has("blackHole") ||
      parameters.has("asteroid") ||
      parameters.has("comet") ||
      parameters.has("mission") ||
      parameters.has("region") ||
      parameters.has("planet") ||
      parameters.has("star") ||
      parameters.has("system")
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

  // Discover covers the canvas completely, so for as long as it is open the scene behind it is
  // being rendered for nobody. Parking the loop gives that work back to the interface.
  const overlayOpen = discoverOpen;
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

  // Backspace — labelled Delete on Apple keyboards — is the one-key toggle for Discover. The
  // listener belongs to the page so the same key can both mount and unmount the full-screen
  // surface. It yields to text entry and to recovery/loading screens where Discover cannot open.
  useEffect(() => {
    const toggleDiscoverWithShortcut = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        !togglesDiscoverShortcut({
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          key: event.key,
          metaKey: event.metaKey,
          repeat: event.repeat,
          shiftKey: event.shiftKey,
          target: target instanceof HTMLElement ? target : null,
        })
      ) {
        return;
      }
      if (!discoverOpen && !onMainScreen) return;

      // Backspace has historically meant browser navigation when focus belongs to the page.
      // Suppress it only once the press is known to belong to Discover.
      event.preventDefault();
      if (discoverOpen) {
        setDiscoverOpen(false);
        return;
      }
      setDiscoverOpen(true);
    };

    document.addEventListener("keydown", toggleDiscoverWithShortcut);
    return () => document.removeEventListener("keydown", toggleDiscoverWithShortcut);
  }, [discoverOpen, onMainScreen]);

  // Tab puts the interface away and brings it back. It is the whole of the way back, because the
  // button that hides the interface is hidden along with it — which is why that button wears the
  // key on its face, the way the Discover trigger wears its deletion-key symbol.
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
    setDiscoverOpen(false);
    setCustomRecipe(null);
    setActiveObject({
      result: { cached, mode: planet.solarSystem ? "solar" : "live", planet },
      type: "planet",
    });
  }, []);

  const selectStar = useCallback((star: StarProfile, cached: boolean): void => {
    window.history.pushState({}, "", `?star=${encodeURIComponent(star.name)}`);
    setDiscoverOpen(false);
    setCustomRecipe(null);
    setSystemHostName(null);
    setActiveObject({
      result: { cached, mode: star.solarSystem ? "solar" : "live", star },
      type: "star",
    });
  }, []);

  const selectAsteroid = useCallback((asteroid: AsteroidProfile): void => {
    window.history.pushState({}, "", `?asteroid=${encodeURIComponent(asteroid.name)}`);
    setDiscoverOpen(false);
    setCustomRecipe(null);
    setSystemHostName(null);
    setActiveObject({ asteroid, type: "asteroid" });
  }, []);

  const selectBlackHole = useCallback((blackHole: BlackHoleProfile): void => {
    window.history.pushState({}, "", `?blackHole=${encodeURIComponent(blackHole.name)}`);
    setDiscoverOpen(false);
    setCustomRecipe(null);
    setSystemHostName(null);
    setActiveObject({ blackHole, type: "black-hole" });
  }, []);

  const selectComet = useCallback((comet: CometProfile): void => {
    window.history.pushState({}, "", `?comet=${encodeURIComponent(comet.name)}`);
    setDiscoverOpen(false);
    setCustomRecipe(null);
    setSystemHostName(null);
    setActiveObject({ comet, type: "comet" });
  }, []);

  const selectRegion = useCallback((region: SolarRegionProfile): void => {
    window.history.pushState({}, "", `?region=${encodeURIComponent(region.name)}`);
    setDiscoverOpen(false);
    setCustomRecipe(null);
    setSystemHostName(null);
    setActiveObject({ region, type: "region" });
  }, []);

  const selectMission = useCallback((mission: SolarMissionProfile): void => {
    window.history.pushState({}, "", `?mission=${encodeURIComponent(mission.name)}`);
    setDiscoverOpen(false);
    setCustomRecipe(null);
    setSystemHostName(null);
    setActiveObject({ mission, type: "mission" });
  }, []);

  const openMissionParent = useCallback(
    (parent: SolarMissionProfile["parent"]): void => {
      if (parent === "Sun") {
        const star = findSolarStar(parent);
        if (star) selectStar(star, true);
        return;
      }
      const planet = findSolarWorld(parent);
      if (planet) selectPlanet(planet, true);
    },
    [selectPlanet, selectStar],
  );

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
    setDiscoverOpen(false);
    setCustomRecipe(recipe);
    setActiveObject({
      result: { cached: false, mode: "custom", planet },
      type: "planet",
    });
  }, []);

  const generateStar = useCallback(({ star }: CustomStar): void => {
    window.history.pushState({}, "", `?customStar=${encodeURIComponent(star.name)}`);
    setDiscoverOpen(false);
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

  const openDiscover = useCallback((): void => {
    setDiscoverOpen(true);
  }, []);

  const closeDiscover = useCallback((): void => setDiscoverOpen(false), []);

  const subject =
    activeObject && activeObject.type !== "missing"
      ? activeObject.type === "asteroid"
        ? activeObject.asteroid.name
        : activeObject.type === "black-hole"
          ? activeObject.blackHole.name
          : activeObject.type === "comet"
            ? activeObject.comet.name
            : activeObject.type === "mission"
              ? activeObject.mission.name
              : activeObject.type === "region"
                ? activeObject.region.name
                : activeObject.type === "planet"
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
      ) : activeObject.type === "black-hole" ? (
        <Suspense fallback={null}>
          <BlackHoleExperience
            key={activeObject.blackHole.id}
            blackHole={activeObject.blackHole}
            chromeHidden={chromeHidden}
            host={sceneHost}
            onHideChrome={() => setChromeHidden(true)}
            onOpenDiscover={openDiscover}
            travelPhase={travelPhase}
          />
        </Suspense>
      ) : activeObject.type === "asteroid" ? (
        <SmallBodyExperience
          key={activeObject.asteroid.id}
          asteroid={activeObject.asteroid}
          chromeHidden={chromeHidden}
          host={sceneHost}
          onHideChrome={() => setChromeHidden(true)}
          onOpenDiscover={openDiscover}
          onSelectAsteroid={selectAsteroid}
          onSelectStar={selectStar}
          travelPhase={travelPhase}
        />
      ) : activeObject.type === "comet" ? (
        <CometExperience
          key={activeObject.comet.id}
          chromeHidden={chromeHidden}
          comet={activeObject.comet}
          host={sceneHost}
          onHideChrome={() => setChromeHidden(true)}
          onOpenDiscover={openDiscover}
          onSelectPlanet={selectPlanet}
          onSelectStar={selectStar}
          travelPhase={travelPhase}
        />
      ) : activeObject.type === "region" ? (
        <Suspense fallback={null}>
          <RegionExperience
            key={activeObject.region.id}
            chromeHidden={chromeHidden}
            host={sceneHost}
            onHideChrome={() => setChromeHidden(true)}
            onOpenDiscover={openDiscover}
            onSelectStar={selectStar}
            region={activeObject.region}
            travelPhase={travelPhase}
          />
        </Suspense>
      ) : activeObject.type === "mission" ? (
        <Suspense fallback={null}>
          <MissionExperience
            key={activeObject.mission.id}
            chromeHidden={chromeHidden}
            host={sceneHost}
            mission={activeObject.mission}
            onHideChrome={() => setChromeHidden(true)}
            onOpenParent={openMissionParent}
            onOpenDiscover={openDiscover}
            travelPhase={travelPhase}
          />
        </Suspense>
      ) : activeObject.type === "planet" ? (
        <PlanetExperience
          key={activeObject.result.planet.id}
          chromeHidden={chromeHidden}
          host={sceneHost}
          result={activeObject.result}
          onGeneratePlanet={generatePlanet}
          onGenerateStar={generateStar}
          onHideChrome={() => setChromeHidden(true)}
          onOpenDiscover={openDiscover}
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
            onOpenDiscover={openDiscover}
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
            onOpenDiscover={openDiscover}
            travelPhase={travelPhase}
          />
        </Suspense>
      )}
      {discoverOpen && activeObject && activeObject.type !== "missing" ? (
        <Suspense fallback={null}>
          <DiscoverScreen
            initialForgeMode={activeObject.type === "star" ? "star" : "planet"}
            onClose={closeDiscover}
            onGeneratePlanet={generatePlanet}
            onGenerateStar={generateStar}
            onSelectAsteroid={selectAsteroid}
            onSelectBlackHole={selectBlackHole}
            onSelectComet={selectComet}
            onSelectMission={selectMission}
            onSelectPlanet={selectPlanet}
            onSelectRegion={selectRegion}
            onSelectStar={selectStar}
          />
        </Suspense>
      ) : null}
    </>
  );
};
