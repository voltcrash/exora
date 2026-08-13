import type { ExoplanetProfile } from "@exora/contracts";
import type { CustomWorld, WorldRecipe } from "@exora/worldgen";
import { useCallback, useEffect, useState } from "react";
import { loadFeaturedPlanet, loadPlanetByName, type PlanetLoadResult } from "./api-client.ts";
import { PlanetCatalog } from "./components/PlanetCatalog.tsx";
import { CustomPlanetBuilder } from "./components/CustomPlanetBuilder.tsx";
import { PlanetExperience } from "./components/PlanetExperience.tsx";
import { featuredPlanet } from "./planet-profile.ts";
import { hasRenderer } from "./planet-utils.tsx";

const loadRequestedPlanet = async (): Promise<PlanetLoadResult> => {
  const name = new URLSearchParams(window.location.search).get("planet");
  const requested = name ? await loadPlanetByName(name) : null;
  return requested && hasRenderer(requested.planet)
    ? requested
    : loadFeaturedPlanet(featuredPlanet);
};

export const App = () => {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [result, setResult] = useState<PlanetLoadResult | null>(null);
  const [customRecipe, setCustomRecipe] = useState<WorldRecipe | null>(null);

  const loadFromLocation = useCallback(() => {
    setCustomRecipe(null);
    void loadRequestedPlanet().then(setResult);
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
    setResult({ cached, mode: "live", planet });
  };

  const generatePlanet = ({ planet, recipe }: CustomWorld): void => {
    window.history.pushState({}, "", `?custom=${encodeURIComponent(planet.name)}`);
    setBuilderOpen(false);
    setCustomRecipe(recipe);
    setResult({ cached: false, mode: "custom", planet });
  };

  if (!result) {
    return (
      <div className="loading-screen initial-loading" role="status">
        <div className="loading-orbit" aria-hidden="true">
          <span />
        </div>
        <p>CONTACTING NASA ARCHIVE</p>
        <small>RESOLVING CONFIRMED WORLD</small>
      </div>
    );
  }

  return (
    <>
      <PlanetExperience
        key={result.planet.id}
        result={result}
        onOpenCatalog={() => setCatalogOpen(true)}
        onOpenBuilder={() => setBuilderOpen(true)}
        recipeOverride={customRecipe}
      />
      <PlanetCatalog
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onSelect={selectPlanet}
      />
      <CustomPlanetBuilder
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        onGenerate={generatePlanet}
      />
    </>
  );
};
