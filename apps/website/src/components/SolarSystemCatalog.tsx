import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { useEffect, useRef } from "react";
import { SOLAR_SYSTEM_CATALOG } from "../solar-system.ts";

interface SolarSystemCatalogProps {
  onClose: () => void;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
}

export const SolarSystemCatalog = ({
  onClose,
  onSelectPlanet,
  onSelectStar,
}: SolarSystemCatalogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="planet-catalog solar-system-catalog"
      aria-labelledby="solar-system-title"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="catalog-scroll-region">
        <div className="catalog-header">
          <div>
            <p>HOME COORDINATES · NASA/JPL SOLAR SYSTEM DYNAMICS</p>
            <h2 id="solar-system-title">It’s time to go home</h2>
          </div>
          <button
            className="catalog-close"
            type="button"
            aria-label="Close Solar System catalog"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="solar-system-hero">
          <span>THE SOLAR SYSTEM</span>
          <strong>Known worlds. Real surfaces. Our cosmic address.</strong>
          <small>Every body keeps its permanent JPL/NAIF identity.</small>
        </div>
        <ol className="solar-body-grid">
          {SOLAR_SYSTEM_CATALOG.map((entry) => {
            const identity = entry.profile.solarSystem;
            return (
              <li key={entry.profile.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (entry.type === "star") onSelectStar(entry.profile, true);
                    else onSelectPlanet(entry.profile, true);
                  }}
                >
                  <span
                    className={`solar-body-portrait solar-${entry.profile.name.toLocaleLowerCase().replaceAll(" ", "-")}`}
                    aria-hidden="true"
                  />
                  <span className="solar-body-copy">
                    <small>{identity?.bodyType.toUpperCase()}</small>
                    <strong>{entry.profile.name}</strong>
                    <span>{identity?.summary}</span>
                  </span>
                  <span className="solar-body-meta">
                    <small>NAIF {identity?.naifId}</small>
                    <strong>TRAVEL ↗</strong>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </dialog>
  );
};
