import type { StarProfile } from "@exora/contracts";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { browseStars, discoverRandomStar, discoverStars, searchStars } from "../api-client.ts";
import { formatNumber } from "../planet-utils.tsx";
import { starKindLabel } from "../star-utils.ts";
import { starNotableTrait, suggestStarName } from "../search-discovery.ts";
import { useTabList } from "../use-tab-list.ts";
import { appendUniqueById } from "../catalog-pagination.ts";
import { useInfiniteScroll } from "../use-infinite-scroll.ts";
import { StarCatalogVisual } from "./CatalogVisual.tsx";
import sharedStyles from "./ExperienceShared.module.css";
import catalogStyles from "./CatalogShared.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles, catalogStyles);

interface StarCatalogProps {
  embedded?: boolean;
  onClose: () => void;
  onSelect: (star: StarProfile, cached: boolean) => void;
}

type SearchState = "idle" | "loading" | "ready" | "error";
type SurpriseState = "idle" | "loading" | "error";
type PortalView = "collections" | "categories";

const PORTAL_VIEWS: readonly PortalView[] = ["collections", "categories"];

const categories = [
  { id: "nearby-stars", icon: "⌖", label: "Nearby stars", note: "Within our stellar neighborhood" },
  { id: "sun-like", icon: "☼", label: "Sun-like stars", note: "F & G main-sequence stars" },
  { id: "red-dwarfs", icon: "•", label: "Red dwarfs", note: "Small, cool & long-lived" },
  { id: "blue-stars", icon: "✦", label: "Blue stars", note: "Hot, luminous stellar giants" },
  { id: "giants", icon: "◉", label: "Giants & supergiants", note: "Stars in evolved stages" },
  { id: "binary-systems", icon: "∞", label: "Binary systems", note: "Two stars in orbital dance" },
  { id: "variable-stars", icon: "∿", label: "Variable stars", note: "Brightness that changes" },
  { id: "stellar-remnants", icon: "⊙", label: "Stellar remnants", note: "White dwarfs & pulsars" },
] as const;

const collections = [
  {
    id: "closest-neighbors",
    index: "01",
    label: "Closest to home",
    note: "Our nearest stellar neighbors, ordered by measured parallax",
    tag: "LOCAL STARS",
  },
  {
    id: "solar-analogs",
    index: "02",
    label: "The Sun's cousins",
    note: "Nearby main-sequence stars with Sun-like spectra",
    tag: "SOLAR ANALOGS",
  },
  {
    id: "brightest-stars",
    index: "03",
    label: "Brightest in our sky",
    note: "The most visually brilliant stellar destinations from Earth",
    tag: "ICONIC LIGHTS",
  },
  {
    id: "stellar-extremes",
    index: "04",
    label: "Stellar extremes",
    note: "Rare, massive and extraordinarily hot blue stars",
    tag: "COSMIC TITANS",
  },
] as const;

const StarResult = memo(
  ({
    cached,
    onSelect,
    star,
  }: {
    cached: boolean;
    onSelect: (star: StarProfile, cached: boolean) => void;
    star: StarProfile;
  }) => (
    <li>
      <button className={cx("catalog-result")} type="button" onClick={() => onSelect(star, cached)}>
        <span className={cx("result-preview")}>
          <StarCatalogVisual star={star} />
        </span>
        <span className={cx("result-marker star-result-marker")} aria-hidden="true" />
        <span className={cx("result-identity")}>
          <strong>{star.name}</strong>
          <small>
            {star.catalogName} · {star.objectType}
          </small>
          <span className={cx("result-trait")}>{starNotableTrait(star)}</span>
        </span>
        <span className={cx("result-metrics")}>
          <small>{starKindLabel(star)}</small>
          <strong>{star.observation.spectralType ?? "SPECTRUM UNKNOWN"}</strong>
        </span>
        <span className={cx("result-state")}>
          {formatNumber(star.observation.distanceParsecs, 1)} PC · EXPLORE
        </span>
      </button>
    </li>
  ),
);

