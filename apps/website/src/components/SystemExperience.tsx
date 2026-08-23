import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomStar, CustomWorld } from "@exora/worldgen";
import { useEffect, useState } from "react";
import type { SystemLoadResult } from "../api-client.ts";
import { reachStar } from "../destination-cache.ts";
import { formatNumber } from "../planet-utils.tsx";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import {
  bodyScaleLabel,
  elementProvenance,
  orbitMappingLabel,
  timeScaleLabel,
  type SystemLayout,
} from "../system-layout.ts";
import type { SystemWorld } from "../system-scene.ts";
import type { TravelPhase } from "../travel-transition.ts";

interface SystemExperienceProps {
  chromeHidden: boolean;
  host: SceneHost | null;
  onGeneratePlanet: (world: CustomWorld) => void;
  onGenerateStar: (star: CustomStar) => void;
  onHideChrome: () => void;
  onOpenBuilder: () => void;
  onOpenPlanets: () => void;
  onOpenStars: () => void;
  onOpenSolarSystem?: () => void;
  onSelectHostStar: (hostStar: string) => Promise<boolean>;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
  result: SystemLoadResult;
  travelPhase: TravelPhase;
}

const xrButtonCopy: Record<XrStatus, string> = {
  checking: "CHECKING HEADSET",
  entering: "ENTERING SESSION",
  "in-xr": "SESSION ACTIVE",
  ready: "ENTER IMMERSIVE VR",
  unavailable: "VR UNAVAILABLE",
};

/**
 * The whole host system, as somewhere to stand rather than a list to read.
 *
 * The one thing this view has to do that the planet and star views do not is admit what the
 * picture is doing to the numbers. A diorama that fits a system into a room has compressed two
 * scales and picked a clock rate, none of which is a fact about the system, so all three are
 * printed above the fold rather than left for the layout to imply — and each world carries what
 * had to be assumed to draw its orbit at all.
 */
