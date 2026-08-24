import { useEffect, useRef } from "react";
import {
  BLACK_HOLES,
  blackHoleKindLabel,
  formatBlackHoleMass,
  type BlackHoleProfile,
} from "../black-holes.ts";
import { BlackHoleCatalogVisual } from "./CatalogVisual.tsx";

interface BlackHoleCatalogProps {
  embedded?: boolean;
  onClose: () => void;
  onSelect: (blackHole: BlackHoleProfile) => void;
}

const formatDistance = (blackHole: BlackHoleProfile): string => {
  if (blackHole.distanceLightYears === null) {
    return blackHole.observation.redshift === null
      ? "DISTANCE UNREPORTED"
      : `REDSHIFT z ${blackHole.observation.redshift}`;
  }
  if (blackHole.distanceLightYears >= 1_000_000) {
    return `${(blackHole.distanceLightYears / 1_000_000).toLocaleString("en-US", {
      maximumFractionDigits: 1,
    })} MILLION LY`;
  }
  return `${blackHole.distanceLightYears.toLocaleString("en-US")} LY`;
};

export const BlackHoleCatalog = ({
  embedded = false,
  onClose,
  onSelect,
}: BlackHoleCatalogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!embedded) dialog?.showModal();
    return () => dialog?.close();
  }, [embedded]);

  return (
    <dialog
      ref={dialogRef}
      className={`planet-catalog black-hole-catalog${embedded ? " embedded-catalog" : ""}`}
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
      <div className="catalog-scroll-region">
        {!embedded ? (
          <div className="catalog-header">
            <div>
              <p>COMPACT OBJECT ATLAS · NASA / EHT / ESA</p>
              <h2 id="black-hole-catalog-title">Choose an event horizon</h2>
            </div>
            <button
              className="catalog-close"
              type="button"
              aria-label="Close black hole catalog"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        ) : null}

        <section className="black-hole-catalog-hero" aria-labelledby="black-hole-atlas-title">
          <div>
            <p>THE HORIZON FIVE</p>
            <h2 id="black-hole-atlas-title">Where light loses the way out.</h2>
          </div>
          <p>
            Five celebrated real black holes, from our nearest dormant neighbor to an ultramassive
            quasar. Measurements remain observational; each live scene is an interpretive
            gravitational-lensing visualization.
          </p>
        </section>

        <ol className="black-hole-grid">
          {BLACK_HOLES.map((blackHole, index) => (
            <li key={blackHole.id}>
              <article className="black-hole-card">
                <button type="button" onClick={() => onSelect(blackHole)}>
                  <BlackHoleCatalogVisual blackHole={blackHole} />
                  <span className="black-hole-card-index">0{index + 1}</span>
                  <span className="black-hole-card-copy">
                    <small>{blackHole.milestone}</small>
                    <strong>{blackHole.name}</strong>
                    <span>
                      {blackHoleKindLabel(blackHole)} · {blackHole.host}
                    </span>
                  </span>
                  <span className="black-hole-card-metrics">
                    <span>{formatBlackHoleMass(blackHole.massSolar)}</span>
                    <span>{formatDistance(blackHole)}</span>
                  </span>
                  <span className="black-hole-card-action">CROSS THE HORIZON ↗</span>
                </button>
                <a href={blackHole.source.url} target="_blank" rel="noreferrer">
                  SOURCE · {blackHole.source.archive} · {blackHole.source.retrievedOn} ↗
                </a>
              </article>
            </li>
          ))}
        </ol>

        <p className="black-hole-method-note">
          SIZE REFERENCE · CARD MASSES COME FROM THE LINKED OBSERVATORY OR PEER-REVIEWED RECORD ·
          EVENT-HORIZON SIZE IN THE LIVE VIEW IS CALCULATED AS A NON-SPINNING SCHWARZSCHILD
          REFERENCE, NOT A DIRECT IMAGE.
        </p>
      </div>
    </dialog>
  );
};