export const StarCatalog = ({ embedded = false, onClose, onSelect }: StarCatalogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const surpriseControllerRef = useRef<AbortController | null>(null);
  const pageControllerRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [stars, setStars] = useState<StarProfile[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cached, setCached] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>("loading");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [portalView, setPortalView] = useState<PortalView>("collections");
  const [resultView, setResultView] = useState<"gallery" | "list">("gallery");
  const [surpriseState, setSurpriseState] = useState<SurpriseState>("idle");
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!embedded) dialog?.showModal();

    return () => {
      surpriseControllerRef.current?.abort();
      pageControllerRef.current?.abort();
      dialog?.close();
    };
  }, [embedded]);

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

  const tabs = useTabList({
    label: "Star discovery views",
    list: "star-discovery",
    onSelect: setPortalView,
    value: portalView,
    values: PORTAL_VIEWS,
  });

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

  const status =
    searchState === "idle"
      ? "Loading the alphabetical stellar catalog…"
      : searchState === "loading"
        ? query.trim().length >= 1
          ? `Resolving “${query.trim()}” in SIMBAD…`
          : activeLabel
            ? `Scanning SIMBAD for ${activeLabel}…`
            : "Loading the alphabetical stellar catalog…"
        : searchState === "error"
          ? "The SIMBAD signal is unavailable. Try again shortly."
          : `${stars.length} stellar ${stars.length === 1 ? "destination" : "destinations"}${suggestion ? ` for suggested signal ${suggestion}` : activeLabel ? ` in ${activeLabel}` : " · alphabetical catalog"}${nextCursor ? " · scroll for more" : ""}${cached ? " · cached result" : ""}.`;

  return (
    <dialog
      ref={dialogRef}
      className={cx(`planet-catalog star-catalog${embedded ? " embedded-catalog" : ""}`)}
      data-embedded={embedded}
      open={embedded || undefined}
      role={embedded ? "region" : undefined}
      aria-label={embedded ? "Star catalog" : undefined}
      aria-labelledby={embedded ? undefined : "star-catalog-title"}
      onCancel={embedded ? undefined : onClose}
      onClose={embedded ? undefined : onClose}
      onClick={(event) => {
        if (!embedded && event.target === dialogRef.current) onClose();
      }}
    >
      <div className={cx("catalog-scroll-region")} data-style-role="catalog-scroll-region">
        {!embedded ? (
          <div className={cx("catalog-header")}>
            <div>
              <p>DISCOVERY PORTAL · SIMBAD STELLAR ARCHIVE</p>
              <h2 id="star-catalog-title">Choose a star to discover</h2>
            </div>
            <button
              className={cx("catalog-close")}
              type="button"
              aria-label="Close star catalog"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        ) : null}
        <div className={cx("catalog-search")} data-style-role="catalog-search">
          <span className={cx("star-search-mark")} aria-hidden="true">
            ✦
          </span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => {
              setActiveCategory(null);
              setQuery(event.target.value);
            }}
            placeholder="Type a common name or catalog ID — misspellings are okay"
            autoComplete="off"
            minLength={1}
            aria-autocomplete="list"
            aria-controls="star-search-results"
            aria-describedby="star-catalog-status"
          />
          <button
            className={cx("random-world")}
            type="button"
            disabled={surpriseState === "loading"}
            aria-busy={surpriseState === "loading"}
            title={surpriseState === "error" ? "Signal lost — try again" : undefined}
            onClick={takeMeSomewhere}
          >
            <span aria-hidden="true">✦</span>
            Random world
          </button>
        </div>
        {!embedded ? (
          <div className={cx("discovery-intro")}>
            <span>
              {portalView === "collections" ? "CURATED JOURNEYS" : "EXPLORE BY STELLAR FAMILY"}
            </span>
            <small>Large targets are designed for gaze, pointer, touch, or mouse</small>
          </div>
        ) : null}
        <div className={cx("discovery-tabs")} {...tabs.tabListProps}>
          <button {...tabs.tabProps("collections")} onClick={() => setPortalView("collections")}>
            Curated collections
          </button>
          <button {...tabs.tabProps("categories")} onClick={() => setPortalView("categories")}>
            Star types
          </button>
        </div>
        {portalView === "collections" ? (
          <div className={cx("collection-grid")} {...tabs.panelProps("collections")}>
            {collections.map((collection) => (
              <button
                key={collection.id}
                className={cx(
                  `collection-card${activeCategory === collection.id ? " active" : ""}`,
                )}
                type="button"
                aria-pressed={activeCategory === collection.id}
                onClick={() => {
                  setQuery("");
                  setActiveCategory(collection.id);
                }}
              >
                <span className={cx("collection-index")}>{collection.index}</span>
                <span className={cx("collection-copy")}>
                  <small>{collection.tag}</small>
                  <strong>{collection.label}</strong>
                  <span>{collection.note}</span>
                </span>
                <span className={cx("collection-launch")} aria-hidden="true">
                  EXPLORE ↗
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className={cx("discovery-grid")} {...tabs.panelProps("categories")}>
            {categories.map((category) => (
              <button
                key={category.id}
                className={cx(`discovery-card${activeCategory === category.id ? " active" : ""}`)}
                type="button"
                aria-pressed={activeCategory === category.id}
                onClick={() => {
                  setQuery("");
                  setActiveCategory(category.id);
                }}
              >
                <span className={cx("discovery-icon")} aria-hidden="true">
                  {category.icon}
                </span>
                <span>
                  <strong>{category.label}</strong>
                  <small>{category.note}</small>
                </span>
                <span className={cx("discovery-arrow")} aria-hidden="true">
                  ↗
                </span>
              </button>
            ))}
          </div>
        )}
        <div className={cx("catalog-meta")}>
          <p id="star-catalog-status" role="status">
            {status}
          </p>
          <div className={cx("catalog-view-toggle")} role="group" aria-label="Star result layout">
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
            className={cx("did-you-mean")}
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
        <ol id="star-search-results" className={cx(`catalog-results ${resultView}-view`)}>
          {searchState === "loading" && (
            <li className={cx("catalog-loading")}>
              <span /> Resolving stellar data
            </li>
          )}
          {searchState === "error" && (
            <li className={cx("catalog-empty")}>SIMBAD search could not be completed.</li>
          )}
          {searchState === "ready" && stars.length === 0 && (
            <li className={cx("catalog-empty")}>
              No stellar object matched that name or its nearest aliases.
            </li>
          )}
          {searchState === "ready" &&
            stars.map((star) => (
              <StarResult key={star.id} cached={cached} onSelect={onSelect} star={star} />
            ))}
          {searchState === "ready" && nextCursor !== null && (
            <li
              ref={sentinelRef}
              className={cx("catalog-loading")}
              data-testid="star-catalog-load-more"
              aria-live="polite"
            >
              <span /> {loadingMore ? "Loading more stars" : "Scroll for more stars"}
            </li>
          )}
        </ol>
      </div>
    </dialog>
  );
};
