import type { StarProfile } from "@exora/contracts";
import { useEffect, useRef, useState } from "react";
import type { StarSceneExperience } from "../star-scene.ts";
import { formatNumber } from "../planet-utils.tsx";
import { deriveStarVisual, starKindLabel, starSummary } from "../star-utils.ts";
import type { XrStatus } from "../planet-scene.ts";

interface StarExperienceProps {
  cached: boolean;
  onOpenPlanets: () => void;
  onOpenStars: () => void;
  star: StarProfile;
}

const xrCopy: Record<XrStatus, { button: string; label: string }> = {
  checking: { button: "CHECKING HEADSET", label: "CHECKING WEBXR" },
  entering: { button: "ENTERING SESSION", label: "OPENING IMMERSIVE VR" },
  "in-xr": { button: "SESSION ACTIVE", label: "IMMERSIVE VR ACTIVE" },
  ready: { button: "ENTER IMMERSIVE VR", label: "WEBXR READY" },
  unavailable: { button: "VR UNAVAILABLE", label: "DESKTOP EXPLORATION" },
};

export const StarExperience = ({
  cached,
  onOpenPlanets,
  onOpenStars,
  star,
}: StarExperienceProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const experienceRef = useRef<StarSceneExperience | null>(null);
  const [fps, setFps] = useState("--");
  const [qualityTier, setQualityTier] = useState("AUTO");
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "error">("loading");
  const [xrStatus, setXrStatus] = useState<XrStatus>("checking");
  const observation = star.observation;
  const visual = deriveStarVisual(star);

  useEffect(() => {
    document.body.dataset.xrStatus = xrStatus;
  }, [xrStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let fpsTimer: number | undefined;
    setSceneState("loading");
    setXrStatus("checking");
    void import("../star-scene.ts")
      .then(({ createStarScene }) =>
        createStarScene({
          canvas,
          star,
          onFirstFrame: () => {
            if (!disposed) setSceneState("ready");
          },
          onXrStatusChange: setXrStatus,
        }),
      )
      .then((experience) => {
        if (disposed) return experience.dispose();
        experienceRef.current = experience;
        setQualityTier(experience.qualityTier.toUpperCase());
        fpsTimer = window.setInterval(
          () => setFps(Math.round(experience.getFps()).toString()),
          1_000,
        );
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!disposed) setSceneState("error");
      });
    return () => {
      disposed = true;
      if (fpsTimer !== undefined) window.clearInterval(fpsTimer);
      experienceRef.current?.dispose();
      experienceRef.current = null;
    };
  }, [star]);

  return (
    <div
      className={`experience-shell star-experience ${sceneState !== "loading" ? "scene-ready" : ""} ${sceneState === "error" ? "scene-error" : ""}`}
    >
      <canvas
        ref={canvasRef}
        id="render-canvas"
        aria-label={`Interactive visualization of ${star.name}`}
        tabIndex={0}
      />
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
          <button className="catalog-trigger compact-trigger" type="button" onClick={onOpenPlanets}>
            <span className="catalog-radar" aria-hidden="true" />
            <span>
              <small>NASA CATALOG</small>
              <strong>PLANETS</strong>
            </span>
          </button>
          <button
            id="open-star-catalog"
            className="star-trigger active"
            type="button"
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
        </div>
        <div className="archive-state">
          <span className="pulse-dot" aria-hidden="true" />
          SIMBAD · {cached ? "CACHED" : "LIVE"}
        </div>
      </header>

      <main className="hud">
        <section className="world-intro" aria-labelledby="star-name">
          <p className="eyebrow">
            <span>OBSERVED STAR</span>
            <span>{starKindLabel(star)}</span>
          </p>
          <h1 id="star-name">{star.name}</h1>
          <div className="world-tags">
            <span>{visual.label}</span>
            <span>{observation.spectralType ?? "SPECTRUM UNKNOWN"}</span>
            <span>~{formatNumber(visual.estimatedTemperatureKelvin, 0)} K</span>
          </div>
          <p className="world-summary">{starSummary(star)}</p>
          <p className="visual-note">
            <span aria-hidden="true" /> STELLAR APPEARANCE INFERRED FROM SPECTRAL CLASS
          </p>
        </section>

        <aside className="telemetry" aria-label="Observed star data">
          <div className="telemetry-heading">
            <span>
              <small>SIMBAD ARCHIVE</small>Observed properties
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
              <dt>Distance</dt>
              <dd>
                {formatNumber(observation.distanceParsecs, 2)} <small>PC</small>
              </dd>
            </div>
            <div>
              <dt>V magnitude</dt>
              <dd>
                {formatNumber(observation.visualMagnitude, 2)} <small>MAG</small>
              </dd>
            </div>
            <div>
              <dt>RA</dt>
              <dd>
                {formatNumber(observation.rightAscensionDegrees, 2)} <small>°</small>
              </dd>
            </div>
            <div>
              <dt>DEC</dt>
              <dd>
                {formatNumber(observation.declinationDegrees, 2)} <small>°</small>
              </dd>
            </div>
          </dl>
          <div className="telemetry-detail">
            <span>CATALOG ID</span>
            <strong>{star.catalogName}</strong>
            <small>
              {star.objectType} · {star.kind.replaceAll("-", " ")}
            </small>
          </div>
          <div className="telemetry-detail">
            <span>SPACE MOTION</span>
            <strong>{formatNumber(observation.radialVelocityKmPerSecond, 1)} KM/S RADIAL</strong>
            <small>
              RA {formatNumber(observation.properMotionRaMasPerYear, 1)} · DEC{" "}
              {formatNumber(observation.properMotionDecMasPerYear, 1)} MAS/YR
            </small>
          </div>
          <p className="source-note">
            SIMBAD · BASIC + IDENT + ALLFLUXES · {star.source.retrievedOn}
          </p>
        </aside>
      </main>

      <footer className="mission-control">
        <div className="system-status">
          <span className="status-light" aria-hidden="true" />
          <span>
            <small>SESSION STATUS</small>
            <strong>
              {sceneState === "error" ? "RENDERER UNAVAILABLE" : xrCopy[xrStatus].label}
            </strong>
          </span>
        </div>
        <div className="interaction-hint">
          <span>
            <kbd>DRAG</kbd>
            <small>ORBIT</small>
          </span>
          <span>
            <kbd>SCROLL</kbd>
            <small>ZOOM</small>
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
          onClick={() => void experienceRef.current?.enterVr().catch(() => setXrStatus("ready"))}
        >
          <span className="button-orbit" aria-hidden="true" />
          <span>
            <small>IMMERSIVE MODE</small>
            <strong>{xrCopy[xrStatus].button}</strong>
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
        <p>RESOLVING STAR</p>
        <small>{star.name.toUpperCase()} · SPECTRAL MODEL</small>
      </div>
    </div>
  );
};
