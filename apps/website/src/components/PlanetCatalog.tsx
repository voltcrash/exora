import type { ExoplanetProfile } from "@exora/contracts";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  discoverPlanets,
  discoverRandomPlanet,
  loadPlanetFilterPool,
  searchPlanets,
} from "../api-client.ts";
import { formatNumber, hasRenderer, planetKindLabel } from "../planet-utils.tsx";
import { useTabList } from "../use-tab-list.ts";
import {
  DEFAULT_PHYSICAL_PLANET_FILTERS,
  filterPlanetsByPhysicalControls,
  planetNotableTrait,
  suggestPlanetName,
  type PhysicalPlanetFilters,
} from "../search-discovery.ts";
import { PlanetCatalogVisual } from "./CatalogVisual.tsx";

interface PlanetCatalogProps {
  onClose: () => void;
  onSelect: (planet: ExoplanetProfile, cached: boolean) => void;
}

type SearchState = "idle" | "loading" | "ready" | "error";
type SurpriseState = "idle" | "loading" | "error";
type PortalView = "collections" | "categories" | "filters";
type PhysicalAxis = Exclude<keyof PhysicalPlanetFilters, "habitableZone" | "wellMeasured">;

/** Tab order for the discovery views. Module scope so the tab list keeps a stable identity. */
const PORTAL_VIEWS: readonly PortalView[] = ["collections", "categories", "filters"];

const physicalAxes: readonly {
  high: string;
  key: PhysicalAxis;
  low: string;
  name: string;
}[] = [
  { key: "composition", name: "Composition", low: "Rocky", high: "Gaseous" },
  { key: "temperature", name: "Temperature", low: "Cold", high: "Hot" },
  { key: "scale", name: "World scale", low: "Earth-size", high: "Giant" },
  { key: "distance", name: "System range", low: "Nearby", high: "Distant" },
  { key: "weather", name: "Atmosphere", low: "Calm", high: "Extreme" },
] as const;

const axisPositionLabel = (value: number, low: string, high: string): string =>
  value < 34 ? low : value > 66 ? high : "Broad field";

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

/**
 * One world in the result list.
 *
 * Its own component, and memoised, because of what the observatory sliders do: every input event
 * re-runs the filter over the whole sampled field, and what comes back is mostly the same worlds
 * in the same order. Rebuilding two dozen rows — each a layered CSS planet, a handful of formatted
 * numbers and a dozen elements — for a result that did not change was the whole cost of dragging
 * a slider. Identity-stable planets mean React can now skip every row the move did not disturb.
 */
const PlanetResult = memo(
  ({
    cached,
    onSelect,
    planet,
  }: {
    cached: boolean;
    onSelect: (planet: ExoplanetProfile, cached: boolean) => void;
    planet: ExoplanetProfile;
  }) => {
    const supported = hasRenderer(planet);
    const temperature = planet.observation.equilibriumTemperatureKelvin;

    return (
      <li>
        <button
          className="catalog-result"
          type="button"
          disabled={!supported}
          onClick={() => onSelect(planet, cached)}
        >
          <span className="result-preview">
            <PlanetCatalogVisual planet={planet} />
          </span>
          <span className="result-marker" aria-hidden="true" />
          <span className="result-identity">
            <strong>{planet.name}</strong>
            <small>
              {planet.hostStar} · {planet.observation.discoveryMethod}
            </small>
            <span className="result-trait">{planetNotableTrait(planet)}</span>
          </span>
          <span className="result-metrics">
            <small>{planetKindLabel(planet)}</small>
            <strong>
              {formatNumber(planet.observation.distanceParsecs, 1)} PC ·{" "}
              {temperature === null ? "TEMP UNKNOWN" : `${formatNumber(temperature, 0)} K`}
            </strong>
          </span>
          <span className="result-state">{supported ? "EXPLORE" : "RENDERER PENDING"}</span>
        </button>
      </li>
    );
  },
);

