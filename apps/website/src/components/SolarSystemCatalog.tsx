import type {
  ExoplanetProfile,
  SmallBodyLookup,
  SmallBodyParameter,
  SmallBodySearchResponse,
  StarProfile,
} from "@exora/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { searchSmallBodies } from "../api-client.ts";
import type { AsteroidProfile } from "../solar-asteroids.ts";
import { SOLAR_SYSTEM_ASTEROIDS } from "../solar-asteroids.ts";
import type { CometProfile } from "../solar-comets.ts";
import { SOLAR_SYSTEM_COMETS } from "../solar-comets.ts";
import type { SolarRegionProfile } from "../solar-regions.ts";
import { SOLAR_SYSTEM_REGIONS } from "../solar-regions.ts";
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
  onSelectRegion: (region: SolarRegionProfile) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
}

const parameterReading = ({ uncertainty, units, value }: SmallBodyParameter): string =>
  value + (uncertainty ? " ± " + uncertainty : "") + (units ? " " + units : "");

export const SolarSystemCatalog = ({
  onClose,
  onSelectAsteroid,
  onSelectComet,
  onSelectPlanet,
  onSelectRegion,
  onSelectStar,
}: SolarSystemCatalogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sbdbAbort = useRef<AbortController | null>(null);
  const [filter, setFilter] = useState<
    "all" | "asteroids" | "comets" | "dwarfs" | "moons" | "planets" | "regions"
  >("all");
  const [query, setQuery] = useState("");
  const [sbdbRequest, setSbdbRequest] = useState<"error" | "idle" | "loading">("idle");
  const [sbdbResult, setSbdbResult] = useState<SmallBodySearchResponse | null>(null);
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
    dialog?.showModal();
    return () => {
      sbdbAbort.current?.abort();
      dialog?.close();
    };
  }, []);

  const searchJpl = async (value: string, lookup: SmallBodyLookup = "auto"): Promise<void> => {
    const requested = value.trim();
    if (!requested) return;
    sbdbAbort.current?.abort();
    const controller = new AbortController();
    sbdbAbort.current = controller;
    setSbdbRequest("loading");
    setSbdbResult(null);
    try {
      const result = await searchSmallBodies(requested, { lookup, signal: controller.signal });
      if (controller.signal.aborted) return;
      setSbdbResult(result);
      setSbdbRequest("idle");
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error(error);
      setSbdbRequest("error");
    }
  };

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
        <form
          className="solar-catalog-tools"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            void searchJpl(query);
          }}
        >
          <label>
            <span>SEARCH HOME SYSTEM</span>
            <span className="solar-search-field">
              <input
                type="search"
                value={query}
                placeholder="Name, designation, or SPK ID"
                onChange={(event) => {
                  sbdbAbort.current?.abort();
                  setSbdbRequest("idle");
                  setSbdbResult(null);
                  setQuery(event.target.value);
                }}
              />
              <button type="submit" disabled={!query.trim() || sbdbRequest === "loading"}>
                {sbdbRequest === "loading" ? "SEARCHING JPL…" : "SEARCH JPL SBDB"}
              </button>
            </span>
          </label>
          <div className="solar-catalog-filters" aria-label="Filter Solar System catalog">
            {(["all", "planets", "dwarfs", "moons", "asteroids", "comets", "regions"] as const).map(
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
        </form>
        {sbdbRequest === "error" ? (
          <section className="sbdb-search-state error" role="status">
            <strong>JPL SBDB UNAVAILABLE</strong>
            <span>The authored Home System catalog remains available below. Try again later.</span>
          </section>
        ) : null}
        {sbdbResult?.meta.status === "not-found" ? (
          <section className="sbdb-search-state" role="status">
            <strong>NO JPL SMALL-BODY MATCH</strong>
            <span>
              SBDB found no asteroid or comet for “{sbdbResult.meta.query}”. Missing data has not
              been substituted.
            </span>
          </section>
        ) : null}
        {sbdbResult?.meta.status === "ambiguous" ? (
          <section className="sbdb-ambiguity" aria-labelledby="sbdb-ambiguity-title">
            <div>
              <small>NASA/JPL SBDB {sbdbResult.meta.sourceVersion}</small>
              <h3 id="sbdb-ambiguity-title">Choose the intended designation</h3>
              <p>That name identifies more than one catalogued body. Select one exact match.</p>
            </div>
            <ol>
              {sbdbResult.matches.map((match) => (
                <li key={match.designation}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(match.designation);
                      void searchJpl(match.designation, "designation");
                    }}
                  >
                    <strong>{match.name}</strong>
                    <span>DES {match.designation} ↗</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {sbdbResult?.data ? (
          <section className="sbdb-result" aria-labelledby="sbdb-result-title">
            <header>
              <span className="solar-body-portrait asteroid-portrait" aria-hidden="true">
                {sbdbResult.data.kind === "comet" ? "☄" : "◇"}
              </span>
              <div>
                <small>
                  LIVE CATALOG RECORD · NASA/JPL SBDB {sbdbResult.meta.sourceVersion}
                  {sbdbResult.meta.stale
                    ? " · STALE CACHE"
                    : sbdbResult.meta.cached
                      ? " · CACHE"
                      : ""}
                </small>
                <h3 id="sbdb-result-title">{sbdbResult.data.fullName}</h3>
                <p>
                  {sbdbResult.data.kind.toUpperCase()} ·{" "}
                  {sbdbResult.data.orbitClass
                    ? sbdbResult.data.orbitClass.name + " (" + sbdbResult.data.orbitClass.code + ")"
                    : "ORBIT CLASS NOT REPORTED"}
                </p>
                <div className="sbdb-badges" aria-label="Small-body classification flags">
                  <span>DES {sbdbResult.data.designation}</span>
                  <span>SPK {sbdbResult.data.spkId}</span>
                  <span>
                    {sbdbResult.data.nearEarth === null
                      ? "NEO STATUS MISSING"
                      : sbdbResult.data.nearEarth
                        ? "NEAR-EARTH OBJECT"
                        : "NOT A NEAR-EARTH OBJECT"}
                  </span>
                  <span className={sbdbResult.data.potentiallyHazardous ? "hazard" : undefined}>
                    {sbdbResult.data.potentiallyHazardous === null
                      ? "PHA STATUS MISSING"
                      : sbdbResult.data.potentiallyHazardous
                        ? "POTENTIALLY HAZARDOUS"
                        : "NOT POTENTIALLY HAZARDOUS"}
                  </span>
                </div>
              </div>
            </header>
            <div className="sbdb-data-grid">
              <section>
                <h4>Orbital elements · J2000</h4>
                <p className="sbdb-solution-note">
                  SOLUTION {sbdbResult.data.orbit.solutionId ?? "NOT REPORTED"} · CONDITION CODE{" "}
                  {sbdbResult.data.orbit.conditionCode ?? "NOT REPORTED"} · EPOCH JD{" "}
                  {sbdbResult.data.orbit.epochJulianDate ?? "NOT REPORTED"}
                </p>
                {sbdbResult.data.orbit.elements.length > 0 ? (
                  <dl>
                    {sbdbResult.data.orbit.elements.map((item) => (
                      <div key={item.name}>
                        <dt>{item.title}</dt>
                        <dd>{parameterReading(item)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="sbdb-missing">No orbital elements were reported by SBDB.</p>
                )}
              </section>
              <section>
                <h4>Physical parameters</h4>
                {sbdbResult.data.physicalParameters.length > 0 ? (
                  <dl>
                    {sbdbResult.data.physicalParameters.map((item) => (
                      <div key={item.name}>
                        <dt>{item.title}</dt>
                        <dd>{parameterReading(item)}</dd>
                        {item.reference ? <small>{item.reference}</small> : null}
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="sbdb-missing">
                    No physical parameters are available in this SBDB record.
                  </p>
                )}
              </section>
              <section>
                <h4>Earth close approaches</h4>
                {sbdbResult.data.closeApproaches.length > 0 ? (
                  <ol className="sbdb-approaches">
                    {sbdbResult.data.closeApproaches.map((approach) => (
                      <li key={approach.calendarDate + "-" + approach.distanceAu}>
                        <strong>{approach.calendarDate} UTC</strong>
                        <span>{approach.distanceAu.toPrecision(6)} AU nominal</span>
                        <small>
                          {approach.distanceMinimumAu !== null &&
                          approach.distanceMaximumAu !== null
                            ? approach.distanceMinimumAu.toPrecision(6) +
                              "–" +
                              approach.distanceMaximumAu.toPrecision(6) +
                              " AU uncertainty range"
                            : "DISTANCE UNCERTAINTY NOT REPORTED"}
                          {approach.relativeVelocityKilometersPerSecond !== null
                            ? " · " +
                              approach.relativeVelocityKilometersPerSecond.toFixed(2) +
                              " km/s relative"
                            : " · VELOCITY NOT REPORTED"}
                        </small>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="sbdb-missing">
                    No Earth close approaches are available in this SBDB response.
                  </p>
                )}
              </section>
            </div>
            <footer>
              Values and uncertainties are reproduced from JPL’s current orbit solution. This live
              catalog record has no authored Exora shape or surface and is not rendered as a sphere.
            </footer>
          </section>
        ) : null}
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
        {visibleRegions.length > 0 ? (
          <section className="solar-catalog-section" key="solar-system-regions">
            <h3>Regions · statistical populations and measured boundaries</h3>
            <ol className="solar-body-grid">
              {visibleRegions.map((region) => (
                <li key={region.id}>
                  <button type="button" onClick={() => onSelectRegion(region)}>
                    <span
                      className={`solar-body-portrait region-portrait region-portrait-${region.kind}`}
                      aria-hidden="true"
                    >
                      ◎
                    </span>
                    <span className="solar-body-copy">
                      <small>REGION · {region.parent}</small>
                      <strong>{region.name}</strong>
                      <span>{region.summary}</span>
                      <em className={`science-status science-status-${region.evidence}`}>
                        {region.evidence.replaceAll("-", " ").toUpperCase()} · SAMPLED VISUALIZATION
                      </em>
                    </span>
                    <span className="solar-body-meta">
                      <small>ANCHOR NAIF {region.anchorNaifId}</small>
                      <strong>EXPLORE ↗</strong>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {visibleGroups.length === 0 &&
        visibleAsteroids.length === 0 &&
        visibleComets.length === 0 &&
        visibleRegions.length === 0 ? (
          <p className="solar-catalog-empty" role="status">
            NO HOME-SYSTEM OBJECTS MATCH THIS FILTER
          </p>
        ) : null}
      </div>
    </dialog>
  );
};
