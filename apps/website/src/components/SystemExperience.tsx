import type { EphemerisResponse, ExoplanetProfile, StarProfile } from "@exora/contracts";
import { useEffect, useRef, useState } from "react";
import { loadSolarEphemeris, type SystemLoadResult } from "../api-client.ts";
import { reachStar } from "../destination-cache.ts";
import { formatNumber } from "../planet-utils.tsx";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import { isEphemerisDerivedAt } from "../solar-ephemeris.ts";
import {
  bodyScaleLabel,
  elementProvenance,
  orbitMappingLabel,
  timeScaleLabel,
  type SystemLayout,
} from "../system-layout.ts";
import type { SystemWorld } from "../system-scene.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { FrameRateSignal } from "./FrameRateSignal.tsx";
import { MissionControl } from "./MissionControl.tsx";
import { MobileSheet } from "./MobileSheet.tsx";

interface SystemExperienceProps {
  chromeHidden: boolean;
  host: SceneHost | null;
  onToggleChrome: () => void;
  onOpenDiscover: () => void;
  onSelectHostStar: (hostStar: string) => Promise<boolean>;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
  result: SystemLoadResult;
  travelPhase: TravelPhase;
}

const localDateTimeValue = (date: Date): string => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19);
};

const PLAYBACK_RATES = [
  { label: "1×", secondsPerSecond: 1 },
  { label: "60×", secondsPerSecond: 60 },
  { label: "1 h/s", secondsPerSecond: 3_600 },
  { label: "1 d/s", secondsPerSecond: 86_400 },
] as const;

