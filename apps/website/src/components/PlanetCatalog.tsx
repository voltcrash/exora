import type { ExoplanetProfile } from "@exora/contracts";
import { useEffect, useRef, useState } from "react";
import { searchPlanets } from "../api-client.ts";
import { formatNumber, hasRenderer, planetKindLabel } from "../planet-utils.tsx";

interface PlanetCatalogProps {
  onClose: () => void;
  onSelect: (planet: ExoplanetProfile, cached: boolean) => void;
  open: boolean;
}

type SearchState = "idle" | "loading" | "ready" | "error";

export const PlanetCatalog = ({ onClose, onSelect, open }: PlanetCatalogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [planets, setPlanets] = useState<ExoplanetProfile[]>([]);
  const [cached, setCached] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>("idle");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const openWithShortcut = (event: KeyboardEvent): void => {
      if (event.key === "/" && !open) {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>("#open-catalog")?.click();
      }
    };
    document.addEventListener("keydown", openWithShortcut);
    return () => document.removeEventListener("keydown", openWithShortcut);
  }, [open]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setPlanets([]);
      setSearchState("idle");
      return;
    }

    const controller = new AbortController();
    setSearchState("loading");
    const delay = window.setTimeout(() => {
      void searchPlanets(normalizedQuery, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          setPlanets(result.planets);
          setCached(result.cached);
          setSearchState("ready");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.error(error);
          setPlanets([]);
          setSearchState("error");
        });
    }, 320);

    return () => {
      window.clearTimeout(delay);
      controller.abort();
    };
  }, [query]);

  const status =
    searchState === "idle"
      ? "Enter at least two characters to scan the archive."
      : searchState === "loading"
        ? `Scanning NASA archive for “${query.trim()}”…`
        : searchState === "error"
          ? "The archive signal is unavailable. Try again shortly."
          : `${planets.length} confirmed ${planets.length === 1 ? "world" : "worlds"} found${cached ? " · cached result" : ""}.`;

  return (
    <dialog
      ref={dialogRef}
      id="planet-catalog"
      className="planet-catalog"
      aria-labelledby="catalog-title"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="catalog-header">
        <div>
          <p>NASA EXOPLANET ARCHIVE</p>
          <h2 id="catalog-title">Choose another world</h2>
        </div>
        <button
          className="catalog-close"
          type="button"
          aria-label="Close planet catalog"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="catalog-search">
        <span className="search-reticle" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by planet name — try WASP, Kepler, or HD 209458"
          autoComplete="off"
          minLength={2}
          aria-describedby="catalog-status"
        />
        <span className="search-key">ESC</span>
      </div>
      <div className="catalog-meta">
        <p id="catalog-status" role="status">
          {status}
        </p>
        <span>Gas, ice, and rocky worlds available · unclassified worlds pending</span>
      </div>
      <ol className="catalog-results">
        {searchState === "loading" && (
          <li className="catalog-loading">
            <span /> Resolving confirmed worlds
          </li>
        )}
        {searchState === "error" && (
          <li className="catalog-empty">NASA search could not be completed.</li>
        )}
        {searchState === "ready" && planets.length === 0 && (
          <li className="catalog-empty">No confirmed planets matched this signal.</li>
        )}
        {searchState === "ready" &&
          planets.map((planet) => {
            const supported = hasRenderer(planet);
            const temperature = planet.observation.equilibriumTemperatureKelvin;
            return (
              <li key={planet.id}>
                <button
                  className="catalog-result"
                  type="button"
                  disabled={!supported}
                  onClick={() => onSelect(planet, cached)}
                >
                  <span className="result-marker" aria-hidden="true" />
                  <span className="result-identity">
                    <strong>{planet.name}</strong>
                    <small>
                      {planet.hostStar} · {planet.observation.discoveryMethod}
                    </small>
                  </span>
                  <span className="result-metrics">
                    <small>{planetKindLabel(planet)}</small>
                    <strong>
                      {temperature === null ? "TEMP UNKNOWN" : `${formatNumber(temperature, 0)} K`}
                    </strong>
                  </span>
                  <span className="result-state">{supported ? "EXPLORE" : "RENDERER PENDING"}</span>
                </button>
              </li>
            );
          })}
      </ol>
    </dialog>
  );
};
