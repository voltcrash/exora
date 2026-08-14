import type { ExoplanetProfile } from "@exora/contracts";
import { useEffect, useRef, useState } from "react";
import { discoverPlanets, searchPlanets } from "../api-client.ts";
import { formatNumber, hasRenderer, planetKindLabel } from "../planet-utils.tsx";

interface PlanetCatalogProps {
  onClose: () => void;
  onSelect: (planet: ExoplanetProfile, cached: boolean) => void;
  open: boolean;
}

type SearchState = "idle" | "loading" | "ready" | "error";

const categories = [
  { id: "earth-like", icon: "◉", label: "Earth-like candidates", note: "Familiar scale & climate" },
  { id: "lava-worlds", icon: "△", label: "Lava worlds", note: "Molten, ultra-hot terrain" },
  { id: "gas-giants", icon: "◒", label: "Gas giants", note: "Colossal cloud layers" },
  {
    id: "ocean-candidates",
    icon: "≈",
    label: "Ocean-world candidates",
    note: "Possible global seas",
  },
  { id: "frozen-worlds", icon: "✣", label: "Frozen worlds", note: "Cold, distant frontiers" },
  {
    id: "extreme-weather",
    icon: "ϟ",
    label: "Extreme weather",
    note: "Violent atmospheric systems",
  },
  {
    id: "potentially-habitable",
    icon: "⌾",
    label: "Potentially habitable",
    note: "Temperate rocky candidates",
  },
  {
    id: "recently-discovered",
    icon: "+",
    label: "Recently discovered",
    note: "The archive's newest worlds",
  },
] as const;

const collections = [
  {
    id: "most-earth-like",
    index: "01",
    label: "Most Earth-like",
    note: "Rocky worlds closest to Earth's scale and estimated temperature",
    tag: "12 DESTINATIONS",
  },
  {
    id: "nearest-rocky-worlds",
    index: "02",
    label: "Nearest rocky worlds",
    note: "The closest small planets in our galactic neighborhood",
    tag: "BY DISTANCE",
  },
  {
    id: "recently-confirmed",
    index: "03",
    label: "Recently confirmed",
    note: "The newest confirmed additions to the exoplanet archive",
    tag: "LATEST FINDS",
  },
  {
    id: "record-breakers",
    index: "04",
    label: "Record breakers",
    note: "The hottest and most massive worlds in the known catalog",
    tag: "EXTREME WORLDS",
  },
] as const;

export const PlanetCatalog = ({ onClose, onSelect, open }: PlanetCatalogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [planets, setPlanets] = useState<ExoplanetProfile[]>([]);
  const [cached, setCached] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [portalView, setPortalView] = useState<"collections" | "categories">("collections");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
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
    if (activeCategory) {
      const controller = new AbortController();
      setSearchState("loading");
      void discoverPlanets(activeCategory, { signal: controller.signal })
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
      return () => controller.abort();
    }
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
  }, [activeCategory, query]);

  const activeLabel = [...collections, ...categories].find(
    (category) => category.id === activeCategory,
  )?.label;

  const status =
    searchState === "idle"
      ? "Choose a discovery path, or search the archive by name."
      : searchState === "loading"
        ? query.trim()
          ? `Scanning NASA archive for “${query.trim()}”…`
          : `Opening ${activeLabel ?? "curated destinations"}…`
        : searchState === "error"
          ? "The archive signal is unavailable. Try again shortly."
          : `${planets.length} confirmed ${planets.length === 1 ? "world" : "worlds"} found${activeLabel ? ` in ${activeLabel}` : ""}${cached ? " · cached result" : ""}.`;

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
          <p>DISCOVERY PORTAL · NASA EXOPLANET ARCHIVE</p>
          <h2 id="catalog-title">Choose a world to discover</h2>
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
      <div className="discovery-intro">
        <span>{portalView === "collections" ? "CURATED JOURNEYS" : "EXPLORE BY PHENOMENON"}</span>
        <small>Large targets are designed for gaze, pointer, touch, or mouse</small>
      </div>
      <div className="discovery-tabs" role="tablist" aria-label="Planet discovery views">
        <button
          role="tab"
          type="button"
          aria-selected={portalView === "collections"}
          onClick={() => setPortalView("collections")}
        >
          Curated collections
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={portalView === "categories"}
          onClick={() => setPortalView("categories")}
        >
          World types
        </button>
      </div>
      {portalView === "collections" ? (
        <div className="collection-grid" aria-label="Curated planet collections">
          {collections.map((collection) => (
            <button
              key={collection.id}
              className={`collection-card${activeCategory === collection.id ? " active" : ""}`}
              type="button"
              aria-pressed={activeCategory === collection.id}
              onClick={() => {
                setQuery("");
                setActiveCategory(collection.id);
              }}
            >
              <span className="collection-index">{collection.index}</span>
              <span className="collection-copy">
                <small>{collection.tag}</small>
                <strong>{collection.label}</strong>
                <span>{collection.note}</span>
              </span>
              <span className="collection-launch" aria-hidden="true">
                EXPLORE ↗
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="discovery-grid" aria-label="Planet discovery categories">
          {categories.map((category) => (
            <button
              key={category.id}
              className={`discovery-card${activeCategory === category.id ? " active" : ""}`}
              type="button"
              aria-pressed={activeCategory === category.id}
              onClick={() => {
                setQuery("");
                setActiveCategory(category.id);
              }}
            >
              <span className="discovery-icon" aria-hidden="true">
                {category.icon}
              </span>
              <span>
                <strong>{category.label}</strong>
                <small>{category.note}</small>
              </span>
              <span className="discovery-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="discovery-divider">
        <span>OR SEARCH BY NAME</span>
      </div>
      <div className="catalog-search">
        <span className="search-reticle" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => {
            setActiveCategory(null);
            setQuery(event.target.value);
          }}
          placeholder="Search Kepler, WASP, TRAPPIST or any known planet"
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
        <span>Gas · ice · rocky worlds</span>
      </div>
      <ol className={`catalog-results${searchState === "idle" ? " is-idle" : ""}`}>
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
