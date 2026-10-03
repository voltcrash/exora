import type { StarProfile } from "@exora/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { browseStars, discoverRandomStar, discoverStars, searchStars } from "../api-client.ts";
import { formatNumber } from "../planet-utils.tsx";
import { starKindLabel } from "../star-utils.ts";
import { starNotableTrait, suggestStarName } from "../search-discovery.ts";
import { appendUniqueById } from "../catalog-pagination.ts";
import { useInfiniteScroll } from "../use-infinite-scroll.ts";
import { StarCatalogVisual } from "./CatalogVisual.tsx";
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

interface StarCatalogProps {
  onSelect: (star: StarProfile, cached: boolean) => void;
}

type SearchState = "idle" | "loading" | "ready" | "error";
type SurpriseState = "idle" | "loading" | "error";

const collections = [
  {
    id: "closest-neighbors",
    label: "Closest to home",
    note: "Our nearest stellar neighbours, ordered by measured parallax.",
  },
  {
    id: "solar-analogs",
    label: "The Sun's cousins",
    note: "Nearby main-sequence stars with Sun-like spectra.",
  },
  {
    id: "brightest-stars",
    label: "Brightest in our sky",
    note: "The most brilliant stars as seen from Earth.",
  },
  {
    id: "stellar-extremes",
    label: "Stellar extremes",
    note: "Rare, massive and extraordinarily hot blue stars.",
  },
] as const;

const categories = [
  { id: "nearby-stars", label: "Nearby", note: "Within our stellar neighbourhood." },
  { id: "sun-like", label: "Sun-like", note: "F and G main-sequence stars." },
  { id: "red-dwarfs", label: "Red dwarfs", note: "Small, cool and long-lived." },
  { id: "blue-stars", label: "Blue stars", note: "Hot, luminous stellar giants." },
  { id: "giants", label: "Giants", note: "Stars in their evolved stages." },
  { id: "binary-systems", label: "Binaries", note: "Two stars in orbit around each other." },
  { id: "variable-stars", label: "Variables", note: "Stars whose brightness changes." },
  { id: "stellar-remnants", label: "Remnants", note: "White dwarfs and pulsars." },
] as const;

const StarResult = ({
  cached,
  onSelect,
  star,
}: {
  cached: boolean;
  onSelect: (star: StarProfile, cached: boolean) => void;
  star: StarProfile;
}) => (
  <ResultCard
    facts={[
      starKindLabel(star),
      star.observation.spectralType ?? "Spectrum unknown",
      `${formatNumber(star.observation.distanceParsecs, 1)} pc`,
    ]}
    onSelect={() => onSelect(star, cached)}
    subtitle={`${star.catalogName} · ${star.objectType}`}
    title={star.name}
    trait={starNotableTrait(star)}
    visual={<StarCatalogVisual star={star} />}
  />
);

