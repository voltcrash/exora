import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomStar, CustomWorld, WorldRecipe } from "@exora/worldgen";
import { useCallback, useEffect, useState } from "react";
import {
  loadFeaturedPlanet,
  loadPlanetByName,
  loadStarByName,
  type PlanetLoadResult,
  type StarLoadResult,
} from "./api-client.ts";
import { PlanetCatalog } from "./components/PlanetCatalog.tsx";
import { WorldForge } from "./components/CustomPlanetBuilder.tsx";
import { PlanetExperience } from "./components/PlanetExperience.tsx";
import { StarCatalog } from "./components/StarCatalog.tsx";
import { StarExperience } from "./components/StarExperience.tsx";
import { featuredPlanet } from "./planet-profile.ts";
import { hasRenderer } from "./planet-utils.tsx";

type ActiveObject =
  | { result: PlanetLoadResult; type: "planet" }
  | { result: StarLoadResult; type: "star" };

const loadRequestedObject = async (): Promise<ActiveObject> => {
  const parameters = new URLSearchParams(window.location.search);
  const starName = parameters.get("star");
  if (starName) {
    const star = await loadStarByName(starName);
    if (star) return { result: star, type: "star" };
  }

  const name = parameters.get("planet");
  const requested = name ? await loadPlanetByName(name) : null;
  const result =
    requested && hasRenderer(requested.planet)
      ? requested
      : await loadFeaturedPlanet(featuredPlanet);
  return { result, type: "planet" };
};

export const App = () => {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [starCatalogOpen, setStarCatalogOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [activeObject, setActiveObject] = useState<ActiveObject | null>(null);
  const [customRecipe, setCustomRecipe] = useState<WorldRecipe | null>(null);

  const loadFromLocation = useCallback(() => {
    setCustomRecipe(null);
    void loadRequestedObject().then(setActiveObject);
  }, []);

  useEffect(() => {
    loadFromLocation();
    window.addEventListener("popstate", loadFromLocation);
    return () => window.removeEventListener("popstate", loadFromLocation);
  }, [loadFromLocation]);

  const selectPlanet = (planet: ExoplanetProfile, cached: boolean): void => {
    window.history.pushState({}, "", `?planet=${encodeURIComponent(planet.name)}`);
    setCatalogOpen(false);
    setCustomRecipe(null);
    setActiveObject({ result: { cached, mode: "live", planet }, type: "planet" });
  };

  const selectStar = (star: StarProfile, cached: boolean): void => {
    window.history.pushState({}, "", `?star=${encodeURIComponent(star.name)}`);
    setStarCatalogOpen(false);
    setCustomRecipe(null);
    setActiveObject({ result: { cached, mode: "live", star }, type: "star" });
  };

  const generatePlanet = ({ planet, recipe }: CustomWorld): void => {
    window.history.pushState({}, "", `?custom=${encodeURIComponent(planet.name)}`);
    setBuilderOpen(false);
    setCustomRecipe(recipe);
    setActiveObject({
      result: { cached: false, mode: "custom", planet },
      type: "planet",
    });
  };

  const generateStar = ({ star }: CustomStar): void => {
    window.history.pushState({}, "", `?customStar=${encodeURIComponent(star.name)}`);
    setBuilderOpen(false);
    setCustomRecipe(null);
    setActiveObject({
      result: { cached: false, mode: "custom", star },
      type: "star",
    });
  };

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
          onOpenCatalog={() => setCatalogOpen(true)}
          onOpenBuilder={() => setBuilderOpen(true)}
          onOpenStars={() => setStarCatalogOpen(true)}
          recipeOverride={customRecipe}
        />
      ) : (
        <StarExperience
          key={activeObject.result.star.id}
          result={activeObject.result}
          onOpenPlanets={() => setCatalogOpen(true)}
          onOpenStars={() => setStarCatalogOpen(true)}
          onOpenBuilder={() => setBuilderOpen(true)}
        />
      )}
      <PlanetCatalog
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onSelect={selectPlanet}
      />
      <StarCatalog
        open={starCatalogOpen}
        onClose={() => setStarCatalogOpen(false)}
        onSelect={selectStar}
      />
      <WorldForge
        initialMode={activeObject.type}
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        onGeneratePlanet={generatePlanet}
        onGenerateStar={generateStar}
      />
    </>
  );
};
