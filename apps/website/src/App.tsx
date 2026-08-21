import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomStar, CustomWorld, WorldRecipe } from "@exora/worldgen";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  loadPlanetByName,
  loadStarByName,
  type PlanetLoadResult,
  type StarLoadResult,
} from "./api-client.ts";
import { PlanetExperience } from "./components/PlanetExperience.tsx";
import { RecoveryScreen } from "./components/RecoveryScreen.tsx";
import { featuredPlanet } from "./planet-profile.ts";
import { hasRenderer } from "./planet-utils.tsx";
import { opensSearchShortcut } from "./search-shortcut.ts";
import { useSceneHost } from "./use-scene-host.ts";

const PlanetCatalog = lazy(() =>
  import("./components/PlanetCatalog.tsx").then((module) => ({ default: module.PlanetCatalog })),
);
const StarCatalog = lazy(() =>
  import("./components/StarCatalog.tsx").then((module) => ({ default: module.StarCatalog })),
);
const StarExperience = lazy(() =>
  import("./components/StarExperience.tsx").then((module) => ({ default: module.StarExperience })),
);
const WorldForge = lazy(() =>
  import("./components/CustomPlanetBuilder.tsx").then((module) => ({ default: module.WorldForge })),
);

type ActiveObject =
  | { result: PlanetLoadResult; type: "planet" }
  | { result: StarLoadResult; type: "star" };

const defaultPlanetObject = (): ActiveObject => ({
  result: { cached: true, mode: "fallback", planet: featuredPlanet },
  type: "planet",
});

const loadRequestedObject = async (): Promise<ActiveObject> => {
  const parameters = new URLSearchParams(window.location.search);
  const starName = parameters.get("star");
  if (starName) {
    const star = await loadStarByName(starName);
    if (star) return { result: star, type: "star" };
  }

  const name = parameters.get("planet");
  if (!name) return defaultPlanetObject();

  const requested = await loadPlanetByName(name);
  return requested && hasRenderer(requested.planet)
    ? { result: requested, type: "planet" }
    : defaultPlanetObject();
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
  const [builderOpen, setBuilderOpen] = useState(false);
  const [activeObject, setActiveObject] = useState<ActiveObject | null>(() => {
    const parameters = new URLSearchParams(window.location.search);
    return parameters.has("planet") || parameters.has("star") ? null : defaultPlanetObject();
  });
  const [customRecipe, setCustomRecipe] = useState<WorldRecipe | null>(null);
  const [systemHostName, setSystemHostName] = useState<string | null>(null);

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
  // it. Nothing it reads changes over the life of the page, so it is bound once.
  useEffect(() => {
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
  }, []);

  // Stable identities: the immersive console hands these to the Babylon scene, and a new
  // function on every render would tear the renderer down and rebuild it mid-session.
  const selectPlanet = useCallback((planet: ExoplanetProfile, cached: boolean): void => {
    window.history.pushState({}, "", `?planet=${encodeURIComponent(planet.name)}`);
    setCatalogOpen(false);
    setCustomRecipe(null);
    setActiveObject({ result: { cached, mode: "live", planet }, type: "planet" });
  }, []);

  const selectStar = useCallback((star: StarProfile, cached: boolean): void => {
    window.history.pushState({}, "", `?star=${encodeURIComponent(star.name)}`);
    setStarCatalogOpen(false);
    setCustomRecipe(null);
    setSystemHostName(null);
    setActiveObject({ result: { cached, mode: "live", star }, type: "star" });
  }, []);

  const selectHostStar = useCallback(async (hostStar: string): Promise<boolean> => {
    const result = await loadStarByName(hostStar);
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

  const subject = activeObject
    ? activeObject.type === "planet"
      ? activeObject.result.planet.name
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
      ) : activeObject.type === "planet" ? (
        <PlanetExperience
          key={activeObject.result.planet.id}
          host={sceneHost}
          result={activeObject.result}
          onGeneratePlanet={generatePlanet}
          onGenerateStar={generateStar}
          onOpenCatalog={() => setCatalogOpen(true)}
          onOpenBuilder={() => setBuilderOpen(true)}
          onOpenStars={() => setStarCatalogOpen(true)}
          onSelectHostStar={selectHostStar}
          onSelectPlanet={selectPlanet}
          onSelectStar={selectStar}
          recipeOverride={customRecipe}
        />
      ) : (
        <Suspense fallback={null}>
          <StarExperience
            key={activeObject.result.star.id}
            host={sceneHost}
            result={activeObject.result}
            systemHostName={systemHostName}
            onGeneratePlanet={generatePlanet}
            onGenerateStar={generateStar}
            onSelectPlanet={selectPlanet}
            onSelectStar={selectStar}
            onOpenPlanets={() => setCatalogOpen(true)}
            onOpenStars={() => setStarCatalogOpen(true)}
            onOpenBuilder={() => setBuilderOpen(true)}
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
      {builderOpen && activeObject ? (
        <Suspense fallback={null}>
          <WorldForge
            initialMode={activeObject.type}
            onClose={() => setBuilderOpen(false)}
            onGeneratePlanet={generatePlanet}
            onGenerateStar={generateStar}
          />
        </Suspense>
      ) : null}
    </>
  );
};