export const PlanetCatalog = ({ onClose, onSelect }: PlanetCatalogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const surpriseControllerRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [planets, setPlanets] = useState<ExoplanetProfile[]>([]);
  const [cached, setCached] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [portalView, setPortalView] = useState<PortalView>("collections");
  const [resultView, setResultView] = useState<"gallery" | "list">("gallery");
  const [surpriseState, setSurpriseState] = useState<SurpriseState>("idle");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [physicalFilters, setPhysicalFilters] = useState<PhysicalPlanetFilters>(
    DEFAULT_PHYSICAL_PLANET_FILTERS,
  );

  // The catalog is mounted only for as long as it is open, so there is no closed-but-mounted
  // state to synchronise: it opens with the component and closes when the page takes it away.
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();

    return () => {
      surpriseControllerRef.current?.abort();
      dialog?.close();
    };
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (portalView === "filters") {
      setSuggestion(null);
      const controller = new AbortController();
      setSearchState("loading");
      void loadPlanetFilterPool({ signal: controller.signal })
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
    if (activeCategory) {
      setSuggestion(null);
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
    if (normalizedQuery.length < 1) {
      setPlanets([]);
      setSuggestion(null);
      setSearchState("idle");
      return;
    }

    const controller = new AbortController();
    setSearchState("loading");
    const delay = window.setTimeout(
      () => {
        void (async () => {
          const initialResult = await searchPlanets(normalizedQuery, { signal: controller.signal });
          const correction = suggestPlanetName(normalizedQuery);
          const result =
            correction && initialResult.planets.length === 0
              ? await searchPlanets(correction, { signal: controller.signal })
              : initialResult;
          if (controller.signal.aborted) return;
          setSuggestion(correction && result.planets.length > 0 ? correction : null);
          setPlanets(result.planets);
          setCached(result.cached);
          setSearchState("ready");
        })().catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.error(error);
          setPlanets([]);
          setSuggestion(null);
          setSearchState("error");
        });
      },
      normalizedQuery.length === 1 ? 180 : 280,
    );

    return () => {
      window.clearTimeout(delay);
      controller.abort();
    };
  }, [activeCategory, portalView, query]);

  // The sliders and the list they drive move at different speeds on purpose. A control has to
  // track the pointer to feel connected to it, but re-sampling the field is a whole list rebuild
  // and there is no value in doing that at pointer rate — a reader reads the result once the
  // slider stops. Deferring the field lets React paint the thumb immediately and abandon any
  // list pass the next input event has already made obsolete.
  const settledFilters = useDeferredValue(physicalFilters);
  const visiblePlanets = useMemo(
    () =>
      portalView === "filters" ? filterPlanetsByPhysicalControls(planets, settledFilters) : planets,
    [planets, portalView, settledFilters],
  );

  // The observatory controls read the whole sampled field rather than one collection, so opening
  // that view clears the category and query the other two views leave behind.
  const selectPortalView = useCallback((view: PortalView): void => {
    if (view === "filters") {
      setActiveCategory(null);
      setQuery("");
    }
    setPortalView(view);
  }, []);

  const tabs = useTabList({
    label: "Planet discovery views",
    list: "planet-discovery",
    onSelect: selectPortalView,
    value: portalView,
    values: PORTAL_VIEWS,
  });

  const activeLabel = [...collections, ...categories].find(
    (category) => category.id === activeCategory,
  )?.label;

  const takeMeSomewhere = (): void => {
    surpriseControllerRef.current?.abort();
    const controller = new AbortController();
    surpriseControllerRef.current = controller;
    setSurpriseState("loading");
    void discoverRandomPlanet({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        onSelect(result.planet, result.cached);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setSurpriseState("error");
      });
  };

  const status =
    searchState === "idle"
      ? "Choose a discovery path, or search the archive by name."
      : searchState === "loading"
        ? portalView === "filters"
          ? "Calibrating the physical planet field…"
          : query.trim()
            ? `Scanning NASA archive for “${query.trim()}”…`
            : `Opening ${activeLabel ?? "curated destinations"}…`
        : searchState === "error"
          ? "The archive signal is unavailable. Try again shortly."
          : `${visiblePlanets.length} confirmed ${visiblePlanets.length === 1 ? "world" : "worlds"} visible${portalView === "filters" ? ` from ${planets.length} sampled systems` : suggestion ? ` for suggested signal ${suggestion}` : activeLabel ? ` in ${activeLabel}` : ""}${cached ? " · cached result" : ""}.`;

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
      <div className="catalog-scroll-region">
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
        <button
          className="surprise-journey"
          type="button"
          disabled={surpriseState === "loading"}
          onClick={takeMeSomewhere}
        >
          <span className="surprise-symbol" aria-hidden="true">
            ✦
          </span>
          <span className="surprise-copy">
            <small>TAKE ME SOMEWHERE</small>
            <strong>
              {surpriseState === "loading"
                ? "Plotting a surprise course…"
                : surpriseState === "error"
                  ? "Signal lost — try another jump"
                  : "Jump to a random confirmed world"}
            </strong>
          </span>
          <span className="surprise-action">
            {surpriseState === "loading" ? "SCANNING" : "SURPRISE ME"}{" "}
            <span aria-hidden="true">↗</span>
          </span>
        </button>
        <div className="discovery-intro">
          <span>
            {portalView === "collections"
              ? "CURATED JOURNEYS"
              : portalView === "categories"
                ? "EXPLORE BY PHENOMENON"
                : "HOLOGRAPHIC OBSERVATORY CONSOLE"}
          </span>
          <small>Large targets are designed for gaze, pointer, touch, or mouse</small>
        </div>
        <div className="discovery-tabs" {...tabs.tabListProps}>
          <button {...tabs.tabProps("collections")} onClick={() => selectPortalView("collections")}>
            Curated collections
          </button>
          <button {...tabs.tabProps("categories")} onClick={() => selectPortalView("categories")}>
            World types
          </button>
          <button {...tabs.tabProps("filters")} onClick={() => selectPortalView("filters")}>
            Observatory controls
          </button>
        </div>
        {portalView === "collections" ? (
          <div className="collection-grid" {...tabs.panelProps("collections")}>
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
        ) : portalView === "categories" ? (
          <div className="discovery-grid" {...tabs.panelProps("categories")}>
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
        ) : (
          <section className="physical-console" {...tabs.panelProps("filters")}>
            <div className="physical-console-heading">
              <span>
                <small>LIVE PLANET FIELD</small>
                <strong>Shape the observatory signal</strong>
              </span>
              <button
                type="button"
                onClick={() => setPhysicalFilters(DEFAULT_PHYSICAL_PLANET_FILTERS)}
              >
                RESET CONSOLE
              </button>
            </div>
            <div className="physical-axis-grid">
              {physicalAxes.map((axis) => {
                const value = physicalFilters[axis.key];
                return (
                  <label key={axis.key} className="physical-axis">
                    <span>
                      <strong>{axis.name}</strong>
                      <small aria-live="polite">
                        {axisPositionLabel(value, axis.low, axis.high)}
                      </small>
                    </span>
                    <span className="physical-axis-labels" aria-hidden="true">
                      <small>{axis.low}</small>
                      <small>{axis.high}</small>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={value}
                      aria-label={`${axis.name}: ${axisPositionLabel(value, axis.low, axis.high)}`}
                      onChange={(event) =>
                        setPhysicalFilters((current) => ({
                          ...current,
                          [axis.key]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                );
              })}
            </div>
            <div className="physical-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={physicalFilters.habitableZone}
                  onChange={(event) =>
                    setPhysicalFilters((current) => ({
                      ...current,
                      habitableZone: event.target.checked,
                    }))
                  }
                />
                <span aria-hidden="true" />
                <strong>Habitable-zone candidates</strong>
                <small>Rocky · 180–330 K</small>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={physicalFilters.wellMeasured}
                  onChange={(event) =>
                    setPhysicalFilters((current) => ({
                      ...current,
                      wellMeasured: event.target.checked,
                    }))
                  }
                />
                <span aria-hidden="true" />
                <strong>Confirmed data completeness</strong>
                <small>6+ observed fields</small>
              </label>
            </div>
          </section>
        )}
        <div className="discovery-divider">
          <span>{portalView === "filters" ? "VISIBLE PLANET FIELD" : "OR SEARCH BY NAME"}</span>
        </div>
        {portalView !== "filters" ? (
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
              placeholder="Type a name or catalog ID — misspellings are okay"
              autoComplete="off"
              minLength={1}
              aria-autocomplete="list"
              aria-controls="planet-search-results"
              aria-describedby="catalog-status"
            />
            <span className="search-key">ESC</span>
          </div>
        ) : null}
        <div className="catalog-meta">
          <p id="catalog-status" role="status">
            {status}
          </p>
          <div className="catalog-view-toggle" role="group" aria-label="Planet result layout">
            <button
              type="button"
              aria-pressed={resultView === "gallery"}
              onClick={() => setResultView("gallery")}
            >
              ▦ Gallery
            </button>
            <button
              type="button"
              aria-pressed={resultView === "list"}
              onClick={() => setResultView("list")}
            >
              ☰ List
            </button>
          </div>
        </div>
        {suggestion && (
          <button
            className="did-you-mean"
            type="button"
            onClick={() => {
              setSuggestion(null);
              setQuery(suggestion);
            }}
          >
            <span>DID YOU MEAN</span>
            <strong>{suggestion}</strong>
            <span aria-hidden="true">↗</span>
          </button>
        )}
        <ol
          id="planet-search-results"
          className={`catalog-results ${resultView}-view${searchState === "idle" ? " is-idle" : ""}`}
        >
          {searchState === "loading" && (
            <li className="catalog-loading">
              <span /> Resolving confirmed worlds
            </li>
          )}
          {searchState === "error" && (
            <li className="catalog-empty">NASA search could not be completed.</li>
          )}
          {searchState === "ready" && visiblePlanets.length === 0 && (
            <li className="catalog-empty">
              {portalView === "filters"
                ? "No sampled worlds match this console configuration. Widen one or more controls."
                : "No confirmed planets matched this signal or its nearest aliases."}
            </li>
          )}
          {searchState === "ready" &&
            visiblePlanets.map((planet) => (
              <PlanetResult key={planet.id} cached={cached} onSelect={onSelect} planet={planet} />
            ))}
        </ol>
      </div>
    </dialog>
  );
};
