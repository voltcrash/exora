import { memo, useEffect, useMemo, useRef, useState } from "react";
import { loadObservedBlackHoles } from "../api-client.ts";
import {
  BLACK_HOLES,
  BLACK_HOLE_CATEGORIES,
  BLACK_HOLE_COLLECTIONS,
  blackHoleKindLabel,
  blackHoleNotableTrait,
  collectBlackHoles,
  formatBlackHoleMass,
  mergeBlackHoles,
  searchBlackHoles,
  type BlackHoleProfile,
} from "../black-holes.ts";
import { bindStyles } from "../styles/bind-styles.ts";
import { useTabList } from "../use-tab-list.ts";
import catalogStyles from "./CatalogShared.module.css";
import { BlackHoleCatalogVisual } from "./CatalogVisual.tsx";
import sharedStyles from "./ExperienceShared.module.css";

const cx = bindStyles(sharedStyles, catalogStyles);

interface BlackHoleCatalogProps {
  embedded?: boolean;
  onClose: () => void;
  onSelect: (blackHole: BlackHoleProfile) => void;
}

type ArchiveState = "loading" | "ready" | "featured-only";
type PortalView = "collections" | "categories";

const PORTAL_VIEWS: readonly PortalView[] = ["collections", "categories"];

const formatDistance = (blackHole: BlackHoleProfile): string => {
  if (blackHole.distanceLightYears === null) {
    return blackHole.observation.redshift === null
      ? "DISTANCE UNAVAILABLE"
      : `REDSHIFT z ${blackHole.observation.redshift}`;
  }
  if (blackHole.distanceLightYears >= 1_000_000) {
    return `${(blackHole.distanceLightYears / 1_000_000).toLocaleString("en-US", {
      maximumFractionDigits: 1,
    })} MILLION LY`;
  }
  return `${blackHole.distanceLightYears.toLocaleString("en-US", { maximumFractionDigits: 0 })} LY`;
};

export const BlackHoleResult = memo(
  ({
    blackHole,
    onSelect,
  }: {
    blackHole: BlackHoleProfile;
    onSelect: (blackHole: BlackHoleProfile) => void;
  }) => (
    <li>
      <button className={cx("catalog-result")} type="button" onClick={() => onSelect(blackHole)}>
        <span className={cx("result-preview")}>
          <BlackHoleCatalogVisual blackHole={blackHole} />
        </span>
        <span className={cx("result-marker black-hole-result-marker")} aria-hidden="true" />
        <span className={cx("result-identity")}>
          <strong>{blackHole.name}</strong>
          <small>
            {blackHole.catalogDesignation} · {blackHole.host}
          </small>
          <span className={cx("result-trait")}>{blackHoleNotableTrait(blackHole)}</span>
        </span>
        <span className={cx("result-metrics")}>
          <small>
            {blackHoleKindLabel(blackHole).toUpperCase()} · {blackHole.status.toUpperCase()}
          </small>
          <strong>{formatBlackHoleMass(blackHole.massSolar)}</strong>
        </span>
        <span className={cx("result-state")}>{formatDistance(blackHole)}</span>
      </button>
    </li>
  ),
);

