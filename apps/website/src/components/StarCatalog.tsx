import type { StarProfile } from "@exora/contracts";
import { useEffect, useRef, useState } from "react";
import { discoverRandomStar, discoverStars, searchStars } from "../api-client.ts";
import { formatNumber } from "../planet-utils.tsx";
import { starKindLabel } from "../star-utils.ts";
import { StarCatalogVisual } from "./CatalogVisual.tsx";

interface StarCatalogProps {
  onClose: () => void;
  onSelect: (star: StarProfile, cached: boolean) => void;
  open: boolean;
}

type SearchState = "idle" | "loading" | "ready" | "error";
type SurpriseState = "idle" | "loading" | "error";

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

export const StarCatalog = ({ onClose, onSelect, open }: StarCatalogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const surpriseControllerRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [stars, setStars] = useState<StarProfile[]>([]);
  const [cached, setCached] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [portalView, setPortalView] = useState<"collections" | "categories">("collections");
  const [resultView, setResultView] = useState<"gallery" | "list">("gallery");
  const [surpriseState, setSurpriseState] = useState<SurpriseState>("idle");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      surpriseControllerRef.current?.abort();
      setSurpriseState("idle");
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (activeCategory) {
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
    if (query.trim().length < 2) {
      setStars([]);
      setSearchState("idle");
      return;
    }
    const controller = new AbortController();
    setSearchState("loading");
    const delay = window.setTimeout(
      () => {
        void searchStars(query, { signal: controller.signal })
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
      },
      query.trim().length >= 2 ? 320 : 0,
    );
    return () => {
      window.clearTimeout(delay);
      controller.abort();
    };
  }, [activeCategory, open, query]);

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

  const status =
    searchState === "idle"
      ? "Choose a stellar family, or search SIMBAD by name."
      : searchState === "loading"
        ? query.trim().length >= 2
          ? `Resolving “${query.trim()}” in SIMBAD…`
          : `Scanning SIMBAD for ${activeLabel ?? "stellar objects"}…`
        : searchState === "error"
          ? "The SIMBAD signal is unavailable. Try again shortly."
          : `${stars.length} stellar ${stars.length === 1 ? "destination" : "destinations"}${activeLabel ? ` in ${activeLabel}` : ""}${cached ? " · cached result" : ""}.`;

  return (
    <dialog
      ref={dialogRef}
      className="planet-catalog star-catalog"
      aria-labelledby="star-catalog-title"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="catalog-header">
        <div>
          <p>DISCOVERY PORTAL · SIMBAD STELLAR ARCHIVE</p>
          <h2 id="star-catalog-title">Choose a star to discover</h2>
        </div>
        <button
          className="catalog-close"
          type="button"
          aria-label="Close star catalog"
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
                : "Jump to a random stellar destination"}
          </strong>
        </span>
        <span className="surprise-action">
          {surpriseState === "loading" ? "SCANNING" : "SURPRISE ME"}{" "}
          <span aria-hidden="true">↗</span>
        </span>
      </button>
      <div className="discovery-intro">
        <span>
          {portalView === "collections" ? "CURATED JOURNEYS" : "EXPLORE BY STELLAR FAMILY"}
        </span>
        <small>Large targets are designed for gaze, pointer, touch, or mouse</small>
      </div>
      <div className="discovery-tabs" role="tablist" aria-label="Star discovery views">
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
          Star types
        </button>
      </div>
      {portalView === "collections" ? (
        <div className="collection-grid" aria-label="Curated star collections">
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
        <div className="discovery-grid" aria-label="Star discovery categories">
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
        <span className="star-search-mark" aria-hidden="true">
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
          placeholder="Search Sirius, Betelgeuse, Vega or a catalog ID"
          autoComplete="off"
          aria-describedby="star-catalog-status"
        />
        <span className="search-key">ESC</span>
      </div>
      <div className="catalog-meta">
        <p id="star-catalog-status" role="status">
          {status}
        </p>
        <div className="catalog-view-toggle" role="group" aria-label="Star result layout">
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
      <ol
        className={`catalog-results ${resultView}-view${searchState === "idle" ? " is-idle" : ""}`}
      >
        {searchState === "loading" && (
          <li className="catalog-loading">
            <span /> Resolving stellar data
          </li>
        )}
        {searchState === "error" && (
          <li className="catalog-empty">SIMBAD search could not be completed.</li>
        )}
        {searchState === "ready" && stars.length === 0 && (
          <li className="catalog-empty">No exact stellar object matched that name.</li>
        )}
        {searchState === "ready" &&
          stars.map((star) => (
            <li key={star.id}>
              <button
                className="catalog-result"
                type="button"
                onClick={() => onSelect(star, cached)}
              >
                <span className="result-preview">
                  <StarCatalogVisual star={star} />
                </span>
                <span className="result-marker star-result-marker" aria-hidden="true" />
                <span className="result-identity">
                  <strong>{star.name}</strong>
                  <small>
                    {star.catalogName} · {star.objectType}
                  </small>
                </span>
                <span className="result-metrics">
                  <small>{starKindLabel(star)}</small>
                  <strong>{star.observation.spectralType ?? "SPECTRUM UNKNOWN"}</strong>
                </span>
                <span className="result-state">
                  {formatNumber(star.observation.distanceParsecs, 1)} PC · EXPLORE
                </span>
              </button>
            </li>
          ))}
      </ol>
    </dialog>
  );
};
