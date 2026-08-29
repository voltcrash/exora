import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import {
  deriveWorldRecipe,
  generateCustomStar,
  generateCustomWorld,
  type CustomStar,
  type CustomWorld,
  type WorldRecipe,
} from "@exora/worldgen";
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
import type { BlackHoleProfile } from "./black-holes.ts";
import { togglesClearView } from "./clear-view-shortcut.ts";
import { togglesDiscoverShortcut } from "./discover-shortcut.ts";
import { TRAVEL_CROSS_MS, TRAVEL_REVEAL_MS, type TravelPhase } from "./travel-transition.ts";
import { useSceneHost } from "./use-scene-host.ts";
import type { SolarRegionProfile } from "./solar-regions.ts";
import sharedStyles from "./components/ExperienceShared.module.css";
import { bindStyles } from "./styles/bind-styles.ts";

const cx = bindStyles(sharedStyles);

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
type ActiveObject =
  | { blackHole: BlackHoleProfile; type: "black-hole" }
  | { recipe?: WorldRecipe; result: PlanetLoadResult; type: "planet" }
  | { result: StarLoadResult; type: "star" }
  | { result: SystemLoadResult; type: "system" }
  | { region: SolarRegionProfile; type: "region" }
  | {
      kind: "black hole" | "planet" | "region" | "star" | "system";
      name: string;
      detail?: string;
      type: "missing";
    };