export const BlackHoleCatalog = ({
  embedded = false,
  onClose,
  onSelect,
}: BlackHoleCatalogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [observed, setObserved] = useState<readonly BlackHoleProfile[]>([]);
  const [archiveState, setArchiveState] = useState<ArchiveState>("loading");
  const [stale, setStale] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [portalView, setPortalView] = useState<PortalView>("collections");
  const [resultView, setResultView] = useState<"gallery" | "list">("gallery");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!embedded) dialog?.showModal();
    return () => dialog?.close();
  }, [embedded]);

  useEffect(() => {
    const controller = new AbortController();
    void loadObservedBlackHoles(50, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setObserved(result.blackHoles);
        setStale(result.stale);
        setArchiveState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setArchiveState("featured-only");
      });
    return () => controller.abort();
  }, []);

  const catalog = useMemo(() => mergeBlackHoles(BLACK_HOLES, observed), [observed]);
  const records = useMemo(
    () =>
      activeCategory
        ? collectBlackHoles(searchBlackHoles(catalog, query), activeCategory)
        : searchBlackHoles(catalog, query),
    [activeCategory, catalog, query],
  );

  const tabs = useTabList({
    label: "Black hole discovery views",
    list: "black-hole-discovery",
    onSelect: setPortalView,
    value: portalView,
    values: PORTAL_VIEWS,
  });

  const activeLabel = [...BLACK_HOLE_COLLECTIONS, ...BLACK_HOLE_CATEGORIES].find(
    (entry) => entry.id === activeCategory,
  )?.label;

  const takeMeSomewhere = (): void => {
    const pool = records.length > 0 ? records : catalog;
    const destination = pool[Math.floor(Math.random() * pool.length)];
    if (destination) onSelect(destination);
  };

  const status =
    archiveState === "loading"
      ? "Loading observed horizons from the compact-object archive…"
      : `${records.length} observed ${records.length === 1 ? "horizon" : "horizons"}${
          query.trim() ? ` matching “${query.trim()}”` : activeLabel ? ` in ${activeLabel}` : ""
        }${
          archiveState === "featured-only"
            ? " · archive unreachable, showing curated horizons"
            : stale
              ? " · cached archive snapshot"
              : ""
        }.`;

  return (
    <dialog
      ref={dialogRef}
      className={cx(`planet-catalog black-hole-catalog${embedded ? " embedded-catalog" : ""}`)}
      data-embedded={embedded}
      open={embedded || undefined}
      role={embedded ? "region" : undefined}
      aria-label={embedded ? "Black hole catalog" : undefined}
      aria-labelledby={embedded ? undefined : "black-hole-catalog-title"}
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
              <p>DISCOVERY PORTAL · COMPACT OBJECT ATLAS</p>
              <h2 id="black-hole-catalog-title">Choose an event horizon</h2>
            </div>
            <button
              className={cx("catalog-close")}
              type="button"
              aria-label="Close black hole catalog"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        ) : null}

        <div className={cx("catalog-search")} data-style-role="catalog-search">
          <span className={cx("black-hole-search-mark")} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setActiveCategory(null);
              setQuery(event.target.value);
            }}
            placeholder="Type a name, catalog ID, or host galaxy"
            autoComplete="off"
            aria-controls="black-hole-search-results"
            aria-describedby="black-hole-catalog-status"
          />
          <button className={cx("random-world")} type="button" onClick={takeMeSomewhere}>
            <span aria-hidden="true">✦</span>
            Random horizon
          </button>
        </div>

        {!embedded ? (
          <div className={cx("discovery-intro")}>
            <span>
              {portalView === "collections" ? "CURATED JOURNEYS" : "EXPLORE BY HORIZON FAMILY"}
            </span>
            <small>Every record here is an observed system, not a synthetic one</small>
          </div>
        ) : null}

        <div className={cx("discovery-tabs")} {...tabs.tabListProps}>
          <button {...tabs.tabProps("collections")} onClick={() => setPortalView("collections")}>
            Curated collections
          </button>
          <button {...tabs.tabProps("categories")} onClick={() => setPortalView("categories")}>
            Horizon types
          </button>
        </div>

        {portalView === "collections" ? (
          <div className={cx("collection-grid")} {...tabs.panelProps("collections")}>
            {BLACK_HOLE_COLLECTIONS.map((collection) => (
              <button
                key={collection.id}
                className={cx(
                  `collection-card${activeCategory === collection.id ? " active" : ""}`,
                )}
                type="button"
                aria-pressed={activeCategory === collection.id}
                onClick={() => {
                  setQuery("");
                  setActiveCategory(activeCategory === collection.id ? null : collection.id);
                }}
              >
                <span className={cx("collection-index")}>{collection.index}</span>
                <span className={cx("collection-copy")}>
                  <small>{collection.tag}</small>
                  <strong>{collection.label}</strong>
                  <span>{collection.note}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className={cx("discovery-grid")} {...tabs.panelProps("categories")}>
            {BLACK_HOLE_CATEGORIES.map((category) => (
              <button
                key={category.id}
                className={cx(`discovery-card${activeCategory === category.id ? " active" : ""}`)}
                type="button"
                aria-pressed={activeCategory === category.id}
                onClick={() => {
                  setQuery("");
                  setActiveCategory(activeCategory === category.id ? null : category.id);
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
          <p id="black-hole-catalog-status" role="status">
            {status}
          </p>
          <div
            className={cx("catalog-view-toggle")}
            role="group"
            aria-label="Black hole result layout"
          >
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

        <ol id="black-hole-search-results" className={cx(`catalog-results ${resultView}-view`)}>
          {archiveState === "loading" && records.length === 0 && (
            <li className={cx("catalog-loading")}>
              <span /> Resolving observed horizons
            </li>
          )}
          {archiveState !== "loading" && records.length === 0 && (
            <li className={cx("catalog-empty")}>
              No observed black hole matched that name or family.
            </li>
          )}
          {records.map((blackHole) => (
            <BlackHoleResult key={blackHole.id} blackHole={blackHole} onSelect={onSelect} />
          ))}
        </ol>

        <p className={cx("black-hole-method-note")}>
          EVERY RECORD RETAINS ITS CATALOG ATTRIBUTION. MASSES AND DISTANCES ARE PUBLISHED
          MEASUREMENTS; UNMEASURED VALUES STAY UNAVAILABLE RATHER THAN ESTIMATED. LIVE SCENES REMAIN
          INTERPRETIVE GRAVITATIONAL-LENSING VISUALIZATIONS.
        </p>
      </div>
    </dialog>
  );
};
