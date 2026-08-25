import type { MissionTrajectoryResponse } from "@exora/contracts";
import { useEffect, useRef, useState } from "react";
import { loadMissionTrajectory } from "../api-client.ts";
import type { MissionWorld } from "../mission-scene.ts";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import type {
  MissionMilestone,
  SolarMissionProfile,
  SurfaceMissionSite,
} from "../solar-missions.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { FrameRateSignal } from "./FrameRateSignal.tsx";
import { MissionControl } from "./MissionControl.tsx";

interface MissionExperienceProps {
  chromeHidden: boolean;
  host: SceneHost | null;
  mission: SolarMissionProfile;
  onToggleChrome: () => void;
  onOpenParent: (parent: SolarMissionProfile["parent"]) => void;
  onOpenDiscover: () => void;
  travelPhase: TravelPhase;
}

const isSurfaceSite = (
  record: MissionMilestone | SurfaceMissionSite,
): record is SurfaceMissionSite => "longitudeDegreesEast" in record;

export const MissionExperience = ({
  chromeHidden,
  host,
  mission,
  onToggleChrome,
  onOpenParent,
  onOpenDiscover,
  travelPhase,
}: MissionExperienceProps) => {
  const [fps, setFps] = useState("--");
  const [xrStatus, setXrStatus] = useState<XrStatus>("checking");
  const [layerVisible, setLayerVisible] = useState(false);
  const [sceneState, setSceneState] = useState<"error" | "loading" | "ready">("loading");
  const [trajectory, setTrajectory] = useState<MissionTrajectoryResponse | null>(null);
  const [trajectoryState, setTrajectoryState] = useState<"error" | "loading" | "ready">(
    mission.kind === "trajectory" ? "loading" : "ready",
  );
  const worldRef = useRef<MissionWorld | null>(null);
  const travelling = travelPhase === "departing" || travelPhase === "crossing";

  useEffect(() => {
    setLayerVisible(false);
    setTrajectory(null);
    if (mission.kind !== "trajectory") {
      setTrajectoryState("ready");
      return;
    }
    const controller = new AbortController();
    setTrajectoryState("loading");
    void loadMissionTrajectory(mission.spkId, mission.trajectory, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setTrajectory(result);
        setTrajectoryState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setTrajectoryState("error");
      });
    return () => controller.abort();
  }, [mission]);

  useEffect(() => {
    if (!host || (mission.kind === "trajectory" && trajectoryState === "loading")) return;
    let abandoned = false;
    setSceneState("loading");
    void import("../mission-scene.ts")
      .then(({ createMissionWorld }) =>
        host.mountWorld(() => {
          const world = createMissionWorld(host, {
            mission,
            onFirstFrame: () => {
              if (!abandoned) setSceneState("ready");
            },
            // The same switch is on the page and on the in-headset console, so whichever one is
            // used, the other has to agree with it — including after the wearer takes the headset
            // off and finds the layer they turned on still on.
            onLayerVisibilityChange: (visible) => {
              if (!abandoned) setLayerVisible(visible);
            },
            trajectory,
          });
          worldRef.current = world;
          return world;
        }),
      )
      .catch((error: unknown) => {
        console.error(error);
        if (!abandoned) setSceneState("error");
      });
    return () => {
      abandoned = true;
      worldRef.current = null;
    };
  }, [host, mission, trajectory, trajectoryState]);

  useEffect(() => host?.onXrStatus(setXrStatus), [host]);

  useEffect(() => {
    if (!host) return;
    const timer = window.setInterval(() => setFps(Math.round(host.getFps()).toString()), 1_000);
    return () => window.clearInterval(timer);
  }, [host]);

  const toggleLayer = (): void => {
    const next = !layerVisible;
    setLayerVisible(next);
    worldRef.current?.setLayerVisible(next);
  };
  const records = mission.kind === "trajectory" ? mission.milestones : mission.sites;
  const evidence =
    mission.kind === "trajectory" ? "HORIZONS / SPICE TRAJECTORY" : "MEASURED LANDING SITES";
  const layerReady = mission.kind === "surface-sites" || trajectoryState === "ready";

  return (
    <div
      className={`experience-shell mission-experience scene-${sceneState} ${travelling ? "travelling" : ""} ${chromeHidden ? "chrome-hidden" : ""}`}
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
            <span>SPACE EXPLORATION</span>
            <span>{mission.agency}</span>
          </p>
          <h1 id="world-name">{mission.name}</h1>
          <div className="world-tags" aria-label="Mission evidence classification">
            <span>{evidence}</span>
            <span>OPTIONAL LAYER</span>
            <span>PARENT {mission.parent.toUpperCase()}</span>
          </div>
          <p className="world-summary">{mission.summary}</p>
          <p className="visual-note mission-visual-note">
            <span aria-hidden="true" /> MISSION LAYER IS OFF BY DEFAULT TO KEEP THE NATURAL SOLAR
            SYSTEM CLEAR
          </p>
          <button
            className="mission-layer-toggle"
            type="button"
            aria-pressed={layerVisible}
            disabled={!layerReady}
            onClick={toggleLayer}
          >
            {trajectoryState === "loading"
              ? "CONTACTING JPL HORIZONS…"
              : layerVisible
                ? "HIDE MISSION LAYER"
                : "SHOW MISSION LAYER"}
          </button>
          {trajectoryState === "error" ? (
            <p className="scene-alert" role="status">
              JPL TRAJECTORY UNAVAILABLE · NATURAL CONTEXT ONLY
            </p>
          ) : null}
          <p className="small-body-identifiers" aria-label="Permanent mission identifiers">
            <strong>
              {mission.kind === "trajectory"
                ? `SPACECRAFT SPK ${mission.spkId}`
                : `ANCHOR SPK ${mission.anchorSpkId}`}
            </strong>
            <span>
              {mission.kind === "trajectory"
                ? "NAIF SPACECRAFT CODE"
                : `NAIF ${mission.anchorNaifId}`}
            </span>
          </p>
        </section>
        <aside
          className="telemetry small-body-telemetry mission-telemetry"
          aria-label="Mission data"
        >
          <div className="telemetry-heading">
            <span>
              <small>{mission.agency}</small>Mission evidence
            </span>
            <FrameRateSignal fps={fps} />
          </div>
          <dl>
            <div>
              <dt>Start</dt>
              <dd>{mission.startDate}</dd>
            </div>
            <div>
              <dt>End</dt>
              <dd>{mission.endDate ?? "ACTIVE / EXTENDED"}</dd>
            </div>
            <div>
              <dt>Records</dt>
              <dd>{records.length}</dd>
            </div>
            <div>
              <dt>Layer</dt>
              <dd>{layerVisible ? "VISIBLE" : "HIDDEN"}</dd>
            </div>
          </dl>
          <div className="telemetry-detail host-system-detail">
            <span>DIRECT PARENT</span>
            <button
              className="system-jump"
              type="button"
              onClick={() => onOpenParent(mission.parent)}
            >
              <span aria-hidden="true">{mission.parent === "Sun" ? "☀" : "●"}</span>
              <strong>{mission.parent}</strong>
              <small>VISIT PARENT ↗</small>
            </button>
          </div>
          <div className="telemetry-detail mission-timeline">
            <span>{mission.kind === "trajectory" ? "MISSION MILESTONES" : "SURFACE POINTS"}</span>
            <ol>
              {records.map((record) => (
                <li key={`${record.date}-${record.label}`}>
                  <time dateTime={record.date}>{record.date}</time>
                  <strong>{record.label}</strong>
                  {isSurfaceSite(record) ? (
                    <small>
                      {Math.abs(record.latitudeDegrees).toFixed(4)}°
                      {record.latitudeDegrees < 0 ? "S" : "N"} ·{" "}
                      {Math.abs(record.longitudeDegreesEast).toFixed(4)}°
                      {record.longitudeDegreesEast < 0 ? "W" : "E"}
                      {record.missionId ? ` · ${record.missionId}` : ""}
                    </small>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
          <div className="telemetry-detail scientific-disclosure">
            <span>VISUALIZATION STATUS</span>
            <strong>{evidence}</strong>
            <small>
              {mission.kind === "trajectory"
                ? "Path samples are geometric heliocentric ecliptic-J2000 vectors. Radial distance is log-compressed; milestone markers snap to the nearest returned sample. Archival spacecraft solutions may not align with current target-body ephemerides."
                : "Markers reproduce reported landing coordinates. The neutral context globe is not a mission image or high-resolution terrain map, and marker sizes are exaggerated."}
            </small>
          </div>
          {trajectory ? (
            <div className="telemetry-detail scientific-disclosure">
              <span>LIVE TRAJECTORY RECORD</span>
              <strong>{trajectory.meta.solution}</strong>
              <small>
                {trajectory.data.length} TDB samples · {trajectory.meta.stepDays}-day interval ·{" "}
                {trajectory.meta.stale
                  ? "stale server cache"
                  : trajectory.meta.cached
                    ? "server cache"
                    : "fresh JPL response"}{" "}
                · retrieved {trajectory.meta.retrievedAt.slice(0, 10)}
              </small>
            </div>
          ) : null}
          <div className="telemetry-detail region-sources mission-sources">
            <span>AUTHORITATIVE SOURCES</span>
            {mission.sources.map((source) => (
              <p key={source.datasetId}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  <strong>{source.datasetId} ↗</strong>
                </a>
                <small>
                  {source.source} · {source.retrievedOn}
                </small>
              </p>
            ))}
          </div>
        </aside>
      </main>
      <MissionControl
        chromeHidden={chromeHidden}
        hints={[
          { key: "DRAG", meaning: "ORBIT" },
          { key: "SCROLL", meaning: "SCALE" },
        ]}
        onToggleChrome={onToggleChrome}
        onOpenDiscover={onOpenDiscover}
        sceneFailed={sceneState === "error"}
        xr={{ host, status: xrStatus }}
      />
      {sceneState === "loading" ? (
        <div className="loading-screen" role="status">
          <div className="loading-orbit" aria-hidden="true">
            <span />
          </div>
          <p>BUILDING MISSION CONTEXT</p>
          <small>
            {mission.name.toUpperCase()} · {evidence}
          </small>
        </div>
      ) : null}
    </div>
  );
};
