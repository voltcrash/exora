import { deriveWorldRecipe } from "@exora/worldgen";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PlanetLoadResult } from "../api-client.ts";
import type { PlanetExperience as BabylonExperience, XrStatus } from "../planet-scene.ts";
import { archiveStateLabel, formatNumber, formatPlanetName } from "../planet-utils.tsx";

interface PlanetExperienceProps {
  onOpenCatalog: () => void;
  result: PlanetLoadResult;
}

const xrCopy: Record<XrStatus, { button: string; label: string }> = {
  checking: { button: "CHECKING HEADSET", label: "CHECKING WEBXR" },
  entering: { button: "ENTERING SESSION", label: "OPENING IMMERSIVE VR" },
  "in-xr": { button: "SESSION ACTIVE", label: "IMMERSIVE VR ACTIVE" },
  ready: { button: "ENTER IMMERSIVE VR", label: "WEBXR READY" },
  unavailable: { button: "VR UNAVAILABLE", label: "DESKTOP EXPLORATION" },
};

export const PlanetExperience = ({ onOpenCatalog, result }: PlanetExperienceProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const experienceRef = useRef<BabylonExperience | null>(null);
  const [fps, setFps] = useState("--");
  const [qualityTier, setQualityTier] = useState("AUTO");
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "error">("loading");
  const [xrStatus, setXrStatus] = useState<XrStatus>("checking");
  const planet = result.planet;
  const observation = planet.observation;
  const recipe = useMemo(() => deriveWorldRecipe(planet), [planet]);

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
    setFps("--");

    void import("../planet-scene.ts")
      .then(({ createPlanetExperience }) =>
        createPlanetExperience({
          canvas,
          recipe,
          onXrStatusChange: setXrStatus,
          onFirstFrame: () => {
            if (!disposed) setSceneState("ready");
          },
        }),
      )
      .then((experience) => {
        if (disposed) {
          experience.dispose();
          return;
        }
        experienceRef.current = experience;
        setQualityTier(experience.qualityTier.toUpperCase());
        document.body.dataset.qualityTier = experience.qualityTier;
        fpsTimer = window.setInterval(() => {
          setFps(Math.round(experience.getFps()).toString());
        }, 1_000);
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
  }, [planet.id, recipe]);

  const massUnit =
    observation.massJupiter !== null ? (
      <>
        M<sub>J</sub>
      </>
    ) : (
      <>
        M<sub>⊕</sub>
      </>
    );
  const massValue = observation.massJupiter ?? observation.massEarth;
  const radiusUnit =
    observation.radiusJupiter !== null ? (
      <>
        R<sub>J</sub>
      </>
    ) : (
      <>
        R<sub>⊕</sub>
      </>
    );
  const radiusValue = observation.radiusJupiter ?? observation.radiusEarth;

  return (
    <div
      className={`experience-shell ${sceneState === "ready" || sceneState === "error" ? "scene-ready" : ""} ${sceneState === "error" ? "scene-error" : ""}`}
    >
      <canvas
        ref={canvasRef}
        id="render-canvas"
        aria-label={`Interactive visualization of ${planet.name}`}
        tabIndex={0}
      />
      <div className="space-haze" aria-hidden="true" />
      <div className="viewport-grid" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="/" aria-label="Exora home">
          <span className="brand-mark" aria-hidden="true" />
          <span>EXORA</span>
        </a>
        <button id="open-catalog" className="catalog-trigger" type="button" onClick={onOpenCatalog}>
          <span className="catalog-radar" aria-hidden="true" />
          <span>
            <small>WORLD CATALOG</small>
            <strong>FIND A PLANET</strong>
          </span>
          <kbd>/</kbd>
        </button>
        <div className="archive-state">
          <span className="pulse-dot" aria-hidden="true" />
          {archiveStateLabel(result)}
        </div>
      </header>

      <main className="hud">
        <section className="world-intro" aria-labelledby="world-name">
          <p className="eyebrow">
            <span>CONFIRMED EXOPLANET</span>
            <span>ACTIVE WORLD</span>
          </p>
          <h1 id="world-name">{formatPlanetName(planet.name)}</h1>
          <div className="world-tags" aria-label="World classification">
            <span>{recipe.classification}</span>
            <span>
              {observation.equilibriumTemperatureKelvin === null
                ? "TEMP UNKNOWN"
                : `${formatNumber(observation.equilibriumTemperatureKelvin, 0)} K`}
            </span>
            <span>{observation.discoveryMethod}</span>
          </div>
          <p className="world-summary">{recipe.summary}</p>
          <p className="visual-note">
            <span aria-hidden="true">◈</span> Visual synthesis — not observed imagery
          </p>
        </section>

        <aside className="telemetry" aria-label="Observed planet data">
          <div className="telemetry-heading">
            <span>OBSERVED SIGNAL</span>
            <span className="signal-bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>
          <dl>
            <div>
              <dt>Mass</dt>
              <dd>
                {formatNumber(massValue)} <small>{massUnit}</small>
              </dd>
            </div>
            <div>
              <dt>Radius</dt>
              <dd>
                {formatNumber(radiusValue)} <small>{radiusUnit}</small>
              </dd>
            </div>
            <div>
              <dt>Orbit</dt>
              <dd>
                {formatNumber(observation.semiMajorAxisAu, 1)} <small>AU</small>
              </dd>
            </div>
            <div>
              <dt>Distance</dt>
              <dd>
                {formatNumber(observation.distanceParsecs, 0)} <small>PC</small>
              </dd>
            </div>
          </dl>
          <div className="telemetry-detail">
            <span>HOST STAR</span>
            <strong>{planet.hostStar}</strong>
            <small>{observation.hostSpectralType ?? "Spectrum unavailable"}</small>
          </div>
          <div className="telemetry-detail">
            <span>ATMOSPHERE MODEL</span>
            <strong>{recipe.atmosphere.label.split(" · ")[0]}</strong>
            <small>Exora inference · {recipe.confidence} confidence</small>
          </div>
          <p className="source-note">
            {planet.source.archive} · {planet.source.table} · {planet.source.retrievedOn}
          </p>
        </aside>
      </main>

      <footer className="mission-control">
        <div className="system-status" aria-live="polite">
          <span className="status-light" aria-hidden="true" />
          <span>
            <small>EXPLORATION MODE</small>
            <strong>
              {sceneState === "error" ? "RENDERER UNAVAILABLE" : xrCopy[xrStatus].label}
            </strong>
          </span>
        </div>
        <div className="interaction-hint" aria-label="Desktop controls">
          <span>
            <kbd>DRAG</kbd> ORBIT
          </span>
          <span>
            <kbd>SCROLL</kbd> RANGE
          </span>
          <span>
            <strong>{fps}</strong> FPS · <strong>{qualityTier}</strong>
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
            <small>QUEST / WEBXR</small>
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
        <p>CALCULATING WORLD</p>
        <small>
          {planet.name.toUpperCase()} · SEED {recipe.seed.toString(16).toUpperCase()}
        </small>
      </div>
    </div>
  );
};
