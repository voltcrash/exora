import { generateProceduralBlackHoles } from "@exora/worldgen";
import { useEffect, useRef, useState } from "react";
import { loadObservedBlackHoles } from "../api-client.ts";
import {
  BLACK_HOLES,
  blackHoleKindLabel,
  formatBlackHoleMass,
  type BlackHoleProfile,
} from "../black-holes.ts";
import { bindStyles } from "../styles/bind-styles.ts";
import catalogStyles from "./CatalogShared.module.css";
import { BlackHoleCatalogVisual } from "./CatalogVisual.tsx";
import sharedStyles from "./ExperienceShared.module.css";

const cx = bindStyles(sharedStyles, catalogStyles);
type AtlasView = "featured" | "observed" | "procedural";

interface BlackHoleCatalogProps {
  embedded?: boolean;
  onClose: () => void;
  onSelect: (blackHole: BlackHoleProfile) => void;
}

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

export const BlackHoleCard = ({
  blackHole,
  index,
  onSelect,
}: {
  blackHole: BlackHoleProfile;
  index: number;
  onSelect: (blackHole: BlackHoleProfile) => void;
}) => (
  <article className={cx("black-hole-card")}>
    <button type="button" onClick={() => onSelect(blackHole)}>
      <BlackHoleCatalogVisual blackHole={blackHole} />
      <span className={cx("black-hole-card-index")}>{String(index + 1).padStart(2, "0")}</span>
      <span className={cx("black-hole-card-copy")}>
        <small>{blackHole.milestone}</small>
        <strong>{blackHole.name}</strong>
        <span>
          {blackHoleKindLabel(blackHole)} · {blackHole.host}
        </span>
      </span>
      <span className={cx("black-hole-provenance")}>
        {blackHole.provenance === "observed" ? "OBSERVED" : "PROCEDURAL"} ·{" "}
        {blackHole.status.toUpperCase()}
      </span>
      <span className={cx("black-hole-card-metrics")}>
        <span>{formatBlackHoleMass(blackHole.massSolar)}</span>
        <span>{formatDistance(blackHole)}</span>
      </span>
      <span className={cx("black-hole-card-action")}>CROSS THE HORIZON ↗</span>
    </button>
    {blackHole.provenance === "observed" && blackHole.source.url ? (
      <a href={blackHole.source.url} target="_blank" rel="noreferrer">
        SOURCE · {blackHole.source.archive} · {blackHole.source.retrievedOn} ↗
      </a>
    ) : null}
  </article>
);

const viewCopy: Record<AtlasView, { eyebrow: string; summary: string; title: string }> = {
  featured: {
    eyebrow: "THE HORIZON FIVE",
    summary:
      "Five celebrated real black holes. Measurements remain observational; each live scene is an interpretive gravitational-lensing visualization.",
    title: "Where light loses the way out.",
  },
  observed: {
    eyebrow: "BLACKCAT · CDS/VIZIER",
    summary:
      "Cataloged stellar-mass X-ray binaries. Dynamical systems are marked confirmed; other transients remain candidates and may have no reliable mass.",
    title: "Observed systems, honestly labeled.",
  },
  procedural: {
    eyebrow: "EXORA CUSTOM GENERATOR",
    summary:
      "Deterministic synthetic parameter sets for exploration. These are not astronomical discoveries and their values are not telescope measurements.",
    title: "Invent a horizon, not a discovery.",
  },
};