const solarPlanetObject = async (
  planet: ExoplanetProfile,
  cached: boolean,
): Promise<ActiveObject> => {
  const { tuneSolarWorldRecipe } = await import("./solar-system.ts");
  return {
    recipe: tuneSolarWorldRecipe(planet, deriveWorldRecipe(planet)),
    result: { cached, mode: "solar", planet },
    type: "planet",
  };
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
  const regionName = parameters.get("region");
  if (regionName) {
    const { findSolarRegion } = await import("./solar-regions.ts");
    const region = findSolarRegion(regionName);
    return region
      ? { region, type: "region" }
      : { kind: "region", name: regionName, type: "missing" };
  }
  const starName = parameters.get("star");
  if (starName) {
    const { findSolarStar } = await import("./solar-system.ts");
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
  if (name) {
    const { findSolarWorld } = await import("./solar-system.ts");
    const localWorld = findSolarWorld(name);
    if (localWorld) {
      return solarPlanetObject(localWorld, true);
    }

    const requested = await loadPlanetByName(name);
    return requested && hasRenderer(requested.planet)
      ? { result: requested, type: "planet" }
      : { kind: "planet", name, type: "missing" };
  }

  const customPlanet = parameters.get("custom");
  if (customPlanet !== null) {
    const { parseCustomPlanetUrl } = await import("./custom-destination-url.ts");
    const customParameters = parseCustomPlanetUrl(customPlanet);
    if (!customParameters) {
      return {
        detail:
          "This custom-world link contains an invalid or incompatible World Forge recipe. Return to the featured world and generate a new link.",
        kind: "planet",
        name: "custom recipe",
        type: "missing",
      };
    }
    const custom = generateCustomWorld(customParameters);
    return {
      recipe: custom.recipe,
      result: { cached: false, mode: "custom", planet: custom.planet },
      type: "planet",
    };
  }

  const customStar = parameters.get("customStar");
  if (customStar !== null) {
    const { parseCustomStarUrl } = await import("./custom-destination-url.ts");
    const customParameters = parseCustomStarUrl(customStar);
    if (!customParameters) {
      return {
        detail:
          "This custom-star link contains an invalid or incompatible World Forge recipe. Return to the featured world and generate a new link.",
        kind: "star",
        name: "custom recipe",
        type: "missing",
      };
    }
    const custom = generateCustomStar(customParameters);
    return { result: { cached: false, mode: "custom", star: custom.star }, type: "star" };
  }

  return defaultPlanetObject();
};

export const App = () => {
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
      parameters.has("region") ||
      parameters.has("planet") ||
      parameters.has("star") ||
      parameters.has("system") ||
      parameters.has("custom") ||
      parameters.has("customStar")
      ? null
      : defaultPlanetObject();
  });
  const [systemHostName, setSystemHostName] = useState<string | null>(null);

  const [chromeHidden, setChromeHidden] = useState(false);

  const [travelPhase, setTravelPhase] = useState<TravelPhase>("idle");
  useEffect(() => sceneHost?.onTravelPhase(setTravelPhase), [sceneHost]);

  const overlayOpen = discoverOpen;
  useEffect(() => {
    if (!sceneHost || !overlayOpen || sceneHost.isInXr()) return;
    return sceneHost.suspendRendering();
  }, [overlayOpen, sceneHost]);

  const onMainScreen =
    !overlayOpen &&
    activeObject !== null &&
    activeObject.type !== "missing" &&
    (sceneHostStatus === "initializing" || sceneHostStatus === "ready");

  const loadFromLocation = useCallback(() => {
    setSystemHostName(null);
    void loadRequestedObject().then(setActiveObject);
  }, []);

  useEffect(() => {
    loadFromLocation();
    window.addEventListener("popstate", loadFromLocation);
    return () => window.removeEventListener("popstate", loadFromLocation);
  }, [loadFromLocation]);

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

      event.preventDefault();
      setChromeHidden((hidden) => !hidden);
    };

    document.addEventListener("keydown", toggleChrome);
    return () => document.removeEventListener("keydown", toggleChrome);
  }, [onMainScreen]);

  useEffect(() => {
    const canonical = canonicalUrlForSearch(window.location.search);
    document
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.setAttribute("href", canonical);
    document
      .querySelector<HTMLMetaElement>('meta[property="og:url"]')
      ?.setAttribute("content", canonical);
  }, [activeObject]);

  const selectPlanet = useCallback((planet: ExoplanetProfile, cached: boolean): void => {
    window.history.pushState({}, "", `?planet=${encodeURIComponent(planet.name)}`);
    setDiscoverOpen(false);
    if (planet.solarSystem) {
      void solarPlanetObject(planet, cached).then(setActiveObject);
      return;
    }
    setActiveObject({
      result: { cached, mode: "live", planet },
      type: "planet",
    });
  }, []);

  const selectStar = useCallback((star: StarProfile, cached: boolean): void => {
    window.history.pushState({}, "", `?star=${encodeURIComponent(star.name)}`);
    setDiscoverOpen(false);
    setSystemHostName(null);
    setActiveObject({
      result: { cached, mode: star.solarSystem ? "solar" : "live", star },
      type: "star",
    });
  }, []);

  const selectBlackHole = useCallback((blackHole: BlackHoleProfile): void => {
    window.history.pushState({}, "", `?blackHole=${encodeURIComponent(blackHole.name)}`);
    setDiscoverOpen(false);
    setSystemHostName(null);
    setActiveObject({ blackHole, type: "black-hole" });
  }, []);

  const selectRegion = useCallback((region: SolarRegionProfile): void => {
    window.history.pushState({}, "", `?region=${encodeURIComponent(region.name)}`);
    setDiscoverOpen(false);
    setSystemHostName(null);
    setActiveObject({ region, type: "region" });
  }, []);

  const selectSystem = useCallback(async (hostStar: string): Promise<boolean> => {
    const system = await reachSystem(hostStar);
    if (!system) return false;
    window.history.pushState({}, "", `?system=${encodeURIComponent(hostStar)}`);
    setSystemHostName(hostStar);
    setActiveObject({ result: system, type: "system" });
    return true;
  }, []);

  const selectHostStar = useCallback(async (hostStar: string): Promise<boolean> => {
    const result = await reachStar(hostStar);
    if (!result) return false;
    window.history.pushState({}, "", `?star=${encodeURIComponent(result.star.name)}`);
    setSystemHostName(hostStar);
    setActiveObject({ result, type: "star" });
    return true;
  }, []);

  const generatePlanet = useCallback(({ parameters, planet, recipe }: CustomWorld): void => {
    void import("./custom-destination-url.ts").then(({ customPlanetUrl }) => {
      window.history.pushState({}, "", customPlanetUrl(parameters));
      setDiscoverOpen(false);
      setActiveObject({
        recipe,
        result: { cached: false, mode: "custom", planet },
        type: "planet",
      });
    });
  }, []);

  const generateStar = useCallback(({ parameters, star }: CustomStar): void => {
    void import("./custom-destination-url.ts").then(({ customStarUrl }) => {
      window.history.pushState({}, "", customStarUrl(parameters));
      setDiscoverOpen(false);
      setActiveObject({
        result: { cached: false, mode: "custom", star },
        type: "star",
      });
    });
  }, []);

  const returnHome = useCallback((): void => {
    window.history.replaceState({}, "", "/");
    setSystemHostName(null);
    setActiveObject(defaultPlanetObject());
  }, []);

  const openDiscover = useCallback((): void => {
    setDiscoverOpen(true);
  }, []);

  const closeDiscover = useCallback((): void => setDiscoverOpen(false), []);
  const toggleChrome = useCallback((): void => setChromeHidden((hidden) => !hidden), []);

  const subject =
    activeObject && activeObject.type !== "missing"
      ? activeObject.type === "black-hole"
        ? activeObject.blackHole.name
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
      <div
        className={cx(`travel-veil ${travelPhase === "crossing" ? "crossing" : ""}`)}
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
        <div className={cx("loading-screen initial-loading")} role="status">
          <div className={cx("loading-orbit")} aria-hidden="true">
            <span />
          </div>
          <p>CONTACTING OBSERVATORIES</p>
          <small>RESOLVING CELESTIAL OBJECT</small>
        </div>
      ) : activeObject.type === "missing" ? (
        <RecoveryScreen
          action="RETURN TO FEATURED WORLD"
          detail={
            activeObject.detail ??
            `The ${activeObject.kind} “${activeObject.name}” could not be resolved from its archive or is not yet supported by Exora.`
          }
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
            onToggleChrome={toggleChrome}
            onOpenDiscover={openDiscover}
            travelPhase={travelPhase}
          />
        </Suspense>
      ) : activeObject.type === "region" ? (
        <Suspense fallback={null}>
          <RegionExperience
            key={activeObject.region.id}
            chromeHidden={chromeHidden}
            host={sceneHost}
            onToggleChrome={toggleChrome}
            onOpenDiscover={openDiscover}
            onSelectStar={selectStar}
            region={activeObject.region}
            travelPhase={travelPhase}
          />
        </Suspense>
      ) : activeObject.type === "planet" ? (
        <PlanetExperience
          key={activeObject.result.planet.id}
          chromeHidden={chromeHidden}
          host={sceneHost}
          result={activeObject.result}
          onToggleChrome={toggleChrome}
          onOpenDiscover={openDiscover}
          onSelectHostStar={selectHostStar}
          onSelectPlanet={selectPlanet}
          onSelectStar={selectStar}
          onSelectSystem={selectSystem}
          recipeOverride={activeObject.recipe ?? null}
          travelPhase={travelPhase}
        />
      ) : activeObject.type === "system" ? (
        <Suspense fallback={null}>
          <SystemExperience
            key={activeObject.result.hostStar}
            chromeHidden={chromeHidden}
            host={sceneHost}
            result={activeObject.result}
            onToggleChrome={toggleChrome}
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
            onToggleChrome={toggleChrome}
            onSelectPlanet={selectPlanet}
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
            onSelectBlackHole={selectBlackHole}
            onSelectPlanet={selectPlanet}
            onSelectRegion={selectRegion}
            onSelectStar={selectStar}
          />
        </Suspense>
      ) : null}
    </>
  );
};