export const StarCatalog = ({ onSelect }: StarCatalogProps) => {
  const surpriseControllerRef = useRef<AbortController | null>(null);
  const pageControllerRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [stars, setStars] = useState<StarProfile[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cached, setCached] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>("loading");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [resultView, setResultView] = useState<ResultView>("gallery");
  const [surpriseState, setSurpriseState] = useState<SurpriseState>("idle");
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(
    () => () => {
      surpriseControllerRef.current?.abort();
      pageControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    pageControllerRef.current?.abort();
    pageControllerRef.current = null;
    setLoadingMore(false);
    setNextCursor(null);

    if (activeCategory) {
      setSuggestion(null);
      const controller = new AbortController();
      setSearchState("loading");
      void discoverStars(activeCategory, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          setStars(result.stars);
          setCached(result.cached);
          setSearchState("ready");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.error(error);
          setStars([]);
          setSearchState("error");
        });
      return () => controller.abort();
    }
    if (query.trim().length < 1) {
      setSuggestion(null);
      const controller = new AbortController();
      setSearchState("loading");
      void browseStars({ signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          setStars(result.stars);
          setNextCursor(result.nextCursor);
          setCached(result.cached);
          setSearchState("ready");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.error(error);
          setStars([]);
          setSearchState("error");
        });
      return () => controller.abort();
    }
    const controller = new AbortController();
    setSearchState("loading");
    const normalizedQuery = query.trim();
    const delay = window.setTimeout(
      () => {
        void (async () => {
          const initialResult = await searchStars(normalizedQuery, { signal: controller.signal });
          const correction = suggestStarName(normalizedQuery);
          const result =
            correction && initialResult.stars.length === 0
              ? await searchStars(correction, { signal: controller.signal })
              : initialResult;
          if (controller.signal.aborted) return;
          setSuggestion(correction && result.stars.length > 0 ? correction : null);
          setStars(result.stars);
          setCached(result.cached);
          setSearchState("ready");
        })().catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.error(error);
          setStars([]);
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
  }, [activeCategory, query]);

  const loadMore = useCallback((): void => {
    if (!nextCursor || pageControllerRef.current) return;

    const controller = new AbortController();
    pageControllerRef.current = controller;
    setLoadingMore(true);
    void browseStars({ cursor: nextCursor, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setStars((current) => appendUniqueById(current, result.stars));
        setNextCursor(result.nextCursor);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setNextCursor(null);
      })
      .finally(() => {
        if (pageControllerRef.current !== controller) return;
        pageControllerRef.current = null;
        setLoadingMore(false);
      });
  }, [nextCursor]);

  const sentinelRef = useInfiniteScroll<HTMLLIElement>({
    enabled: searchState === "ready" && nextCursor !== null && !loadingMore,
    onLoadMore: loadMore,
  });

  const activeLabel = [...collections, ...categories].find(
    (category) => category.id === activeCategory,
  )?.label;

  const takeMeSomewhere = (): void => {
    surpriseControllerRef.current?.abort();
    const controller = new AbortController();
    surpriseControllerRef.current = controller;
    setSurpriseState("loading");
    void discoverRandomStar({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        onSelect(result.star, result.cached);
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
        ? `Looking up “${trimmed}” in SIMBAD…`
        : activeLabel
          ? `Opening ${activeLabel.toLowerCase()}…`
          : "Loading the catalog…"
      : searchState === "error"
        ? "SIMBAD did not answer. Try again in a moment."
        : trimmed
          ? `${String(stars.length)} stars match “${trimmed}”`
          : activeLabel
            ? `${String(stars.length)} stars · ${activeLabel}`
            : "Stars from SIMBAD, A to Z";

  return (
    <section className={catalogStyles["catalog"]} aria-label="Star catalog">
      <CatalogSearch
        describedBy="star-catalog-status"
        label="Search stars"
        onChange={(value) => {
          setActiveCategory(null);
          setQuery(value);
        }}
        onRandom={takeMeSomewhere}
        placeholder="Search by common name or catalog ID — misspellings are fine"
        randomBusy={surpriseState === "loading"}
        randomError={surpriseState === "error"}
        randomLabel="Random star"
        resultsId="star-search-results"
        value={query}
      />

      <ChipRail
        active={activeCategory}
        allLabel="All stars"
        groups={[
          { chips: collections, label: "Collections" },
          { chips: categories, label: "Kinds of star" },
        ]}
        label="Star collections"
        onSelect={(category) => {
          setQuery("");
          setActiveCategory(category);
        }}
      />

      <ResultToolbar
        label="Star result layout"
        onViewChange={setResultView}
        status={status}
        statusId="star-catalog-status"
        view={resultView}
      />

      {suggestion ? (
        <DidYouMean
          suggestion={suggestion}
          onAccept={() => {
            setSuggestion(null);
            setQuery(suggestion);
          }}
        />
      ) : null}

      <ResultList id="star-search-results" view={resultView}>
        {searchState === "loading" ? (
          <ResultState kind="loading">Finding stars…</ResultState>
        ) : null}
        {searchState === "error" ? (
          <ResultState kind="error">The search could not be completed.</ResultState>
        ) : null}
        {searchState === "ready" && stars.length === 0 ? (
          <ResultState kind="empty">
            No star matches that name, or anything close to it.
          </ResultState>
        ) : null}
        {searchState === "ready"
          ? stars.map((star) => (
              <StarResult key={star.id} cached={cached} onSelect={onSelect} star={star} />
            ))
          : null}
        {searchState === "ready" && nextCursor !== null ? (
          <ResultState kind="more" ref={sentinelRef} testId="star-catalog-load-more">
            {loadingMore ? "Loading more stars…" : "Scroll for more stars"}
          </ResultState>
        ) : null}
      </ResultList>
    </section>
  );
};