export const BlackHoleCatalog = ({
  embedded = false,
  onClose,
  onSelect,
}: BlackHoleCatalogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<AtlasView>("featured");
  const [observed, setObserved] = useState<BlackHoleProfile[]>([]);
  const [observedState, setObservedState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [observedStale, setObservedStale] = useState(false);
  const [seed, setSeed] = useState(42);
  const [count, setCount] = useState(8);
  const [procedural, setProcedural] = useState(() =>
    generateProceduralBlackHoles({ count: 8, seed: 42 }),
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!embedded) dialog?.showModal();
    return () => dialog?.close();
  }, [embedded]);

  useEffect(() => {
    if (view !== "observed" || observedState !== "idle") return;
    const controller = new AbortController();
    setObservedState("loading");
    void loadObservedBlackHoles(50, { signal: controller.signal })
      .then((result) => {
        setObserved(result.blackHoles);
        setObservedStale(result.stale);
        setObservedState("ready");
      })
      .catch(() => {
        setObservedState(controller.signal.aborted ? "idle" : "error");
      });
    return () => controller.abort();
  }, [view]);

  const records = view === "featured" ? BLACK_HOLES : view === "observed" ? observed : procedural;
  const copy = viewCopy[view];
  const generate = (): void => {
    const safeCount = Math.max(1, Math.min(Math.trunc(count), 100));
    const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 42;
    setCount(safeCount);
    setSeed(safeSeed);
    setProcedural(generateProceduralBlackHoles({ count: safeCount, seed: safeSeed }));
  };
  const generateMore = (): void => {
    const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 42;
    const nextCount = Math.min((Number.isFinite(count) ? Math.trunc(count) : 8) + 8, 100);
    setCount(nextCount);
    setSeed(safeSeed);
    setProcedural(generateProceduralBlackHoles({ count: nextCount, seed: safeSeed }));
  };

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
              <p>HYBRID BLACK-HOLE ATLAS</p>
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

        <div className={cx("black-hole-tabs")} role="tablist" aria-label="Black hole sources">
          {(["featured", "observed", "procedural"] as const).map((tab) => (
            <button
              id={`black-hole-tab-${tab}`}
              key={tab}
              type="button"
              role="tab"
              aria-controls={`black-hole-panel-${tab}`}
              aria-selected={view === tab}
              tabIndex={view === tab ? 0 : -1}
              onClick={() => setView(tab)}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        {!embedded ? (
          <section
            className={cx("black-hole-catalog-hero")}
            aria-labelledby="black-hole-atlas-title"
          >
            <div>
              <p>{copy.eyebrow}</p>
              <h2 id="black-hole-atlas-title">{copy.title}</h2>
            </div>
            <p>{copy.summary}</p>
          </section>
        ) : null}

        {view === "procedural" ? (
          <div className={cx("black-hole-generator-controls")}>
            <label>
              Seed
              <input
                aria-label="Procedural seed"
                type="number"
                value={seed}
                onChange={(event) => setSeed(event.currentTarget.valueAsNumber)}
              />
            </label>
            <label>
              Count
              <input
                aria-label="Procedural count"
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(event) => setCount(event.currentTarget.valueAsNumber)}
              />
            </label>
            <button type="button" onClick={generate}>
              GENERATE
            </button>
            <button type="button" onClick={generateMore}>
              GENERATE MORE
            </button>
          </div>
        ) : null}

        <div
          id={`black-hole-panel-${view}`}
          role="tabpanel"
          aria-labelledby={`black-hole-tab-${view}`}
        >
          {view === "observed" && observedState === "loading" ? (
            <p className={cx("black-hole-catalog-state")} role="status">
              LOADING BLACKCAT OBSERVATIONS…
            </p>
          ) : null}
          {view === "observed" && observedState === "error" ? (
            <p className={cx("black-hole-catalog-state")} role="alert">
              THE OBSERVED CATALOG COULD NOT BE LOADED.
            </p>
          ) : null}
          {view === "observed" && observedState === "ready" && observed.length === 0 ? (
            <p className={cx("black-hole-catalog-state")}>NO OBSERVED RECORDS ARE AVAILABLE.</p>
          ) : null}
          {view === "observed" && observedStale ? (
            <p className={cx("black-hole-catalog-state")}>
              USING A CACHED OR CHECKED-IN BLACKCAT SNAPSHOT.
            </p>
          ) : null}
          {records.length > 0 ? (
            <ol className={cx("black-hole-grid")}>
              {records.map((blackHole, index) => (
                <li key={blackHole.id}>
                  <BlackHoleCard blackHole={blackHole} index={index} onSelect={onSelect} />
                </li>
              ))}
            </ol>
          ) : null}
        </div>

        <p className={cx("black-hole-method-note")}>
          OBSERVED RECORDS RETAIN CATALOG ATTRIBUTION. PROCEDURAL RECORDS ARE SYNTHETIC EXORA
          PARAMETER SETS, NEVER CLAIMED AS DISCOVERIES OR TELESCOPE MEASUREMENTS. LIVE SCENES REMAIN
          INTERPRETIVE.
        </p>
      </div>
    </dialog>
  );
};
