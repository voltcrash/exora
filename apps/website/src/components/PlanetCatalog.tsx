import type { ExoplanetProfile } from "@exora/contracts";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  discoverPlanets,
  discoverRandomPlanet,
  loadPlanetFilterPool,
  preloadPlanetCatalog,
  searchPlanets,
} from "../api-client.ts";
import { formatNumber, hasRenderer, planetKindLabel } from "../planet-utils.tsx";
import {
  DEFAULT_PHYSICAL_PLANET_FILTERS,
  filterPlanetsByPhysicalControls,
  suggestPlanetName,
  type PhysicalPlanetFilters,
} from "../search-discovery.ts";
import { appendUniqueById } from "../catalog-pagination.ts";
import { useInfiniteScroll } from "../use-infinite-scroll.ts";
import { PlanetCatalogVisual } from "./CatalogVisual.tsx";
import {
  CatalogSearch,
  ChipRail,
  DidYouMean,
  ResultCard,
  ResultList,
  ResultState,
  ResultToolbar,
  type ResultView,
} from "./catalog/CatalogParts.tsx";
import catalogStyles from "./catalog/catalog.module.css";
import { Button } from "./ui/Button.tsx";
import styles from "./PlanetCatalog.module.css";

interface PlanetCatalogProps {
  onSelect: (planet: ExoplanetProfile, cached: boolean) => void;
}

type SearchState = "idle" | "loading" | "ready" | "error";
type SurpriseState = "idle" | "loading" | "error";
type PhysicalAxis = Exclude<keyof PhysicalPlanetFilters, "habitableZone" | "wellMeasured">;

const physicalAxes: readonly {
  high: string;
  key: PhysicalAxis;
  low: string;
  name: string;
}[] = [
  { key: "composition", name: "Composition", low: "Rocky", high: "Gaseous" },
  { key: "temperature", name: "Temperature", low: "Cold", high: "Hot" },
  { key: "scale", name: "Size", low: "Earth-size", high: "Giant" },
  { key: "distance", name: "Distance from us", low: "Nearby", high: "Distant" },
  { key: "weather", name: "Atmosphere", low: "Calm", high: "Extreme" },
] as const;

const axisPositionLabel = (value: number, low: string, high: string): string =>
  value < 34 ? low : value > 66 ? high : "Anything";

const collections = [
  { id: "most-earth-like", label: "Most Earth-like" },
  { id: "nearest-rocky-worlds", label: "Nearest rocky worlds" },
  { id: "recently-confirmed", label: "Recently confirmed" },
  { id: "record-breakers", label: "Record breakers" },
] as const;

const categories = [
  { id: "earth-like", label: "Earth-like" },
  { id: "potentially-habitable", label: "Potentially habitable" },
  { id: "ocean-candidates", label: "Ocean worlds" },
  { id: "lava-worlds", label: "Lava worlds" },
  { id: "frozen-worlds", label: "Frozen worlds" },
  { id: "gas-giants", label: "Gas giants" },
  { id: "extreme-weather", label: "Extreme weather" },
  { id: "recently-discovered", label: "Recently discovered" },
] as const;

const PlanetResult = ({
  cached,
  onSelect,
  planet,
}: {
  cached: boolean;
  onSelect: (planet: ExoplanetProfile, cached: boolean) => void;
  planet: ExoplanetProfile;
}) => {
  const temperature = planet.observation.equilibriumTemperatureKelvin;
  return (
    <ResultCard
      disabled={!hasRenderer(planet)}
      facts={[
        planetKindLabel(planet),
        `${formatNumber(planet.observation.distanceParsecs, 1)} pc`,
        temperature === null ? "Temperature unknown" : `${formatNumber(temperature, 0)} K`,
      ]}
      {...(hasRenderer(planet) ? {} : { notice: "Exora cannot draw this world yet" })}
      onSelect={() => onSelect(planet, cached)}
      subtitle={planet.observation.discoveryMethod}
      title={planet.name}
      visual={<PlanetCatalogVisual planet={planet} />}
    />
  );
};

