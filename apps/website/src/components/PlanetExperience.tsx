import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { deriveWorldRecipe, WORLDGEN_VERSION, type WorldRecipe } from "@exora/worldgen";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PlanetLoadResult } from "../api-client.ts";
import { warmDestinations } from "../destination-cache.ts";
import type { ViewMode } from "../planet-scene.ts";
import { formatMeasurement, formatNumber, formatPlanetName } from "../planet-utils.tsx";
import type { PlanetarySubsystem } from "../planetary-subsystems.ts";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import { SURFACE_TRANSITION_MS, type TravelPhase } from "../travel-transition.ts";
import { FrameRateSignal } from "./FrameRateSignal.tsx";
import { MissionControl } from "./MissionControl.tsx";
import { MobileSheet } from "./MobileSheet.tsx";
import sharedStyles from "./ExperienceShared.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles);

interface PlanetExperienceProps {
  chromeHidden: boolean;
  host: SceneHost | null;
  onToggleChrome: () => void;
  onOpenDiscover: () => void;
  onSelectHostStar: (hostStar: string) => Promise<boolean>;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
  onSelectSystem: (hostStar: string) => Promise<boolean>;
  recipeOverride: WorldRecipe | null;
  result: PlanetLoadResult;
  travelPhase: TravelPhase;
}

