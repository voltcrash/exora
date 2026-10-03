import { useEffect, useMemo, useState } from "react";
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
import { capitalize } from "../readable.ts";
import { BlackHoleCatalogVisual } from "./CatalogVisual.tsx";
import {
  CatalogSearch,
  ChipRail,
  ResultCard,
  ResultList,
  ResultState,
  ResultToolbar,
  type ResultView,
} from "./catalog/CatalogParts.tsx";
import catalogStyles from "./catalog/catalog.module.css";

interface BlackHoleCatalogProps {
  onSelect: (blackHole: BlackHoleProfile) => void;
}

type ArchiveState = "loading" | "ready" | "featured-only";

const formatDistance = (blackHole: BlackHoleProfile): string => {
  if (blackHole.distanceLightYears === null) {
    return blackHole.observation.redshift === null
      ? "Distance unknown"
      : `Redshift z ${String(blackHole.observation.redshift)}`;
  }
  if (blackHole.distanceLightYears >= 1_000_000) {
    return `${(blackHole.distanceLightYears / 1_000_000).toLocaleString("en-US", {
      maximumFractionDigits: 1,
    })} million ly`;
  }
  return `${blackHole.distanceLightYears.toLocaleString("en-US", { maximumFractionDigits: 0 })} ly`;
};

export const BlackHoleResult = ({
  blackHole,
  onSelect,
}: {
  blackHole: BlackHoleProfile;
  onSelect: (blackHole: BlackHoleProfile) => void;
}) => (
  <ResultCard
    facts={[
      capitalize(blackHoleKindLabel(blackHole)),
      formatBlackHoleMass(blackHole.massSolar),
      formatDistance(blackHole),
    ]}
    onSelect={() => onSelect(blackHole)}
    subtitle={`${blackHole.catalogDesignation} · ${capitalize(blackHole.status)} · ${blackHole.host}`}
    title={blackHole.name}
    trait={blackHoleNotableTrait(blackHole)}
    visual={<BlackHoleCatalogVisual blackHole={blackHole} />}
  />
);

export const BlackHoleCatalog = ({ onSelect }: BlackHoleCatalogProps) => {
  const [query, setQuery] = useState("");
  const [observed, setObserved] = useState<readonly BlackHoleProfile[]>([]);
  const [archiveState, setArchiveState] = useState<ArchiveState>("loading");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [resultView, setResultView] = useState<ResultView>("gallery");

  useEffect(() => {
    const controller = new AbortController();
    void loadObservedBlackHoles(50, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setObserved(result.blackHoles);
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

  const takeMeSomewhere = (): void => {
    const pool = records.length > 0 ? records : catalog;
    const destination = pool[Math.floor(Math.random() * pool.length)];
    if (destination) onSelect(destination);
  };

  const status =
    archiveState === "loading"
      ? "Loading observed horizons from the compact-object archive…"
      : archiveState === "featured-only"
        ? "The archive is unreachable, so only the curated horizons are shown."
        : `${String(records.length)} black holes`;

  return (
    <section className={catalogStyles["catalog"]} aria-label="Black hole catalog">
      <CatalogSearch
        describedBy="black-hole-catalog-status"
        label="Search black holes"
        onChange={(value) => {
          setActiveCategory(null);
          setQuery(value);
        }}
        onRandom={takeMeSomewhere}
        placeholder="Search by name, catalog ID or host galaxy"
        randomLabel="Random horizon"
        resultsId="black-hole-search-results"
        value={query}
      />

      <ChipRail
        active={activeCategory}
        allLabel="All horizons"
        groups={[
          { chips: BLACK_HOLE_COLLECTIONS, label: "Collections" },
          { chips: BLACK_HOLE_CATEGORIES, label: "Kinds of horizon" },
        ]}
        label="Black hole collections"
        onSelect={(category) => {
          setQuery("");
          setActiveCategory(category === activeCategory ? null : category);
        }}
      />

      <ResultToolbar
        label="Black hole result layout"
        onViewChange={setResultView}
        status={status}
        statusId="black-hole-catalog-status"
        view={resultView}
      />

      <ResultList id="black-hole-search-results" view={resultView}>
        {archiveState === "loading" && records.length === 0 ? (
          <ResultState kind="loading">Finding observed horizons…</ResultState>
        ) : null}
        {archiveState !== "loading" && records.length === 0 ? (
          <ResultState kind="empty">
            No observed black hole matches that name or family.
          </ResultState>
        ) : null}
        {records.map((blackHole) => (
          <BlackHoleResult key={blackHole.id} blackHole={blackHole} onSelect={onSelect} />
        ))}
      </ResultList>

      <p className={catalogStyles["footnote"]}>
        Every record keeps its catalog attribution. Masses and distances are published measurements;
        anything unmeasured stays unavailable rather than estimated. The scenes themselves are
        interpretive models of gravitational lensing.
      </p>
    </section>
  );
};