export const PlanetCatalog = ({ onSelect }: PlanetCatalogProps) => {
  const surpriseControllerRef = useRef<AbortController | null>(null);
  const pageControllerRef = useRef<AbortController | null>(null);
  const [retry, setRetry] = useState(0);
  const [pageError, setPageError] = useState(false);
  const [query, setQuery] = useState("");
  const [planets, setPlanets] = useState<ExoplanetProfile[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cached, setCached] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>("loading");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [resultView, setResultView] = useState<ResultView>("gallery");
  const [surpriseState, setSurpriseState] = useState<SurpriseState>("idle");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [physicalFilters, setPhysicalFilters] = useState<PhysicalPlanetFilters>(
    DEFAULT_PHYSICAL_PLANET_FILTERS,
  );

  useEffect(() => {
    void preloadPlanetCatalog();
    return () => {
      surpriseControllerRef.current?.abort();
      pageControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    pageControllerRef.current?.abort();
    pageControllerRef.current = null;
    setLoadingMore(false);
    setPageError(false);
    setSuggestion(null);
    setNextCursor(null);

    const normalizedQuery = query.trim();
    if (activeCategory && !filtersOpen) {
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
      setSuggestion(null);
      const controller = new AbortController();
      setSearchState("loading");
      void loadPlanetFilterPool({ signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          setPlanets(result.planets);
          setNextCursor(result.nextCursor);
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
  }, [activeCategory, filtersOpen, query, retry]);

  const loadMore = useCallback((): void => {
    if (!nextCursor || pageControllerRef.current) return;

    const controller = new AbortController();
    pageControllerRef.current = controller;
    setLoadingMore(true);
    setPageError(false);
    void loadPlanetFilterPool({ cursor: nextCursor, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setPlanets((current) => appendUniqueById(current, result.planets));
        setNextCursor(result.nextCursor);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setPageError(true);
      })
      .finally(() => {
        if (pageControllerRef.current !== controller) return;
        pageControllerRef.current = null;
        setLoadingMore(false);
      });
  }, [nextCursor]);

  const sentinelRef = useInfiniteScroll<HTMLLIElement>({
    enabled: searchState === "ready" && nextCursor !== null && !loadingMore && !pageError,
    onLoadMore: loadMore,
  });

  const settledFilters = useDeferredValue(physicalFilters);
  const visiblePlanets = useMemo(
    () => (filtersOpen ? filterPlanetsByPhysicalControls(planets, settledFilters) : planets),
    [filtersOpen, planets, settledFilters],
  );

  const chooseCategory = (category: string | null): void => {
    setQuery("");
    setFiltersOpen(false);
    setActiveCategory(category);
  };

  const toggleFilters = (): void => {
    setActiveCategory(null);
    setQuery("");
    setFiltersOpen((open) => !open);
  };

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
        setSurpriseState("idle");
        onSelect(result.planet, result.cached);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setSurpriseState("error");
      });
  };

  const trimmed = query.trim();
  const status =
    searchState === "loading"
      ? trimmed
        ? `Searching the NASA Exoplanet Archive for “${trimmed}”…`
        : filtersOpen
          ? "Gathering worlds to filter…"
          : activeLabel
            ? `Opening ${activeLabel.toLowerCase()}…`
            : "Loading the catalog…"
      : searchState === "error"
        ? "The NASA Exoplanet Archive did not answer. Try again in a moment."
        : trimmed
          ? `${String(visiblePlanets.length)} worlds match “${trimmed}”`
          : filtersOpen
            ? `${String(visiblePlanets.length)} worlds fit these filters`
            : activeLabel
              ? `${String(visiblePlanets.length)} worlds · ${activeLabel}`
              : "Every confirmed world, A to Z";

  return (
    <section
      id="planet-catalog"
      className={catalogStyles["catalog"]}
      data-testid="planet-catalog"
      aria-label="Exoplanet catalog"
    >
      <CatalogSearch
        describedBy="catalog-status"
        label="Search confirmed planets"
        onChange={(value) => {
          setActiveCategory(null);
          setFiltersOpen(false);
          setQuery(value);
        }}
        onRandom={takeMeSomewhere}
        placeholder="Search planets"
        randomBusy={surpriseState === "loading"}
        randomError={surpriseState === "error"}
        randomLabel="Random world"
        resultsId="planet-search-results"
        value={query}
      />

      <ChipRail
        active={filtersOpen ? null : activeCategory}
        allLabel="All worlds"
        groups={[
          { chips: collections, label: "Collections" },
          { chips: categories, label: "Kinds of world" },
        ]}
        label="Planet collections"
        onSelect={chooseCategory}
      />

      {filtersOpen ? (
        <section className={styles["filters"]} aria-label="Filter by physics">
          <div className={styles["filters-head"]}>
            <h3>Filter by physics</h3>
            <Button
              size="sm"
              variant="ghost"
              icon="refresh"
              onClick={() => setPhysicalFilters(DEFAULT_PHYSICAL_PLANET_FILTERS)}
            >
              Reset
            </Button>
          </div>
          <div className={styles["axes"]}>
            {physicalAxes.map((axis) => {
              const value = physicalFilters[axis.key];
              return (
                <label key={axis.key} className={styles["axis"]}>
                  <span className={styles["axis-head"]}>
                    <strong>{axis.name}</strong>
                    <output aria-hidden="true">
                      {axisPositionLabel(value, axis.low, axis.high)}
                    </output>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={value}
                    aria-label={axis.name}
                    aria-valuetext={axisPositionLabel(value, axis.low, axis.high)}
                    onChange={(event) =>
                      setPhysicalFilters((current) => ({
                        ...current,
                        [axis.key]: Number(event.target.value),
                      }))
                    }
                  />
                  <span className={styles["axis-ends"]} aria-hidden="true">
                    <small>{axis.low}</small>
                    <small>{axis.high}</small>
                  </span>
                </label>
              );
            })}
          </div>
          <div className={styles["toggles"]}>
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
              <span>
                <strong>In the habitable zone</strong>
                <small>Rocky, and inside its star's flux limits</small>
              </span>
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
              <span>
                <strong>Well measured</strong>
                <small>Six or more observed properties</small>
              </span>
            </label>
          </div>
        </section>
      ) : null}

      <ResultToolbar
        label="Planet result layout"
        onViewChange={setResultView}
        status={status}
        statusId="catalog-status"
        view={resultView}
      >
        <Button
          size="sm"
          icon="sliders"
          aria-expanded={filtersOpen}
          aria-pressed={filtersOpen}
          onClick={toggleFilters}
        >
          Filters
        </Button>
      </ResultToolbar>

      {suggestion ? (
        <DidYouMean
          suggestion={suggestion}
          onAccept={() => {
            setSuggestion(null);
            setQuery(suggestion);
          }}
        />
      ) : null}

      <ResultList id="planet-search-results" testId="catalog-results" view={resultView}>
        {searchState === "loading" ? (
          <ResultState kind="loading">Finding confirmed worlds…</ResultState>
        ) : null}
        {searchState === "error" ? (
          <ResultState kind="error">
            The search could not be completed.{" "}
            <Button onClick={() => setRetry((value) => value + 1)}>Retry search</Button>
          </ResultState>
        ) : null}
        {searchState === "ready" && visiblePlanets.length === 0 ? (
          <ResultState kind="empty">
            {filtersOpen
              ? "No worlds fit every filter. Widen one or two of them."
              : "No confirmed planet matches that name, or anything close to it."}
          </ResultState>
        ) : null}
        {searchState === "ready"
          ? visiblePlanets.map((planet) => (
              <PlanetResult key={planet.id} cached={cached} onSelect={onSelect} planet={planet} />
            ))
          : null}
        {searchState === "ready" && nextCursor !== null ? (
          <ResultState kind="more" ref={sentinelRef} testId="catalog-load-more">
            {loadingMore ? (
              "Loading more worlds…"
            ) : (
              <Button onClick={loadMore}>
                {pageError ? "Retry loading more" : "Load more worlds"}
              </Button>
            )}
          </ResultState>
        ) : null}
      </ResultList>
    </section>
  );
};