export const PlanetExperience = ({
  chromeHidden,
  host,
  onToggleChrome,
  onOpenDiscover,
  onSelectHostStar,
  onSelectPlanet,
  onSelectStar,
  onSelectSystem,
  recipeOverride,
  result,
  travelPhase,
}: PlanetExperienceProps) => {
  const [fps, setFps] = useState("--");
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "error">("loading");
  const [sceneMode, setSceneMode] = useState<"subsystem" | "world">("world");
  const [subsystem, setSubsystem] = useState<PlanetarySubsystem | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("orbit");
  const [xrStatus, setXrStatus] = useState<XrStatus>("checking");
  const [hostJumpState, setHostJumpState] = useState<"idle" | "loading" | "error">("idle");
  const [systemJumpState, setSystemJumpState] = useState<"idle" | "loading" | "error">("idle");
  const [orbitMenuOpen, setOrbitMenuOpen] = useState(false);
  const [findSolarWorld, setFindSolarWorld] = useState<
    ((name: string) => ExoplanetProfile | null) | null
  >(null);
  const hostJumpRef = useRef(false);
  const findSolarWorldRef = useRef<((name: string) => ExoplanetProfile | null) | null>(null);
  findSolarWorldRef.current = findSolarWorld;
  const planet = result.planet;
  const solar = result.mode === "solar";
  const solarIdentity = planet.solarSystem;
  const subsystemActive = sceneMode === "subsystem" && subsystem !== null;
  const isMoon = solarIdentity?.bodyType === "moon";
  const observation = planet.observation;
  const recipe = useMemo(
    () => recipeOverride ?? deriveWorldRecipe(planet),
    [planet, recipeOverride],
  );

  useEffect(() => {
    let active = true;
    if (!solar) {
      setSubsystem(null);
      return () => {
        active = false;
      };
    }

    void Promise.all([import("../planetary-subsystems.ts"), import("../solar-system.ts")]).then(
      ([{ findPlanetarySubsystem }, solarSystem]) => {
        if (!active) return;
        setFindSolarWorld(() => solarSystem.findSolarWorld);
        setSubsystem(findPlanetarySubsystem(planet.name));
      },
    );
    return () => {
      active = false;
    };
  }, [planet.name, solar]);

  const travelling = travelPhase === "departing" || travelPhase === "crossing";
  const settled = sceneState !== "loading" || travelPhase !== "idle";

  const openHostStar = async (): Promise<void> => {
    if (result.mode === "custom" || hostJumpRef.current) return;
    hostJumpRef.current = true;
    setHostJumpState("loading");
    host?.beginTravel();
    const found = await onSelectHostStar(planet.hostStar).catch(() => false);
    hostJumpRef.current = false;
    if (!found) {
      host?.cancelTravel();
      setHostJumpState("error");
    }
  };

  const openHostSystem = async (): Promise<void> => {
    if (result.mode === "custom" || systemJumpState === "loading") return;
    setSystemJumpState("loading");
    host?.beginTravel();
    const found = await onSelectSystem(planet.hostStar).catch(() => false);
    if (!found) host?.cancelTravel();
    setSystemJumpState(found ? "idle" : "error");
  };

  useEffect(() => {
    if (result.mode !== "custom") warmDestinations(planet.hostStar);
  }, [planet.hostStar, result.mode]);

  useEffect(() => host?.onXrStatus(setXrStatus), [host]);

  useEffect(() => {
    if (!host) return;
    document.body.dataset.qualityTier = host.qualityTier;
    const fpsTimer = window.setInterval(() => {
      setFps(Math.round(host.getFps()).toString());
    }, 1_000);
    return () => window.clearInterval(fpsTimer);
  }, [host]);

  useEffect(() => {
    if (!host) return;

    let abandoned = false;
    setSceneState("loading");
    setViewMode(subsystemActive ? "subsystem" : "orbit");

    const mount = subsystemActive
      ? import("../subsystem-scene.ts").then(({ createSubsystemWorld }) =>
          host.mountWorld(() =>
            createSubsystemWorld(host, {
              onFirstFrame: () => {
                if (!abandoned) setSceneState("ready");
              },
              onSelectMoon: (name) => {
                const destination = findSolarWorldRef.current?.(name);
                if (destination) onSelectPlanet(destination, true);
              },
              planet,
              subsystem,
            }),
          ),
        )
      : import("../planet-scene.ts").then(({ createPlanetWorld }) =>
          host.mountWorld(() =>
            createPlanetWorld(host, {
              planet,
              recipe,
              onViewModeChange: setViewMode,
              ...(result.mode === "custom" ? {} : { onSelectHostStar: () => void openHostStar() }),
              onFirstFrame: () => {
                if (!abandoned) setSceneState("ready");
              },
            }),
          ),
        );

    void mount.catch((error: unknown) => {
      console.error(error);
      if (!abandoned) setSceneState("error");
    });

    return () => {
      abandoned = true;
    };
  }, [
    host,
    onSelectHostStar,
    onSelectPlanet,
    onSelectStar,
    onSelectSystem,
    planet,
    recipe,
    result.mode,
    subsystem,
    subsystemActive,
  ]);

  const useJupiterUnits =
    planet.kind === "gas-giant" ||
    (planet.kind === "unknown" &&
      observation.massEarth === null &&
      observation.radiusEarth === null);
  const massUnit = useJupiterUnits ? (
    <>
      M<sub>J</sub>
    </>
  ) : (
    <>
      M<sub>⊕</sub>
    </>
  );
  const massValue = useJupiterUnits
    ? (observation.massJupiter ?? observation.massEarth)
    : (observation.massEarth ?? observation.massJupiter);
  const radiusUnit = useJupiterUnits ? (
    <>
      R<sub>J</sub>
    </>
  ) : (
    <>
      R<sub>⊕</sub>
    </>
  );
  const radiusValue = useJupiterUnits
    ? (observation.radiusJupiter ?? observation.radiusEarth)
    : (observation.radiusEarth ?? observation.radiusJupiter);
  const localOrbitKilometers = solarIdentity?.orbitalSemiMajorAxisKilometers ?? null;

  const openPrimaryBody = (): void => {
    if (!isMoon || !solarIdentity.parent) return;
    const primary = findSolarWorld?.(solarIdentity.parent);
    if (primary) onSelectPlanet(primary, true);
  };

  return (
    <div
      className={cx(
        `experience-shell view-${viewMode} ${subsystemActive ? "subsystem-experience" : ""} ${settled ? "scene-ready" : ""} ${sceneState === "error" ? "scene-error" : ""} ${travelling ? "travelling" : ""} ${chromeHidden ? "chrome-hidden" : ""}`,
      )}
      style={{ "--surface-transition": `${SURFACE_TRANSITION_MS}ms` } as CSSProperties}
    >
      <div className={cx("space-haze")} aria-hidden="true" />
      <div className={cx("viewport-grid")} aria-hidden="true" />
      <div className={cx("surface-veil")} aria-hidden="true" />

      <header className={cx("topbar")} data-testid="topbar">
        <a className={cx("brand")} href="/" aria-label="Exora home">
          <span className={cx("brand-mark")} aria-hidden="true" />
          <span className={cx("brand-copy")}>
            <strong>EXORA</strong>
            <small>UNIVERSE OBSERVATORY</small>
          </span>
        </a>
      </header>

      <main className={cx("hud")} data-testid="hud">
        <section
          className={cx("world-intro")}
          data-testid="world-intro"
          aria-labelledby="world-name"
        >
          <p className={cx("eyebrow")}>
            <span>
              {result.mode === "custom"
                ? "GENERATED WORLD"
                : solar
                  ? "SOLAR SYSTEM WORLD"
                  : "CONFIRMED WORLD"}
            </span>
            <span>{solar ? planet.solarSystem?.bodyType : planet.kind.replace("-", " ")}</span>
          </p>
          <h1 id="world-name">{formatPlanetName(planet.name)}</h1>
          <div className={cx("world-tags")} aria-label="World classification">
            <span>{recipe.classification}</span>
            <span>
              {observation.equilibriumTemperatureKelvin === null
                ? "TEMP UNKNOWN"
                : `${formatNumber(observation.equilibriumTemperatureKelvin, 0)} K`}
            </span>
            <span>{observation.discoveryMethod}</span>
          </div>
          <p className={cx("world-summary")}>
            {solar ? planet.solarSystem?.summary : recipe.summary}
          </p>
          <p className={cx("visual-note")}>
            <span aria-hidden="true" />{" "}
            {subsystemActive
              ? "JPL MEAN ORBITS · LOG-COMPRESSED DISTANCE · BODY SIZES EXAGGERATED"
              : result.mode === "custom"
                ? `SHAREABLE URL RECIPE · WORLDGEN V${WORLDGEN_VERSION}`
                : solar
                  ? solarIdentity?.surfaceStatus === "unresolved"
                    ? "UNRESOLVED SURFACE · PHYSICALLY CONSTRAINED NEUTRAL VISUALIZATION"
                    : solarIdentity?.surfaceStatus === "modeled"
                      ? "MEASURED PROPORTIONS · UNRESOLVED NEUTRAL SURFACE"
                      : solarIdentity?.texture?.topography
                        ? "DAWN GLOBAL MOSAIC + MEASURED TOPOGRAPHY · EXORA LIGHTING"
                        : solarIdentity?.texture
                          ? isMoon
                            ? "NASA MISSION MOSAIC · MEASURED ROTATION + EXORA LIGHTING"
                            : "SPACECRAFT GLOBAL MOSAIC · EXORA ATMOSPHERE + LIGHTING"
                          : "KNOWN PLANET · PHYSICALLY TUNED ATMOSPHERIC VISUALIZATION"
                  : "PLAUSIBLE VISUALIZATION FROM OBSERVED DATA"}
          </p>
        </section>

        <aside
          className={cx("telemetry")}
          data-testid="telemetry"
          aria-label={result.mode === "custom" ? "Custom planet data" : "Observed planet data"}
        >
          <div className={cx("telemetry-heading")}>
            <span>
              <small>
                {result.mode === "custom" ? "WORLD FORGE" : solar ? "NASA/JPL" : "NASA ARCHIVE"}
              </small>
              {result.mode === "custom"
                ? "Chosen properties"
                : solar
                  ? "Planetary parameters"
                  : "Observed properties"}
            </span>
            <FrameRateSignal fps={fps} />
          </div>
          {subsystem ? (
            <div className={cx("telemetry-detail host-system-detail subsystem-switch-detail")}>
              <span>PLANETARY SUBSYSTEM</span>
              <button
                className={cx("system-jump subsystem-jump")}
                type="button"
                aria-pressed={subsystemActive}
                onClick={() => setSceneMode(subsystemActive ? "world" : "subsystem")}
              >
                <span aria-hidden="true">{subsystemActive ? "◉" : "⌾"}</span>
                <strong>
                  {subsystemActive ? `${planet.name} close view` : `${planet.name} system`}
                </strong>
                <small>{subsystemActive ? "RETURN TO WORLD" : "EXPLORE MOONS + FIELDS ↗"}</small>
              </button>
              <small>
                {subsystem.moons.length} selected moon{subsystem.moons.length === 1 ? "" : "s"} ·{" "}
                {subsystem.rings.length
                  ? `${subsystem.rings.length} ring layers`
                  : "no known rings"}{" "}
                · {subsystem.resonances.length} resonance
                {subsystem.resonances.length === 1 ? "" : "s"}
              </small>
            </div>
          ) : null}
          {subsystemActive && subsystem ? (
            <>
              <div className={cx("telemetry-detail subsystem-science-detail")}>
                <span>ORBIT EVIDENCE</span>
                <strong>MEASURED</strong>
                <small>
                  JPL mean elements preserve parent-relative distance, inclination, period, and
                  retrograde direction.
                </small>
              </div>
              <div className={cx("telemetry-detail subsystem-science-detail")}>
                <span>TRANSIENT LAYERS</span>
                <strong>SIMULATED</strong>
                <small>
                  Field boundaries, auroral brightness, plasma density, and plume particles are
                  explanatory visualizations.
                </small>
              </div>
              <div className={cx("telemetry-detail subsystem-science-detail")}>
                <span>MINOR MOONS</span>
                <strong>UNRESOLVED SURFACES</strong>
                <small>Neutral silhouettes only; no surface geography has been invented.</small>
              </div>
              <div className={cx("telemetry-detail subsystem-members")}>
                <span>SELECTED MOONS · MEAN ELEMENTS</span>
                <ul>
                  {subsystem.moons.map((candidate) => {
                    const destination = findSolarWorld?.(candidate.name);
                    return (
                      <li key={candidate.naifId}>
                        {destination ? (
                          <button
                            type="button"
                            onClick={() => onSelectPlanet(destination, true)}
                            aria-label={`Visit ${candidate.name}, NAIF ${candidate.naifId}`}
                          >
                            <strong>{candidate.name}</strong>
                            <small>VISIT ↗</small>
                          </button>
                        ) : (
                          <span>
                            <strong>{candidate.name}</strong>
                            <small>UNRESOLVED</small>
                          </span>
                        )}
                        <small>
                          NAIF {candidate.naifId} ·{" "}
                          {formatNumber(candidate.orbitalSemiMajorAxisKilometers, 0)} km ·{" "}
                          {candidate.retrograde ? "retrograde" : "prograde"} · i{" "}
                          {candidate.inclinationDegrees}°
                          {candidate.shepherds ? ` · shepherds ${candidate.shepherds}` : ""}
                        </small>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className={cx("telemetry-detail subsystem-resonances")}>
                <span>MAJOR RESONANCES</span>
                {subsystem.resonances.length ? (
                  subsystem.resonances.map((resonance) => (
                    <p key={`${resonance.ratio}-${resonance.bodies.join("-")}`}>
                      <strong>{resonance.ratio}</strong>
                      <small>{resonance.bodies.join(" · ")}</small>
                    </p>
                  ))
                ) : (
                  <small>No principal resonance authored for this view.</small>
                )}
              </div>
              <div className={cx("telemetry-detail subsystem-layer-key")}>
                <span>VISIBLE SYSTEM LAYERS</span>
                <ul>
                  {subsystem.rings.map((ring) => (
                    <li key={ring.name}>
                      <strong>{ring.name}</strong>
                      <small>MEASURED BOUNDARIES</small>
                    </li>
                  ))}
                  {subsystem.lagrangePoints.map((point) => (
                    <li key={`${point.reference}-${point.label}`}>
                      <strong>{point.label}</strong>
                      <small>{point.reference} · DERIVED MARKER</small>
                    </li>
                  ))}
                  {subsystem.magnetosphere ? (
                    <li>
                      <strong>MAGNETOSPHERE</strong>
                      <small>{subsystem.magnetosphere.evidence} BOUNDARY</small>
                    </li>
                  ) : null}
                  {subsystem.aurora ? (
                    <li>
                      <strong>AURORAL REGIONS</strong>
                      <small>{subsystem.aurora.evidence} LATITUDE · SIMULATED BRIGHTNESS</small>
                    </li>
                  ) : null}
                  {subsystem.torus ? (
                    <li>
                      <strong>{subsystem.torus.moon} PLASMA TORUS</strong>
                      <small>{subsystem.torus.evidence} STRUCTURE · SIMULATED DENSITY</small>
                    </li>
                  ) : null}
                  {subsystem.plumes.map((plume) => (
                    <li key={plume.moon}>
                      <strong>{plume.moon} PLUME</strong>
                      <small>{plume.evidence} EVIDENCE · SIMULATED PARTICLES</small>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
          <dl>
            <div>
              <dt>Mass</dt>
              <dd>
                {formatMeasurement(massValue)} <small>{massUnit}</small>
              </dd>
            </div>
            <div>
              <dt>Radius</dt>
              <dd>
                {formatMeasurement(radiusValue)} <small>{radiusUnit}</small>
              </dd>
            </div>
            <div>
              <dt>Orbit</dt>
              <dd>
                {formatMeasurement(localOrbitKilometers ?? observation.semiMajorAxisAu, 1)}{" "}
                <small>{localOrbitKilometers === null ? "AU" : "KM"}</small>
              </dd>
            </div>
            <div>
              <dt>Distance</dt>
              <dd>
                {formatMeasurement(observation.distanceParsecs, 1)} <small>PC</small>
              </dd>
            </div>
          </dl>
          <div className={cx("telemetry-detail host-system-detail")}>
            <span>HOST SYSTEM</span>
            {result.mode === "custom" ? (
              <strong>USER DEFINED</strong>
            ) : (
              <>
                <button
                  className={cx("system-jump")}
                  type="button"
                  disabled={hostJumpState === "loading"}
                  onClick={() => void openHostStar()}
                >
                  <span aria-hidden="true">☀</span>
                  <strong>{planet.hostStar}</strong>
                  <small>{hostJumpState === "loading" ? "RESOLVING…" : "VISIT STAR ↗"}</small>
                </button>
                <button
                  className={cx("system-jump diorama-jump")}
                  type="button"
                  disabled={systemJumpState === "loading"}
                  onClick={() => void openHostSystem()}
                >
                  <span aria-hidden="true">◎</span>
                  <strong>Whole system</strong>
                  <small>
                    {systemJumpState === "loading" ? "PLACING ORBITS…" : "VIEW EVERY ORBIT ↗"}
                  </small>
                </button>
              </>
            )}
            <small>
              {observation.hostSpectralType ?? "Spectrum unavailable"}
              {observation.hostTemperatureKelvin === null
                ? ""
                : ` · ${formatNumber(observation.hostTemperatureKelvin, 0)} K`}
              {observation.hostRadiusSolar === null
                ? ""
                : ` · ${formatNumber(observation.hostRadiusSolar, 2)} R☉`}
            </small>
            {hostJumpState === "error" ? (
              <small className={cx("system-jump-error")} role="status">
                SIMBAD could not resolve this host name.
              </small>
            ) : null}
            {systemJumpState === "error" ? (
              <small className={cx("system-jump-error")} role="status">
                The archive links no placeable orbits to this host.
              </small>
            ) : null}
          </div>
          {isMoon && solarIdentity.parent ? (
            <div className={cx("telemetry-detail host-system-detail")}>
              <span>PRIMARY BODY</span>
              <button className={cx("system-jump")} type="button" onClick={openPrimaryBody}>
                <span aria-hidden="true">◉</span>
                <strong>{solarIdentity.parent}</strong>
                <small>VISIT PRIMARY ↗</small>
              </button>
              <small>
                {formatNumber(solarIdentity.orbitalPeriodDays ?? null, 3)} day sidereal orbit · NAIF{" "}
                {solarIdentity.naifId}
              </small>
            </div>
          ) : null}
          {solarIdentity ? (
            <div className={cx("telemetry-detail")}>
              <span>PERMANENT IDENTIFIER</span>
              <strong>
                {solarIdentity.spkId
                  ? `SPK ${solarIdentity.spkId}`
                  : `NAIF ${solarIdentity.naifId}`}
              </strong>
              <small>
                NAIF {solarIdentity.naifId}
                {solarIdentity.parent ? ` · direct parent ${solarIdentity.parent}` : ""}
              </small>
            </div>
          ) : null}
          {solarIdentity?.surfaceNote ? (
            <div className={cx("telemetry-detail scientific-disclosure")}>
              <span>SURFACE EVIDENCE</span>
              <strong>{solarIdentity.surfaceStatus?.toUpperCase()}</strong>
              <small>{solarIdentity.surfaceNote}</small>
            </div>
          ) : null}
          <div className={cx("telemetry-detail")}>
            <span>ATMOSPHERE MODEL</span>
            <strong>{recipe.atmosphere.label.split(" · ")[0]}</strong>
            <small>Exora inference · {recipe.confidence} confidence</small>
          </div>
          <p className={cx("source-note")}>
            {planet.source.archive} · {planet.source.table} · {planet.source.retrievedOn}
          </p>
        </aside>

        {subsystem || result.mode !== "custom" ? (
          <div className={cx("mobile-scene-actions mobile-scene-actions-two")}>
            {subsystem ? (
              <button
                className={cx("mobile-scene-action")}
                type="button"
                aria-pressed={subsystemActive}
                onClick={() => {
                  setSceneMode(subsystemActive ? "world" : "subsystem");
                  setOrbitMenuOpen(false);
                }}
              >
                <span aria-hidden="true">{subsystemActive ? "◉" : "⌾"}</span>
                <span>
                  <strong>{subsystemActive ? "Close orbit view" : `${planet.name} system`}</strong>
                  <small>{subsystemActive ? "RETURN TO WORLD" : "MOONS + FIELDS"}</small>
                </span>
              </button>
            ) : null}
            {result.mode !== "custom" && !subsystemActive ? (
              <button
                className={cx("mobile-scene-action")}
                type="button"
                disabled={systemJumpState === "loading"}
                onClick={() => void openHostSystem()}
              >
                <span aria-hidden="true">◎</span>
                <span>
                  <strong>Whole system</strong>
                  <small>{systemJumpState === "loading" ? "PLACING ORBITS…" : "VIEW ORBITS"}</small>
                </span>
              </button>
            ) : null}
            {subsystemActive ? (
              <button
                className={cx("mobile-scene-action")}
                type="button"
                onClick={() => setOrbitMenuOpen(true)}
              >
                <span aria-hidden="true">☷</span>
                <span>
                  <strong>Orbit guide</strong>
                  <small>MOONS + LAYERS</small>
                </span>
              </button>
            ) : null}
          </div>
        ) : null}
      </main>

      {subsystem ? (
        <MobileSheet
          eyebrow={`${planet.name.toUpperCase()} SYSTEM`}
          title="Orbit guide"
          open={orbitMenuOpen}
          onClose={() => setOrbitMenuOpen(false)}
        >
          <p className={cx("mobile-orbit-note")}>
            JPL mean orbits · log-compressed distance · body sizes exaggerated
          </p>
          <div className={cx("mobile-orbit-groups")}>
            <section>
              <h3>{subsystem.moons.length} selected moons</h3>
              <ul>
                {subsystem.moons.map((candidate) => (
                  <li key={candidate.naifId}>
                    <strong>{candidate.name}</strong>
                    <small>
                      NAIF {candidate.naifId} · {candidate.surface} ·{" "}
                      {candidate.retrograde ? "retrograde" : "prograde"}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3>Rings + fields</h3>
              <ul>
                {subsystem.rings.map((ring) => (
                  <li key={ring.name}>
                    <strong>{ring.name}</strong>
                    <small>MEASURED BOUNDARIES</small>
                  </li>
                ))}
                {subsystem.lagrangePoints.map((point) => (
                  <li key={`${point.reference}-${point.label}`}>
                    <strong>{point.label}</strong>
                    <small>{point.reference} · DERIVED MARKER</small>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </MobileSheet>
      ) : null}

      <MissionControl
        chromeHidden={chromeHidden}
        hints={[
          { key: "WASD", meaning: "MOVE" },
          { key: "DRAG", meaning: viewMode === "surface" ? "LOOK" : "ORBIT" },
          {
            key: "SCROLL",
            meaning:
              viewMode === "surface"
                ? "RETURN"
                : viewMode === "subsystem"
                  ? "SCALE SYSTEM"
                  : "ZOOM / APPROACH",
          },
          ...(viewMode === "subsystem"
            ? [{ key: "CLICK", meaning: "VISIT MOON" }]
            : viewMode === "orbit" && result.mode !== "custom"
              ? [{ key: "CLICK", meaning: "VISIT STAR" }]
              : []),
        ]}
        onToggleChrome={onToggleChrome}
        onOpenDiscover={onOpenDiscover}
        sceneFailed={sceneState === "error"}
        xr={{ host, status: xrStatus }}
      />

      <div className={cx("loading-screen")} role="status">
        <div className={cx("loading-orbit")} aria-hidden="true">
          <span />
        </div>
        <p>CALCULATING WORLD</p>
        <small>
          {subsystemActive
            ? `${planet.name.toUpperCase()} SUBSYSTEM`
            : `${planet.name.toUpperCase()} · SEED ${recipe.seed.toString(16).toUpperCase()}`}
        </small>
      </div>
    </div>
  );
};
