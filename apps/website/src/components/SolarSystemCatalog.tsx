import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SolarRegionProfile } from "../solar-regions.ts";
import { SOLAR_SYSTEM_REGIONS } from "../solar-regions.ts";
import { SOLAR_SYSTEM_CATALOG_GROUPS, SOLAR_SYSTEM_MOONS } from "../solar-system.ts";
import sharedStyles from "./ExperienceShared.module.css";
import catalogStyles from "./CatalogShared.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles, catalogStyles);

interface SolarSystemCatalogProps {
  embedded?: boolean;
  onClose: () => void;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectRegion: (region: SolarRegionProfile) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
}

export const SolarSystemCatalog = ({
  embedded = false,
  onClose,
  onSelectPlanet,
  onSelectRegion,
  onSelectStar,
}: SolarSystemCatalogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState<"all" | "dwarfs" | "moons" | "planets" | "regions">("all");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const visibleGroups = useMemo(
    () =>
      SOLAR_SYSTEM_CATALOG_GROUPS.map((group) => ({
        ...group,
        entries: group.entries.filter((entry) => {
          const bodyType = entry.profile.solarSystem?.bodyType;
          const category =
            bodyType === "moon" ? "moons" : bodyType === "dwarf-planet" ? "dwarfs" : "planets";
          return (
            (filter === "all" || filter === category) &&
            (normalizedQuery.length === 0 ||
              entry.profile.name.toLocaleLowerCase().includes(normalizedQuery) ||
              entry.profile.solarSystem?.spkId?.includes(normalizedQuery))
          );
        }),
      })).filter((group) => group.entries.length > 0),
    [filter, normalizedQuery],
  );

  const visibleRegions = useMemo(
    () =>
      SOLAR_SYSTEM_REGIONS.filter(
        (region) =>
          (filter === "all" || filter === "regions") &&
          (normalizedQuery.length === 0 ||
            region.name.toLocaleLowerCase().includes(normalizedQuery) ||
            region.aliases.some((alias) => alias.toLocaleLowerCase().includes(normalizedQuery)) ||
            region.sources.some((source) =>
              source.datasetId.toLocaleLowerCase().includes(normalizedQuery),
            )),
      ),
    [filter, normalizedQuery],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!embedded) dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, [embedded]);

  return (
    <dialog
      ref={dialogRef}
      className={cx(`planet-catalog solar-system-catalog${embedded ? " embedded-catalog" : ""}`)}
      data-embedded={embedded}
      open={embedded || undefined}
      role={embedded ? "region" : undefined}
      aria-label={embedded ? "Solar System catalog" : undefined}
      aria-labelledby={embedded ? undefined : "solar-system-title"}
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
              <p>HOME COORDINATES · NASA/JPL SOLAR SYSTEM DYNAMICS</p>
              <h2 id="solar-system-title">It’s time to go home</h2>
            </div>
            <button
              className={cx("catalog-close")}
              type="button"
              aria-label="Close Solar System catalog"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        ) : null}
        {!embedded ? (
          <div className={cx("solar-system-hero")}>
            <span>THE SOLAR SYSTEM</span>
            <strong>Known worlds. Real surfaces. Our cosmic address.</strong>
            <small>
              Every body keeps its permanent JPL/NAIF identity · {SOLAR_SYSTEM_MOONS.length}{" "}
              principal mapped moons
            </small>
          </div>
        ) : null}
        <div className={cx("solar-catalog-tools")} role="search">
          <label>
            <span>SEARCH HOME SYSTEM</span>
            <span className={cx("solar-search-field")}>
              <input
                type="search"
                value={query}
                placeholder="Name or SPK ID"
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
          </label>
          <div className={cx("solar-catalog-filters")} aria-label="Filter Solar System catalog">
            {(["all", "planets", "dwarfs", "moons", "regions"] as const).map((option) => (
              <button
                className={cx(filter === option ? "active" : "")}
                key={option}
                type="button"
                onClick={() => setFilter(option)}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {visibleGroups.map((group) => (
          <section className={cx("solar-catalog-section")} key={group.label}>
            <h3>{group.label}</h3>
            <ol className={cx("solar-body-grid")}>
              {group.entries.map((entry) => {
                const identity = entry.profile.solarSystem;
                return (
                  <li key={entry.profile.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (entry.type === "star") onSelectStar(entry.profile, true);
                        else onSelectPlanet(entry.profile, true);
                      }}
                    >
                      <span
                        className={cx(
                          `solar-body-portrait${identity?.texture ? " mapped" : ""} solar-${entry.profile.name.toLocaleLowerCase().replaceAll(" ", "-")}`,
                        )}
                        style={
                          identity?.texture
                            ? { backgroundImage: `url(${identity.texture.path})` }
                            : undefined
                        }
                        aria-hidden="true"
                      />
                      <span className={cx("solar-body-copy")}>
                        <small>
                          {identity?.bodyType.toUpperCase()}
                          {identity?.parent ? ` · ${identity.parent}` : ""}
                        </small>
                        <strong>{entry.profile.name}</strong>
                        <span>{identity?.summary}</span>
                        {identity?.surfaceStatus ? (
                          <em
                            className={cx(
                              `science-status science-status-${identity.surfaceStatus}`,
                            )}
                          >
                            {identity.surfaceStatus === "mapped"
                              ? "MEASURED MISSION SURFACE"
                              : identity.surfaceStatus === "modeled"
                                ? "MEASURED SHAPE · UNRESOLVED SURFACE"
                                : "UNRESOLVED SURFACE"}
                          </em>
                        ) : null}
                      </span>
                      <span className={cx("solar-body-meta")}>
                        <small>
                          {identity?.spkId ? `SPK ${identity.spkId}` : `NAIF ${identity?.naifId}`}
                        </small>
                        <strong>TRAVEL ↗</strong>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        {visibleRegions.length > 0 ? (
          <section className={cx("solar-catalog-section")} key="solar-system-regions">
            <h3>Regions · statistical populations and measured boundaries</h3>
            <ol className={cx("solar-body-grid")}>
              {visibleRegions.map((region) => (
                <li key={region.id}>
                  <button type="button" onClick={() => onSelectRegion(region)}>
                    <span
                      className={cx(
                        `solar-body-portrait region-portrait region-portrait-${region.kind}`,
                      )}
                      aria-hidden="true"
                    >
                      ◎
                    </span>
                    <span className={cx("solar-body-copy")}>
                      <small>REGION · {region.parent}</small>
                      <strong>{region.name}</strong>
                      <span>{region.summary}</span>
                      <em className={cx(`science-status science-status-${region.evidence}`)}>
                        {region.evidence.replaceAll("-", " ").toUpperCase()} · SAMPLED VISUALIZATION
                      </em>
                    </span>
                    <span className={cx("solar-body-meta")}>
                      <small>ANCHOR NAIF {region.anchorNaifId}</small>
                      <strong>EXPLORE ↗</strong>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {visibleGroups.length === 0 && visibleRegions.length === 0 ? (
          <p className={cx("solar-catalog-empty")} role="status">
            NO HOME-SYSTEM OBJECTS MATCH THIS FILTER
          </p>
        ) : null}
      </div>
    </dialog>
  );
};
