import { Button } from "./ui/Button.tsx";
import type { StarProfile } from "@exora/contracts";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
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
  { id: "closest-neighbors", label: "Closest to home" },
  { id: "solar-analogs", label: "The Sun's cousins" },
  { id: "brightest-stars", label: "Brightest in our sky" },
  { id: "stellar-extremes", label: "Stellar extremes" },
] as const;

const categories = [
  { id: "nearby-stars", label: "Nearby" },
  { id: "sun-like", label: "Sun-like" },
  { id: "red-dwarfs", label: "Red dwarfs" },
  { id: "blue-stars", label: "Blue stars" },
  { id: "giants", label: "Giants" },
  { id: "binary-systems", label: "Binaries" },
  { id: "variable-stars", label: "Variables" },
  { id: "stellar-remnants", label: "Remnants" },
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
    title={star.name}
    trait={starNotableTrait(star)}
    visual={<StarCatalogVisual star={star} />}
  />
);

export const StarCatalog = ({ onSelect }: StarCatalogProps) => {
  const surpriseControllerRef = useRef<AbortController | null>(null);
  const pageControllerRef = useRef<AbortController | null>(null);
  const [retry, setRetry] = useState(0);
  const [pageError, setPageError] = useState(false);
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
    setPageError(false);
    setSuggestion(null);
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
  }, [activeCategory, query, retry]);

  const loadMore = useCallback((): void => {
    if (!nextCursor || pageControllerRef.current) return;

    const controller = new AbortController();
    pageControllerRef.current = controller;
    setLoadingMore(true);
    setPageError(false);
    let appended = false;
    void browseStars({ cursor: nextCursor, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        // Appending a page renders dozens of cards; as a transition it yields to scrolling.
        // Loading ends in the same transition, so the observer re-arms only with the new cursor.
        appended = true;
        startTransition(() => {
          setStars((current) => appendUniqueById(current, result.stars));
          setNextCursor(result.nextCursor);
          setLoadingMore(false);
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setPageError(true);
      })
      .finally(() => {
        if (pageControllerRef.current !== controller) return;
        pageControllerRef.current = null;
        if (!appended) setLoadingMore(false);
      });
  }, [nextCursor]);

  const sentinelRef = useInfiniteScroll<HTMLLIElement>({
    enabled: searchState === "ready" && nextCursor !== null && !loadingMore && !pageError,
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
        setSurpriseState("idle");
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
    searchState === "error"
      ? "SIMBAD unavailable."
      : searchState === "ready" && (trimmed || activeLabel)
        ? `${String(stars.length)} stars`
        : "";

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
        placeholder="Search stars"
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
        {searchState === "loading" ? <ResultState kind="loading">Loading…</ResultState> : null}
        {searchState === "error" ? (
          <ResultState kind="error">
            <Button onClick={() => setRetry((value) => value + 1)}>Retry</Button>
          </ResultState>
        ) : null}
        {searchState === "ready" && stars.length === 0 ? (
          <ResultState kind="empty">No matches.</ResultState>
        ) : null}
        {searchState === "ready"
          ? stars.map((star) => (
              <StarResult key={star.id} cached={cached} onSelect={onSelect} star={star} />
            ))
          : null}
        {searchState === "ready" && nextCursor !== null ? (
          <ResultState kind="more" ref={sentinelRef} testId="star-catalog-load-more">
            {loadingMore ? (
              "Loading…"
            ) : (
              <Button onClick={loadMore}>{pageError ? "Retry" : "Load more"}</Button>
            )}
          </ResultState>
        ) : null}
      </ResultList>
    </section>
  );
};
