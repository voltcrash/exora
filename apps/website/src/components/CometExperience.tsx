import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { useEffect, useState } from "react";
import type { SceneHost } from "../scene-host.ts";
import { cometActivityAtDistance, type CometProfile } from "../solar-comets.ts";
import { findSolarStar, findSolarWorld } from "../solar-system.ts";
import type { TravelPhase } from "../travel-transition.ts";

interface CometExperienceProps {
  chromeHidden: boolean;
  comet: CometProfile;
  host: SceneHost | null;
  onHideChrome: () => void;
  onOpenSolarSystem: () => void;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
  travelPhase: TravelPhase;
}

export const CometExperience = ({
  chromeHidden,
  comet,
  host,
  onHideChrome,
  onOpenSolarSystem,
  onSelectPlanet,
  onSelectStar,
  travelPhase,
}: CometExperienceProps) => {
  const [distanceAu, setDistanceAu] = useState(comet.orbit.perihelionAu);
  const [sceneState, setSceneState] = useState<"error" | "loading" | "ready">("loading");
  const [fps, setFps] = useState("--");
  const activity = cometActivityAtDistance(comet, distanceAu);
  const travelling = travelPhase === "departing" || travelPhase === "crossing";

  useEffect(() => {
    if (!host) return;
    const timer = window.setInterval(() => setFps(Math.round(host.getFps()).toString()), 1_000);
    return () => window.clearInterval(timer);
  }, [host]);

  useEffect(() => {
    if (!host) return;
    let abandoned = false;
    setSceneState("loading");
    void import("../comet-scene.ts")
      .then(({ createCometWorld }) =>
        host.mountWorld(() =>
          createCometWorld(host, {
            comet,
            heliocentricDistanceAu: distanceAu,
            onFirstFrame: () => {
              if (!abandoned) setSceneState("ready");
            },
          }),
        ),
      )
      .catch((error: unknown) => {
        console.error(error);
        if (!abandoned) setSceneState("error");
      });
    return () => {
      abandoned = true;
    };
  }, [comet, distanceAu, host]);

  const openParent = (): void => {
    const worldParent = findSolarWorld(comet.parent);
    if (worldParent) {
      onSelectPlanet(worldParent, true);
      return;
    }
    const parent = findSolarStar(comet.parent);
    if (parent) onSelectStar(parent, true);
  };

  return (
    <div
      className={`experience-shell small-body-experience comet-experience scene-${sceneState} ${travelling ? "travelling" : ""} ${chromeHidden ? "chrome-hidden" : ""}`}
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
        </div>
      </header>
      <main className="hud">
        <section className="world-intro" aria-labelledby="world-name">
          <p className="eyebrow">
            <span>LANDMARK COMET</span>
            <span>{comet.orbit.class}</span>
          </p>
          <h1 id="world-name">{comet.name}</h1>
          <div className="world-tags" aria-label="Comet evidence classification">
            <span>{comet.evidence.geometry.replaceAll("-", " ").toUpperCase()}</span>
            <span>{comet.evidence.surface.replaceAll("-", " ").toUpperCase()}</span>
            <span>SIMULATED ACTIVITY</span>
          </div>
          <p className="world-summary">{comet.summary}</p>
          <p className="visual-note">
            <span aria-hidden="true" /> MEASURED NUCLEUS WHERE AVAILABLE · TRANSIENT MATERIAL IS
            SIMULATED
          </p>
          <p className="small-body-discovery">{comet.discovery}</p>
          <p className="small-body-identifiers" aria-label="Permanent identifiers">
            <strong>SPK {comet.spkId}</strong>
            <span>NAIF {comet.naifId}</span>
          </p>
          <label className="comet-distance-control">
            <span>HELIOCENTRIC DISTANCE · {distanceAu.toFixed(2)} AU</span>
            <input
              aria-label="Heliocentric distance"
              max={Math.max(8, comet.activity.onsetAu + 1)}
              min={Math.max(0.2, comet.orbit.perihelionAu)}
              step="0.05"
              type="range"
              value={distanceAu}
              onChange={(event) => setDistanceAu(Number(event.target.value))}
            />
            <small>
              {activity > 0
                ? `${Math.round(activity * 100)}% MODELED ACTIVITY`
                : "DORMANT AT THIS DISTANCE"}
            </small>
          </label>
        </section>
        <aside className="telemetry small-body-telemetry" aria-label="Comet data">
          <div className="telemetry-heading">
            <span>
              <small>NASA/JPL SBDB 1.3</small>Measured parameters
            </span>
            <span className="signal-bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>
          <dl>
            <div>
              <dt>Nucleus</dt>
              <dd>
                {comet.diameterKilometers.value} <small>KM</small>
              </dd>
            </div>
            <div>
              <dt>Rotation</dt>
              <dd>
                {comet.rotationHours ?? "—"} <small>H</small>
              </dd>
            </div>
            <div>
              <dt>Perihelion</dt>
              <dd>
                {comet.orbit.perihelionAu} <small>AU</small>
              </dd>
            </div>
            <div>
              <dt>Inclination</dt>
              <dd>
                {comet.orbit.inclinationDegrees} <small>DEG</small>
              </dd>
            </div>
          </dl>
          <div className="telemetry-detail host-system-detail">
            <span>DIRECT PARENT</span>
            <button className="system-jump" type="button" onClick={openParent}>
              <span aria-hidden="true">{comet.parent === "Sun" ? "☀" : "◉"}</span>
              <strong>{comet.parent}</strong>
              <small>VISIT PARENT ↗</small>
            </button>
          </div>
          <div className="telemetry-detail">
            <span>PERMANENT IDENTIFIERS</span>
            <strong>SPK {comet.spkId}</strong>
            <small>NAIF {comet.naifId}</small>
          </div>
          <div className="telemetry-detail scientific-disclosure">
            <span>UNCERTAINTY / COVERAGE</span>
            <strong>{comet.evidence.surface.replaceAll("-", " ").toUpperCase()}</strong>
            <small>{comet.uncertaintyNote}</small>
          </div>
          <div className="telemetry-detail scientific-disclosure">
            <span>TRANSIENT PHENOMENA</span>
            <strong>SIMULATED · DISTANCE-DRIVEN</strong>
            <small>
              Coma faces the Sun; ion tail points anti-solar; dust follows a curved orbital-lag
              proxy. Jets appear only where mission observations support localized activity.
            </small>
          </div>
          <div className="telemetry-detail mission-encounters">
            <span>MISSION ENCOUNTERS</span>
            {comet.missionEncounters.length ? (
              comet.missionEncounters.map((encounter) => (
                <p key={`${encounter.mission}-${encounter.date}`}>
                  <strong>
                    {encounter.mission} · {encounter.date}
                  </strong>
                  <small>{encounter.note}</small>
                </p>
              ))
            ) : (
              <small>NO SPACECRAFT ENCOUNTER</small>
            )}
          </div>
          <p className="source-note">
            NASA/JPL Small-Body Database API · v{comet.source.apiVersion} ·{" "}
            {comet.source.retrievedOn}
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
        <div className="interaction-hint" aria-label="Desktop controls">
          <span>
            <kbd>DRAG</kbd>
            <small>ORBIT</small>
          </span>
          <span>
            <kbd>SCROLL</kbd>
            <small>SCALE</small>
          </span>
          <span className="performance-readout">
            <strong>{fps}</strong>
            <small>FPS</small>
          </span>
        </div>
      </footer>
      {sceneState === "loading" ? (
        <div className="loading-screen" role="status">
          <div className="loading-orbit" aria-hidden="true">
            <span />
          </div>
          <p>LOADING MEASURED NUCLEUS</p>
          <small>
            {comet.name.toUpperCase()} · SPK {comet.spkId}
          </small>
        </div>
      ) : null}
    </div>
  );
};
