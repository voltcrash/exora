import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AsteroidProfile } from "../solar-asteroids.ts";
import { SOLAR_SYSTEM_ASTEROIDS } from "../solar-asteroids.ts";
import type { CometProfile } from "../solar-comets.ts";
import { SOLAR_SYSTEM_COMETS } from "../solar-comets.ts";
import {
  SOLAR_SYSTEM_CATALOG_GROUPS,
  SOLAR_SYSTEM_DWARF_MOONS,
  SOLAR_SYSTEM_MOONS,
} from "../solar-system.ts";

interface SolarSystemCatalogProps {
  onClose: () => void;
  onSelectAsteroid: (asteroid: AsteroidProfile) => void;
  onSelectComet: (comet: CometProfile) => void;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
}

export const SolarSystemCatalog = ({
  onClose,
  onSelectAsteroid,
  onSelectComet,
  onSelectPlanet,
  onSelectStar,
}: SolarSystemCatalogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState<
    "all" | "asteroids" | "comets" | "dwarfs" | "moons" | "planets"
  >("all");
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

  const visibleAsteroids = useMemo(
    () =>
      SOLAR_SYSTEM_ASTEROIDS.filter(
        (asteroid) =>
          (filter === "all" || filter === "asteroids") &&
          (normalizedQuery.length === 0 ||
            asteroid.aliases.some((alias) => alias.toLocaleLowerCase().includes(normalizedQuery)) ||
            asteroid.spkId.includes(normalizedQuery)),
      ),
    [filter, normalizedQuery],
  );

  const visibleComets = useMemo(
    () =>
      SOLAR_SYSTEM_COMETS.filter(
        (comet) =>
          (filter === "all" || filter === "comets") &&
          (normalizedQuery.length === 0 ||
            comet.aliases.some((alias) => alias.toLocaleLowerCase().includes(normalizedQuery)) ||
            comet.spkId.includes(normalizedQuery)),
      ),
    [filter, normalizedQuery],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="planet-catalog solar-system-catalog"
      aria-labelledby="solar-system-title"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="catalog-scroll-region">
        <div className="catalog-header">
          <div>
            <p>HOME COORDINATES · NASA/JPL SOLAR SYSTEM DYNAMICS</p>
            <h2 id="solar-system-title">It’s time to go home</h2>
          </div>
          <button
            className="catalog-close"
            type="button"
            aria-label="Close Solar System catalog"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="solar-system-hero">
          <span>THE SOLAR SYSTEM</span>
          <strong>Known worlds. Real surfaces. Our cosmic address.</strong>
          <small>
            Every body keeps its permanent JPL/NAIF identity · {SOLAR_SYSTEM_MOONS.length} principal
            mission-mapped moons · {SOLAR_SYSTEM_DWARF_MOONS.length} unresolved dwarf-planet moons
          </small>
        </div>
        <div className="solar-catalog-tools" role="search">
          <label>
            <span>SEARCH HOME SYSTEM</span>
            <input
              type="search"
              value={query}
              placeholder="Name, designation, or SPK ID"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="solar-catalog-filters" aria-label="Filter Solar System catalog">
            {(["all", "planets", "dwarfs", "moons", "asteroids", "comets"] as const).map(
              (option) => (
                <button
                  className={filter === option ? "active" : ""}
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                >
                  {option.toUpperCase()}
                </button>
              ),
            )}
          </div>
        </div>
        {visibleGroups.map((group) => (
          <section className="solar-catalog-section" key={group.label}>
            <h3>{group.label}</h3>
            <ol className="solar-body-grid">
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
                        className={`solar-body-portrait${identity?.texture ? " mapped" : ""} solar-${entry.profile.name.toLocaleLowerCase().replaceAll(" ", "-")}`}
                        style={
                          identity?.texture
                            ? { backgroundImage: `url(${identity.texture.path})` }
                            : undefined
                        }
                        aria-hidden="true"
                      />
                      <span className="solar-body-copy">
                        <small>
                          {identity?.bodyType.toUpperCase()}
                          {identity?.parent ? ` · ${identity.parent}` : ""}
                        </small>
                        <strong>{entry.profile.name}</strong>
                        <span>{identity?.summary}</span>
                        {identity?.surfaceStatus ? (
                          <em className={`science-status science-status-${identity.surfaceStatus}`}>
                            {identity.surfaceStatus === "mapped"
                              ? "MEASURED MISSION SURFACE"
                              : identity.surfaceStatus === "modeled"
                                ? "MEASURED SHAPE · UNRESOLVED SURFACE"
                                : "UNRESOLVED SURFACE"}
                          </em>
                        ) : null}
                      </span>
                      <span className="solar-body-meta">
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
        {visibleAsteroids.length > 0 ? (
          <section className="solar-catalog-section" key="mission-asteroids">
            <h3>Asteroids · mission encounters and targets</h3>
            <ol className="solar-body-grid">
              {visibleAsteroids.map((asteroid) => (
                <li key={asteroid.id}>
                  <button type="button" onClick={() => onSelectAsteroid(asteroid)}>
                    <span className="solar-body-portrait asteroid-portrait" aria-hidden="true">
                      ◇
                    </span>
                    <span className="solar-body-copy">
                      <small>ASTEROID · {asteroid.parent}</small>
                      <strong>{asteroid.name}</strong>
                      <span>{asteroid.summary}</span>
                      <em className={`science-status science-status-${asteroid.evidence.geometry}`}>
                        {asteroid.descriptor.shapeModel
                          ? "MEASURED MISSION SHAPE · NEUTRAL SURFACE"
                          : "MEASURED DIMENSIONS · UNRESOLVED SURFACE"}
                      </em>
                    </span>
                    <span className="solar-body-meta">
                      <small>SPK {asteroid.spkId}</small>
                      <strong>TRAVEL ↗</strong>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {visibleComets.length > 0 ? (
          <section className="solar-catalog-section" key="landmark-comets">
            <h3>Comets · measured nuclei and simulated activity</h3>
            <ol className="solar-body-grid">
              {visibleComets.map((comet) => (
                <li key={comet.id}>
                  <button type="button" onClick={() => onSelectComet(comet)}>
                    <span className="solar-body-portrait comet-portrait" aria-hidden="true">
                      ☄
                    </span>
                    <span className="solar-body-copy">
                      <small>COMET · {comet.parent}</small>
                      <strong>{comet.name}</strong>
                      <span>{comet.summary}</span>
                      <em className={`science-status science-status-${comet.evidence.geometry}`}>
                        {comet.descriptor.shapeModel
                          ? "MEASURED NUCLEUS · SIMULATED TRANSIENT MATERIAL"
                          : comet.evidence.geometry === "modeled-fragment"
                            ? "MODELED FRAGMENT · UNRESOLVED SURFACE"
                            : "MEASURED DIMENSIONS · UNRESOLVED SURFACE"}
                      </em>
                    </span>
                    <span className="solar-body-meta">
                      <small>SPK {comet.spkId}</small>
                      <strong>TRAVEL ↗</strong>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {visibleGroups.length === 0 &&
        visibleAsteroids.length === 0 &&
        visibleComets.length === 0 ? (
          <p className="solar-catalog-empty" role="status">
            NO HOME-SYSTEM OBJECTS MATCH THIS FILTER
          </p>
        ) : null}
      </div>
    </dialog>
  );
};
