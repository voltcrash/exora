import type { StarProfile } from "@exora/contracts";
import { useEffect, useRef, useState } from "react";
import { searchStars } from "../api-client.ts";
import { formatNumber } from "../planet-utils.tsx";
import { starKindLabel } from "../star-utils.ts";

interface StarCatalogProps {
  onClose: () => void;
  onSelect: (star: StarProfile, cached: boolean) => void;
  open: boolean;
}

type SearchState = "loading" | "ready" | "error";

export const StarCatalog = ({ onClose, onSelect, open }: StarCatalogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [stars, setStars] = useState<StarProfile[]>([]);
  const [cached, setCached] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>("loading");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, query]);

  const status =
    searchState === "loading"
      ? query.trim().length >= 2
        ? `Resolving “${query.trim()}” in SIMBAD…`
        : "Loading a guided set of nearby and notable stars…"
      : searchState === "error"
        ? "The SIMBAD signal is unavailable. Try again shortly."
        : query.trim().length < 2
          ? `${stars.length} destinations selected from the SIMBAD archive.`
          : `${stars.length} exact ${stars.length === 1 ? "match" : "matches"}${cached ? " · cached result" : ""}.`;

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
          <p>SIMBAD · CDS STRASBOURG · STELLAR OBJECTS</p>
          <h2 id="star-catalog-title">Choose a star to observe</h2>
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
      <div className="catalog-search">
        <span className="star-search-mark" aria-hidden="true">
          ✦
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Enter an exact name: Sirius, Betelgeuse, Vega…"
          autoComplete="off"
          aria-describedby="star-catalog-status"
        />
        <span className="search-key">ESC</span>
      </div>
      <div className="catalog-meta">
        <p id="star-catalog-status" role="status">
          {status}
        </p>
        <span>Names · spectrum · astrometry</span>
      </div>
      <ol className="catalog-results">
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