export const SystemExperience = ({
  chromeHidden,
  host,
  onToggleChrome,
  onOpenDiscover,
  onSelectHostStar,
  onSelectPlanet,
  onSelectStar,
  result,
  travelPhase,
}: SystemExperienceProps) => {
  const [fps, setFps] = useState("--");
  const [layout, setLayout] = useState<SystemLayout | null>(null);
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "error">("loading");
  const [xrStatus, setXrStatus] = useState<XrStatus>("checking");
  const [starJumpState, setStarJumpState] = useState<"error" | "idle" | "loading">("idle");
  const [orbitMenuOpen, setOrbitMenuOpen] = useState(false);
  const [ephemeris, setEphemeris] = useState<EphemerisResponse | null>(null);
  const [ephemerisRequest, setEphemerisRequest] = useState<"error" | "idle" | "loading">("idle");
  const [displayedAt, setDisplayedAt] = useState(() => new Date());
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(3_600);
  const [playbackDirection, setPlaybackDirection] = useState<1 | -1>(1);
  const worldRef = useRef<SystemWorld | null>(null);
  const starJumpRef = useRef(false);
  const ephemerisRef = useRef<EphemerisResponse | null>(null);
  const displayedAtRef = useRef(displayedAt);
  const requestSequence = useRef(0);
  const { cached, hostStar, planets } = result;
  const solar = planets.length > 0 && planets.every((planet) => planet.solarSystem);
  const travelling = travelPhase === "departing" || travelPhase === "crossing";
  const settled = sceneState !== "loading" || travelPhase !== "idle";

  const activateEphemeris = async (epoch: Date): Promise<void> => {
    if (!solar || ephemerisRequest === "loading") return;
    const request = requestSequence.current + 1;
    requestSequence.current = request;
    setPlaying(false);
    setEphemerisRequest("loading");
    try {
      const response = await loadSolarEphemeris(
        epoch,
        planets.flatMap(({ solarSystem }) => (solarSystem ? [solarSystem.naifId] : [])),
      );
      if (requestSequence.current !== request) return;
      ephemerisRef.current = response;
      displayedAtRef.current = epoch;
      setEphemeris(response);
      setDisplayedAt(epoch);
      worldRef.current?.setEphemeris(response.data);
      worldRef.current?.setEphemerisTime(epoch);
      setEphemerisRequest("idle");
    } catch (error) {
      console.error(error);
      if (requestSequence.current === request) setEphemerisRequest("error");
    }
  };

  const useCatalogPositions = (): void => {
    requestSequence.current += 1;
    setPlaying(false);
    setEphemeris(null);
    ephemerisRef.current = null;
    setEphemerisRequest("idle");
    worldRef.current?.setEphemeris(null);
  };

  const openHostStar = async (): Promise<void> => {
    if (starJumpRef.current) return;
    starJumpRef.current = true;
    setStarJumpState("loading");
    host?.beginTravel();
    const found = await onSelectHostStar(hostStar).catch(() => false);
    if (!found) host?.cancelTravel();
    starJumpRef.current = false;
    setStarJumpState(found ? "idle" : "error");
  };

  useEffect(() => {
    void reachStar(hostStar).catch(() => null);
  }, [hostStar]);

  useEffect(() => host?.onXrStatus(setXrStatus), [host]);

  useEffect(() => {
    if (!playing || !ephemeris) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - previous;
      previous = now;
      setDisplayedAt((current) => {
        const requestedTime = current.getTime() + elapsed * playbackRate * playbackDirection;
        const minimum = Date.UTC(1900, 0, 1);
        const maximum = Date.UTC(2100, 11, 31, 23, 59, 59);
        const boundedTime = Math.min(maximum, Math.max(minimum, requestedTime));
        if (boundedTime !== requestedTime) setPlaying(false);
        const next = new Date(boundedTime);
        displayedAtRef.current = next;
        worldRef.current?.setEphemerisTime(next);
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [ephemeris, playbackDirection, playbackRate, playing]);

  useEffect(() => {
    if (!host) return;
    const fpsTimer = window.setInterval(() => setFps(Math.round(host.getFps()).toString()), 1_000);
    return () => window.clearInterval(fpsTimer);
  }, [host]);

  useEffect(() => {
    if (!host) return;
    let abandoned = false;
    setSceneState("loading");

    void import("../system-scene.ts")
      .then(({ createSystemWorld }) =>
        host.mountWorld(() =>
          createSystemWorld(host, {
            hostName: hostStar,
            planets,
            onSelectHostStar: () => void openHostStar(),
            onSelectWorld: (planet) => onSelectPlanet(planet, cached),
            onFirstFrame: () => {
              if (!abandoned) setSceneState("ready");
            },
          }),
        ),
      )
      .then((world: SystemWorld | null) => {
        if (!world || abandoned) return;
        worldRef.current = world;
        if (ephemerisRef.current) {
          world.setEphemeris(ephemerisRef.current.data);
          world.setEphemerisTime(displayedAtRef.current);
        }
        setLayout(world.layout);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!abandoned) setSceneState("error");
      });

    return () => {
      abandoned = true;
      worldRef.current = null;
    };
  }, [cached, host, hostStar, onSelectHostStar, onSelectPlanet, onSelectStar, planets]);

  const drawn = layout?.orbits ?? [];
  const unplaced = layout?.unplaced ?? [];

  return (
    <div
      className={`experience-shell system-experience ${settled ? "scene-ready" : ""} ${sceneState === "error" ? "scene-error" : ""} ${travelling ? "travelling" : ""} ${chromeHidden ? "chrome-hidden" : ""}`}
    >
      <div className="space-haze" aria-hidden="true" />
      <div className="viewport-grid" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="/" aria-label="Exora home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-copy">
            <strong>EXORA</strong>
            <small>UNIVERSE OBSERVATORY</small>
          </span>
        </a>
      </header>

      <main className="hud">
        <section className="world-intro" aria-labelledby="system-name">
          <p className="eyebrow">
            <span>{solar ? "HOME SYSTEM" : "CONFIRMED SYSTEM"}</span>
            <span>
              {planets.length} KNOWN WORLD{planets.length === 1 ? "" : "S"}
            </span>
          </p>
          <h1 id="system-name">{hostStar}</h1>
          <div className="world-tags" aria-label="System classification">
            <span>ORBITAL DIORAMA</span>
            <span>
              {drawn.length} ORBIT{drawn.length === 1 ? "" : "S"} DRAWN
            </span>
            <span>{solar ? "NASA/JPL" : "NASA ARCHIVE"}</span>
          </div>
          <p className="world-summary">
            {solar
              ? "Every planet in our Solar System, placed on its measured orbit and turning on its own clock. Select a world to cross the system, or the Sun at the centre to stand at our star."
              : `Every confirmed world of ${hostStar}, on the orbit the archive measured for it and turning at its own measured period. Select a world to travel to it, or the star at the centre to stand at the star itself.`}
          </p>
          <p className="visual-note">
            <span aria-hidden="true" />{" "}
            {ephemeris
              ? "BODY POSITIONS: JPL HORIZONS · ORBIT TRACKS: SIMPLIFIED CATALOG"
              : "ORBITS MEASURED · PHASES SEEDED · APPEARANCE INFERRED"}
          </p>

          {solar ? (
            <section className="ephemeris-control" aria-labelledby="ephemeris-title">
              <div className="ephemeris-heading">
                <span>
                  <small>POSITION MODE</small>
                  <h2 id="ephemeris-title">Live ephemeris</h2>
                </span>
                <strong className={ephemeris?.meta.stale ? "stale" : undefined} role="status">
                  {ephemerisRequest === "loading"
                    ? "CONTACTING JPL…"
                    : ephemerisRequest === "error"
                      ? "JPL UNAVAILABLE"
                      : ephemeris?.meta.stale
                        ? "STALE CACHE"
                        : ephemeris?.meta.cached
                          ? "SERVER-CACHED JPL"
                          : ephemeris
                            ? "FRESH JPL VECTOR"
                            : "SIMPLIFIED CATALOG"}
                </strong>
              </div>
              <div className="ephemeris-time-row">
                <label>
                  <span>LOCAL DATE &amp; TIME</span>
                  <input
                    type="datetime-local"
                    min="1900-01-01T00:00:00"
                    max="2100-12-31T23:59:59"
                    step="1"
                    value={localDateTimeValue(displayedAt)}
                    onChange={(event) => {
                      const selected = new Date(event.currentTarget.value);
                      if (!Number.isFinite(selected.getTime())) return;
                      setPlaying(false);
                      displayedAtRef.current = selected;
                      setDisplayedAt(selected);
                      worldRef.current?.setEphemerisTime(selected);
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={ephemerisRequest === "loading"}
                  onClick={() => void activateEphemeris(displayedAt)}
                >
                  APPLY JPL
                </button>
                <button
                  type="button"
                  disabled={ephemerisRequest === "loading"}
                  onClick={() => void activateEphemeris(new Date())}
                >
                  NOW
                </button>
              </div>
              <div className="ephemeris-playback" aria-label="Ephemeris playback controls">
                <button
                  type="button"
                  disabled={!ephemeris}
                  aria-pressed={playing && playbackDirection === 1}
                  onClick={() => {
                    setPlaybackDirection(1);
                    setPlaying(true);
                  }}
                >
                  ▶ PLAY
                </button>
                <button
                  type="button"
                  disabled={!ephemeris || !playing}
                  onClick={() => setPlaying(false)}
                >
                  ‖ PAUSE
                </button>
                <button
                  type="button"
                  disabled={!ephemeris}
                  aria-pressed={playing && playbackDirection === -1}
                  onClick={() => {
                    setPlaybackDirection(-1);
                    setPlaying(true);
                  }}
                >
                  ◀ REVERSE
                </button>
                <label>
                  <span>RATE</span>
                  <select
                    value={playbackRate}
                    onChange={(event) => setPlaybackRate(Number(event.currentTarget.value))}
                  >
                    {PLAYBACK_RATES.map((rate) => (
                      <option key={rate.secondsPerSecond} value={rate.secondsPerSecond}>
                        {rate.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" disabled={!ephemeris} onClick={useCatalogPositions}>
                  CATALOG ORBITS
                </button>
              </div>
              <p>
                {ephemeris
                  ? isEphemerisDerivedAt(ephemeris.data, displayedAt)
                    ? `DERIVED BETWEEN LOOKUPS · TWO-BODY PROPAGATION FROM ${new Date(ephemeris.meta.epoch).toISOString().replace(".000Z", "Z")} JPL ANCHOR`
                    : `MEASURED STATE VECTORS · ${ephemeris.meta.coordinateFrame.toUpperCase()} · CENTER ${ephemeris.meta.center.toUpperCase()}`
                  : "CATALOG ORBIT SHAPES · SEEDED PHASES · NOT A DATE-SOLVED CONFIGURATION"}
                {ephemeris?.meta.stale ? " · HORIZONS WAS OFFLINE; EXPIRED CACHE RETAINED" : ""}
              </p>
            </section>
          ) : null}

          <section className="known-worlds" aria-labelledby="system-worlds-title">
            <div>
              <p>THIS SYSTEM</p>
              <h2 id="system-worlds-title">Worlds in the diorama</h2>
            </div>
            {sceneState === "loading" ? <small role="status">PLACING ORBITS…</small> : null}
            {drawn.length > 0 ? (
              <div className="known-world-list">
                {drawn.map((orbit) => (
                  <button
                    key={orbit.planet.id}
                    type="button"
                    onClick={() => onSelectPlanet(orbit.planet, cached)}
                  >
                    <span className={`known-world-orb ${orbit.planet.kind}`} aria-hidden="true" />
                    <span>
                      <strong>{orbit.planet.name}</strong>
                      <small>
                        {formatNumber(orbit.elements.semiMajorAxisAu, 3)} AU ·{" "}
                        {orbit.elements.periodDays === null
                          ? "UNTIMED"
                          : `${formatNumber(orbit.elements.periodDays, 1)} d`}{" "}
                        · VISIT ↗
                      </small>
                      <small className="orbit-provenance">
                        {elementProvenance(orbit.elements)}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {unplaced.length > 0 ? (
              <small className="orbit-unplaced" role="status">
                NOT PLACED · {unplaced.map(({ name }) => name).join(", ")} · NO MEASURED ORBIT SIZE
                AND NO PERIOD TO DERIVE ONE FROM
              </small>
            ) : null}
          </section>
        </section>

        <aside className="telemetry" aria-label="System layout and observed data">
          <div className="telemetry-heading">
            <span>
              <small>DIORAMA SCALE</small>
              What the picture compressed
            </span>
            <FrameRateSignal fps={fps} />
          </div>
          <dl className="system-scale">
            <div>
              <dt>Orbit radii</dt>
              <dd>{layout ? orbitMappingLabel(layout) : "—"}</dd>
            </div>
            <div>
              <dt>Body radii</dt>
              <dd>{layout ? bodyScaleLabel(layout) : "—"}</dd>
            </div>
            <div>
              <dt>Clock</dt>
              <dd>{layout ? timeScaleLabel(layout) : "—"}</dd>
            </div>
          </dl>
          <p className="visual-note scale-note">
            <span aria-hidden="true" /> RADII ARE LOGARITHMIC, NOT LINEAR. BODIES ARE DRAWN FAR
            LARGER THAN THEIR ORBITS TO SCALE.
          </p>
          <div className="telemetry-detail host-system-detail">
            <span>HOST STAR</span>
            <button
              className="system-jump"
              type="button"
              disabled={starJumpState === "loading"}
              onClick={() => void openHostStar()}
            >
              <span aria-hidden="true">☀</span>
              <strong>{hostStar}</strong>
              <small>{starJumpState === "loading" ? "RESOLVING…" : "STAND AT THE STAR ↗"}</small>
            </button>
            <small>
              {layout
                ? `${formatNumber(layout.hostRadiusSolar, 2)} R☉ · ${layout.hostRadiusSource.toUpperCase()}`
                : "RESOLVING RADIUS"}
            </small>
            {starJumpState === "error" ? (
              <small className="system-jump-error" role="status">
                SIMBAD could not resolve this host name.
              </small>
            ) : null}
          </div>
          <div className="telemetry-detail">
            <span>ORBITAL PHASE</span>
            <strong>{ephemeris ? "JPL HORIZONS" : "NOT MEASURED"}</strong>
            <small>
              {ephemeris
                ? isEphemerisDerivedAt(ephemeris.data, displayedAt)
                  ? "Playback is derived from the last JPL state-vector anchor; apply the shown time for a new authoritative solution."
                  : "Geometric heliocentric state vectors from the validated Horizons API response."
                : "No catalog records where a world is on its orbit. Starting positions are seeded from each planet’s identifier."}
            </small>
          </div>
          <p className="source-note">
            {ephemeris
              ? `NASA/JPL Horizons API ${ephemeris.meta.sourceVersion} · ${ephemeris.meta.cached ? "SERVER CACHE" : "FRESH RESPONSE"}`
              : `NASA Exoplanet Archive · pscomppars · ${result.planets[0]?.source.retrievedOn ?? "unsynchronized"}`}
          </p>
        </aside>
      </main>

      <div className="mobile-orbit-action">
        <button
          className="mobile-scene-action"
          type="button"
          onClick={() => setOrbitMenuOpen(true)}
        >
          <span aria-hidden="true">☷</span>
          <span>
            <strong>Orbit controls</strong>
            <small>{drawn.length} WORLDS + NAVIGATION</small>
          </span>
        </button>
      </div>

      <MobileSheet
        eyebrow={`${hostStar.toUpperCase()} SYSTEM`}
        title="Orbit controls"
        open={orbitMenuOpen}
        onClose={() => setOrbitMenuOpen(false)}
      >
        {solar ? (
          <section className="mobile-ephemeris" aria-labelledby="mobile-ephemeris-title">
            <div>
              <span>
                <small>POSITION MODE</small>
                <h3 id="mobile-ephemeris-title">Live ephemeris</h3>
              </span>
              <strong role="status">
                {ephemerisRequest === "loading"
                  ? "CONTACTING JPL…"
                  : ephemeris
                    ? ephemeris.meta.cached
                      ? "CACHED JPL POSITIONS"
                      : "FRESH JPL POSITIONS"
                    : "CATALOG POSITIONS"}
              </strong>
            </div>
            <label>
              <span>LOCAL DATE &amp; TIME</span>
              <input
                type="datetime-local"
                min="1900-01-01T00:00:00"
                max="2100-12-31T23:59:59"
                step="1"
                value={localDateTimeValue(displayedAt)}
                onChange={(event) => {
                  const selected = new Date(event.currentTarget.value);
                  if (!Number.isFinite(selected.getTime())) return;
                  setPlaying(false);
                  displayedAtRef.current = selected;
                  setDisplayedAt(selected);
                  worldRef.current?.setEphemerisTime(selected);
                }}
              />
            </label>
            <div className="mobile-ephemeris-actions">
              <button
                type="button"
                disabled={ephemerisRequest === "loading"}
                onClick={() => void activateEphemeris(displayedAt)}
              >
                APPLY JPL
              </button>
              <button type="button" disabled={!ephemeris} onClick={() => setPlaying(!playing)}>
                {playing ? "PAUSE" : "PLAY"}
              </button>
              <button type="button" disabled={!ephemeris} onClick={useCatalogPositions}>
                CATALOG ORBITS
              </button>
            </div>
          </section>
        ) : null}

        <button
          className="system-jump mobile-host-jump"
          type="button"
          disabled={starJumpState === "loading"}
          onClick={() => {
            setOrbitMenuOpen(false);
            void openHostStar();
          }}
        >
          <span aria-hidden="true">☀</span>
          <strong>{hostStar}</strong>
          <small>{starJumpState === "loading" ? "RESOLVING…" : "STAND AT THE STAR ↗"}</small>
        </button>

        <section className="mobile-orbit-worlds" aria-labelledby="mobile-orbit-worlds-title">
          <h3 id="mobile-orbit-worlds-title">Worlds in the diorama</h3>
          {drawn.length > 0 ? (
            <div className="known-world-list">
              {drawn.map((orbit) => (
                <button
                  key={orbit.planet.id}
                  type="button"
                  onClick={() => {
                    setOrbitMenuOpen(false);
                    onSelectPlanet(orbit.planet, cached);
                  }}
                >
                  <span className={`known-world-orb ${orbit.planet.kind}`} aria-hidden="true" />
                  <span>
                    <strong>{orbit.planet.name}</strong>
                    <small>
                      {formatNumber(orbit.elements.semiMajorAxisAu, 3)} AU ·{" "}
                      {orbit.elements.periodDays === null
                        ? "UNTIMED"
                        : `${formatNumber(orbit.elements.periodDays, 1)} d`}{" "}
                      · VISIT ↗
                    </small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <small role="status">PLACING ORBITS…</small>
          )}
        </section>
      </MobileSheet>

      <MissionControl
        chromeHidden={chromeHidden}
        hints={[
          { key: "DRAG", meaning: "ORBIT" },
          { key: "SCROLL", meaning: "ZOOM" },
          { key: "CLICK", meaning: "TRAVEL" },
        ]}
        onToggleChrome={onToggleChrome}
        onOpenDiscover={onOpenDiscover}
        sceneFailed={sceneState === "error"}
        xr={{ host, status: xrStatus }}
      />

      <div className="loading-screen" role="status">
        <div className="loading-orbit" aria-hidden="true">
          <span />
        </div>
        <p>PLACING ORBITS</p>
        <small>{hostStar.toUpperCase()} · MEASURED ORBITAL ELEMENTS</small>
      </div>
    </div>
  );
};