export const SystemExperience = ({
  chromeHidden,
  host,
  onGeneratePlanet,
  onGenerateStar,
  onHideChrome,
  onOpenBuilder,
  onOpenPlanets,
  onOpenStars,
  onOpenSolarSystem,
  onSelectHostStar,
  onSelectPlanet,
  onSelectStar,
  result,
  travelPhase,
}: SystemExperienceProps) => {
  const [fps, setFps] = useState("--");
  const [qualityTier, setQualityTier] = useState("AUTO");
  const [layout, setLayout] = useState<SystemLayout | null>(null);
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "error">("loading");
  const [xrStatus, setXrStatus] = useState<XrStatus>("checking");
  const [starJumpState, setStarJumpState] = useState<"error" | "idle" | "loading">("idle");
  const { cached, hostStar, planets } = result;
  const solar = planets.length > 0 && planets.every((planet) => planet.solarSystem);
  // A jump in the air owns the screen: this view's panels go with the world being left, and its
  // loading card stays down, because the flight is what stands in for it now.
  const travelling = travelPhase === "departing" || travelPhase === "crossing";
  const settled = sceneState !== "loading" || travelPhase !== "idle";

  const openHostStar = async (): Promise<void> => {
    if (starJumpState === "loading") return;
    setStarJumpState("loading");
    // The pull-away and the archive request go out together, so the click reads immediately
    // rather than after however long the answer takes.
    host?.beginTravel();
    // A lookup that fails outright is a destination that is not there: it has to reach the
    // `cancelTravel` below, or the flight would hang pulled back with no world to return to.
    const found = await onSelectHostStar(hostStar).catch(() => false);
    if (!found) host?.cancelTravel();
    setStarJumpState(found ? "idle" : "error");
  };

  // The one route out of a diorama that has to be looked up. Asked for as the orbits are drawn,
  // so that standing at the star is a flight rather than a flight and then a wait.
  useEffect(() => {
    void reachStar(hostStar).catch(() => null);
  }, [hostStar]);

  useEffect(() => host?.onXrStatus(setXrStatus), [host]);

  useEffect(() => {
    if (!host) return;
    setQualityTier(host.qualityTier.toUpperCase());
    const fpsTimer = window.setInterval(() => setFps(Math.round(host.getFps()).toString()), 1_000);
    return () => window.clearInterval(fpsTimer);
  }, [host]);

  // The world is handed to the shared renderer, which disposes the previous one as it takes this
  // one. Nothing is torn down when this view unmounts: a running immersive session is living on
  // that renderer, and the destination replacing this view is what releases it.
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
            // The console inside the headset can travel anywhere the browser catalog can, so the
            // same selection handlers the DOM dialogs use are handed to the scene.
            onSelectPlanet: (destination) => onSelectPlanet(destination, false),
            onSelectStar: (destination) => onSelectStar(destination, false),
            onForgeWorld: onGeneratePlanet,
            onForgeStar: onGenerateStar,
            onFirstFrame: () => {
              if (!abandoned) setSceneState("ready");
            },
          }),
        ),
      )
      .then((world: SystemWorld | null) => {
        if (!world || abandoned) return;
        setLayout(world.layout);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!abandoned) setSceneState("error");
      });

    return () => {
      abandoned = true;
    };
  }, [
    cached,
    host,
    hostStar,
    onGeneratePlanet,
    onGenerateStar,
    onSelectHostStar,
    onSelectPlanet,
    onSelectStar,
    planets,
  ]);

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
        <div className="exploration-actions">
          <button
            className="solar-trigger"
            type="button"
            aria-label="Open our Solar System"
            onClick={onOpenSolarSystem}
          >
            <span className="solar-symbol" aria-hidden="true">
              ☉
            </span>
            <span>
              <small>HOME SYSTEM</small>
              <strong>SOLAR SYSTEM</strong>
            </span>
          </button>
          <button
            className="catalog-trigger compact-trigger"
            type="button"
            aria-label="Open NASA exoplanet catalog"
            onClick={onOpenPlanets}
          >
            <span className="catalog-radar" aria-hidden="true" />
            <span>
              <small>NASA CATALOG</small>
              <strong>PLANETS</strong>
            </span>
          </button>
          <button
            id="open-star-catalog"
            className="star-trigger"
            type="button"
            aria-label="Open SIMBAD star catalog"
            onClick={onOpenStars}
          >
            <span className="star-symbol" aria-hidden="true">
              ✦
            </span>
            <span>
              <small>SIMBAD CATALOG</small>
              <strong>EXPLORE STARS</strong>
            </span>
          </button>
          <button
            className="forge-trigger"
            type="button"
            aria-label="Open World Forge"
            onClick={onOpenBuilder}
          >
            <span aria-hidden="true">＋</span>
            <span>
              <small>WORLD FORGE</small>
              <strong>CREATE OBJECT</strong>
            </span>
          </button>
        </div>
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
            <span aria-hidden="true" /> ORBITS MEASURED · LAYOUT DERIVED · APPEARANCE INFERRED
          </p>

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
            <span className="signal-bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>
          {/*
            The three numbers a reader needs before reading anything off the layout. None of them
            is a fact about the system — they are what had to be done to fit it into a room — so
            they are stated rather than left for the picture to imply.
          */}
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
            <strong>NOT MEASURED</strong>
            <small>
              No catalog records where a world is on its orbit. Starting positions are seeded from
              each planet&rsquo;s identifier.
            </small>
          </div>
          <p className="source-note">
            NASA Exoplanet Archive · pscomppars ·{" "}
            {result.planets[0]?.source.retrievedOn ?? "unsynchronized"}
          </p>
        </aside>
      </main>

      <footer className="mission-control">
        {sceneState === "error" ? (
          <p className="scene-alert" role="status">
            RENDERER UNAVAILABLE
          </p>
        ) : (
          <button
            className="clear-view"
            type="button"
            aria-label="Hide the interface"
            onClick={onHideChrome}
          >
            <span className="clear-view-mark" aria-hidden="true" />
            <span>
              <small>CLEAR VIEW</small>
              <strong>HIDE INTERFACE</strong>
            </span>
            <kbd>TAB</kbd>
          </button>
        )}
        <div className="interaction-hint">
          <span>
            <kbd>DRAG</kbd>
            <small>ORBIT</small>
          </span>
          <span>
            <kbd>SCROLL</kbd>
            <small>ZOOM</small>
          </span>
          <span>
            <kbd>CLICK</kbd>
            <small>TRAVEL</small>
          </span>
          <span className="performance-readout">
            <strong>{fps}</strong>
            <small>FPS · {qualityTier}</small>
          </span>
        </div>
        <button
          className="enter-vr"
          type="button"
          disabled={xrStatus !== "ready"}
          onClick={() => void host?.enterVr().catch((error: unknown) => console.error(error))}
        >
          <span className="button-orbit" aria-hidden="true" />
          <span>
            <small>IMMERSIVE MODE</small>
            <strong>{xrButtonCopy[xrStatus]}</strong>
          </span>
          <span className="button-arrow" aria-hidden="true">
            ↗
          </span>
        </button>
      </footer>

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
