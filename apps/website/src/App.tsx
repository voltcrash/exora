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
import { featuredPlanet } from "./planet-profile.ts";
import { hasRenderer } from "./planet-utils.tsx";

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

  if (!activeObject) {
    return (
      <div className="loading-screen initial-loading" role="status">
        <div className="loading-orbit" aria-hidden="true">
          <span />
        </div>
        <p>CONTACTING OBSERVATORIES</p>
        <small>RESOLVING CELESTIAL OBJECT</small>
      </div>
    );
  }

  return (
    <>
      {activeObject.type === "planet" ? (
        <PlanetExperience
          key={activeObject.result.planet.id}
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
          <PlanetCatalog open onClose={() => setCatalogOpen(false)} onSelect={selectPlanet} />
        </Suspense>
      ) : null}
      {starCatalogOpen ? (
        <Suspense fallback={null}>
          <StarCatalog open onClose={() => setStarCatalogOpen(false)} onSelect={selectStar} />
        </Suspense>
      ) : null}
      {builderOpen ? (
        <Suspense fallback={null}>
          <WorldForge
            initialMode={activeObject.type}
            open
            onClose={() => setBuilderOpen(false)}
            onGeneratePlanet={generatePlanet}
            onGenerateStar={generateStar}
          />
        </Suspense>
      ) : null}
    </>
  );
};
