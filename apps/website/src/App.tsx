import type { ExoplanetProfile } from "@exora/contracts";
import { useCallback, useEffect, useState } from "react";
import { loadFeaturedPlanet, loadPlanetByName, type PlanetLoadResult } from "./api-client.ts";
import { PlanetCatalog } from "./components/PlanetCatalog.tsx";
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
  const [result, setResult] = useState<PlanetLoadResult | null>(null);

  const loadFromLocation = useCallback(() => {
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
    setResult({ cached, mode: "live", planet });
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
      />
      <PlanetCatalog
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onSelect={selectPlanet}
      />
    </>
  );
};
