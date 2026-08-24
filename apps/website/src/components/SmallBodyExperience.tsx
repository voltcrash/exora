import type { StarProfile } from "@exora/contracts";
import { useEffect, useState } from "react";
import { selectIrregularShapeAsset } from "../irregular-body.ts";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import type { AsteroidProfile } from "../solar-asteroids.ts";
import { findSolarAsteroid } from "../solar-asteroids.ts";
import { findSolarStar } from "../solar-system.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { MissionControl } from "./MissionControl.tsx";

interface SmallBodyExperienceProps {
  asteroid: AsteroidProfile;
  chromeHidden: boolean;
  host: SceneHost | null;
  onHideChrome: () => void;
  onOpenDiscover: () => void;
  onSelectAsteroid: (asteroid: AsteroidProfile) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
  travelPhase: TravelPhase;
}

const compact = (value: number | null, digits = 3): string =>
  value === null
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const SmallBodyExperience = ({
  asteroid,
  chromeHidden,
  host,
  onHideChrome,
  onOpenDiscover,
  onSelectAsteroid,
  onSelectStar,
  travelPhase,
}: SmallBodyExperienceProps) => {
  const [fps, setFps] = useState("--");
  const [qualityTier, setQualityTier] = useState("AUTO");
  const [sceneState, setSceneState] = useState<"error" | "loading" | "ready">("loading");
  const [xrStatus, setXrStatus] = useState<XrStatus>("checking");
  const travelling = travelPhase === "departing" || travelPhase === "crossing";
  const measuredGeometry =
    host === null
      ? asteroid.descriptor.shapeModel !== undefined
      : selectIrregularShapeAsset(
          asteroid.descriptor.shapeModel,
          host.profile.maxIrregularBodyTriangles,
        ) !== null;

  useEffect(() => host?.onXrStatus(setXrStatus), [host]);

  useEffect(() => {
    if (!host) return;
    setQualityTier(host.qualityTier.toUpperCase());
    document.body.dataset.qualityTier = host.qualityTier;
    const timer = window.setInterval(() => setFps(Math.round(host.getFps()).toString()), 1_000);
    return () => window.clearInterval(timer);
  }, [host]);

  useEffect(() => {
    if (!host) return;
    let abandoned = false;
    setSceneState("loading");
    void import("../small-body-scene.ts")
      .then(({ createSmallBodyWorld }) =>
        host.mountWorld(() =>
          createSmallBodyWorld(host, {
            asteroid,
            onFirstFrame: () => {
              if (!abandoned) setSceneState("ready");
            },
            onSelectAsteroid,
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
  }, [asteroid, host, onSelectAsteroid]);

  const openParent = (): void => {
    const asteroidParent = findSolarAsteroid(asteroid.parent);
    if (asteroidParent) {
      onSelectAsteroid(asteroidParent);
      return;
    }
    const starParent = findSolarStar(asteroid.parent);
    if (starParent) onSelectStar(starParent, true);
  };

  return (
    <div
      className={`experience-shell small-body-experience scene-${sceneState} ${travelling ? "travelling" : ""} ${chromeHidden ? "chrome-hidden" : ""}`}
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
        <section className="world-intro" aria-labelledby="world-name">
          <p className="eyebrow">
            <span>MISSION ASTEROID</span>
            <span>{asteroid.orbit.class}</span>
          </p>
          <h1 id="world-name">{asteroid.name}</h1>
          <div className="world-tags" aria-label="Asteroid classification">
            <span>
              {asteroid.spectralType ? `${asteroid.spectralType}-TYPE` : "SPECTRUM UNKNOWN"}
            </span>
            <span>{asteroid.potentiallyHazardous ? "PHA" : "NOT PHA"}</span>
            <span>{asteroid.evidence.geometry.toUpperCase()} GEOMETRY</span>
          </div>
          <p className="world-summary">{asteroid.summary}</p>
          <p className="visual-note">
            <span aria-hidden="true" />{" "}
            {measuredGeometry
              ? "MEASURED PLATE GEOMETRY · PHYSICALLY NEUTRAL SURFACE · 1,200× ROTATION PREVIEW"
              : "MEASURED DIMENSIONS ONLY · UNRESOLVED SURFACE · NO INVENTED TOPOGRAPHY"}
          </p>
          <p className="small-body-discovery">{asteroid.discovery}</p>
          <p className="small-body-identifiers" aria-label="Permanent identifiers">
            <strong>SPK {asteroid.spkId}</strong>
            <span>NAIF {asteroid.naifId}</span>
          </p>
        </section>

        <aside className="telemetry small-body-telemetry" aria-label="Asteroid data">
          <div className="telemetry-heading">
            <span>
              <small>
                {asteroid.source.api.includes("SBDB")
                  ? "NASA/JPL SBDB 1.3"
                  : `${asteroid.source.api} ${asteroid.source.apiVersion}`}
              </small>
              Measured parameters
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
              <dt>Diameter</dt>
              <dd>
                {compact(asteroid.diameterKilometers.value, 5)} <small>KM</small>
              </dd>
            </div>
            <div>
              <dt>Rotation</dt>
              <dd>
                {asteroid.rotationHours.value ? compact(asteroid.rotationHours.value, 6) : "—"}{" "}
                <small>H</small>
              </dd>
            </div>
            <div>
              <dt>Orbit</dt>
              <dd>
                {compact(asteroid.orbit.semiMajorAxisAu, 6)} <small>AU</small>
              </dd>
            </div>
            <div>
              <dt>Inclination</dt>
              <dd>
                {compact(asteroid.orbit.inclinationDegrees, 5)} <small>DEG</small>
              </dd>
            </div>
          </dl>
          <div className="telemetry-detail host-system-detail">
            <span>DIRECT PARENT</span>
            <button className="system-jump" type="button" onClick={openParent}>
              <span aria-hidden="true">{asteroid.parent === "Sun" ? "☀" : "◉"}</span>
              <strong>{asteroid.parent}</strong>
              <small>VISIT PARENT ↗</small>
            </button>
          </div>
          <div className="telemetry-detail">
            <span>PERMANENT IDENTIFIERS</span>
            <strong>SPK {asteroid.spkId}</strong>
            <small>NAIF {asteroid.naifId}</small>
          </div>
          <div className="telemetry-detail scientific-disclosure">
            <span>UNCERTAINTY / LIMITS</span>
            <strong>ORBIT CONDITION {asteroid.orbit.conditionCode ?? "N/A"}</strong>
            <small>{asteroid.uncertaintyNote}</small>
          </div>
          {asteroid.closeApproach ? (
            <div className="telemetry-detail scientific-disclosure close-approach-disclosure">
              <span>EARTH CLOSE APPROACH · {asteroid.closeApproach.date}</span>
              <strong>{compact(asteroid.closeApproach.distanceAu, 9)} AU NOMINAL</strong>
              <small>
                JPL solution range {compact(asteroid.closeApproach.minimumAu, 9)}–
                {compact(asteroid.closeApproach.maximumAu, 9)} AU ·{" "}
                {compact(asteroid.closeApproach.relativeVelocityKilometersPerSecond, 3)} km/s
              </small>
            </div>
          ) : null}
          <div className="telemetry-detail mission-encounters">
            <span>MISSION ENCOUNTERS</span>
            {asteroid.missionEncounters.map((encounter) => (
              <p key={`${encounter.mission}-${encounter.date}`}>
                <strong>
                  {encounter.mission} · {encounter.date}
                </strong>
                <small>
                  {encounter.status.toUpperCase()} · {encounter.note}
                </small>
              </p>
            ))}
          </div>
          <p className="source-note">
            {asteroid.source.api} · v{asteroid.source.apiVersion} · {asteroid.source.retrievedOn}
          </p>
        </aside>
      </main>

      <MissionControl
        fps={fps}
        hints={[
          { key: "DRAG", meaning: "ORBIT" },
          { key: "SCROLL", meaning: "SCALE" },
        ]}
        onHideChrome={onHideChrome}
        onOpenDiscover={onOpenDiscover}
        qualityTier={qualityTier}
        sceneFailed={sceneState === "error"}
        xr={{ host, status: xrStatus }}
      />

      <div className="loading-screen" role="status">
        <div className="loading-orbit" aria-hidden="true">
          <span />
        </div>
        <p>LOADING MEASURED GEOMETRY</p>
        <small>
          {asteroid.name.toUpperCase()} · SPK {asteroid.spkId}
        </small>
      </div>
    </div>
  );
};
