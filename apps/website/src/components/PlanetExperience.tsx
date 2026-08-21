import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import {
  deriveWorldRecipe,
  type CustomStar,
  type CustomWorld,
  type WorldRecipe,
} from "@exora/worldgen";
import { useEffect, useMemo, useState } from "react";
import type { PlanetLoadResult } from "../api-client.ts";
import type { ViewMode } from "../planet-scene.ts";
import { formatNumber, formatPlanetName } from "../planet-utils.tsx";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import { isXrEmulated } from "../xr-emulator.ts";

interface PlanetExperienceProps {
  host: SceneHost | null;
  onGeneratePlanet: (world: CustomWorld) => void;
  onGenerateStar: (star: CustomStar) => void;
  onOpenCatalog: () => void;
  onOpenBuilder: () => void;
  onOpenStars: () => void;
  onSelectHostStar: (hostStar: string) => Promise<boolean>;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
  recipeOverride: WorldRecipe | null;
  result: PlanetLoadResult;
}

const xrCopy: Record<XrStatus, { button: string; label: string }> = {
  checking: { button: "CHECKING HEADSET", label: "CHECKING WEBXR" },
  entering: { button: "ENTERING SESSION", label: "OPENING IMMERSIVE VR" },
  "in-xr": { button: "SESSION ACTIVE", label: "IMMERSIVE VR ACTIVE" },
  ready: { button: "ENTER IMMERSIVE VR", label: "WEBXR READY" },
  unavailable: { button: "VR UNAVAILABLE", label: "DESKTOP EXPLORATION" },
};

export const PlanetExperience = ({
  host,
  onGeneratePlanet,
  onGenerateStar,
  onOpenBuilder,
  onOpenCatalog,
  onOpenStars,
  onSelectHostStar,
  onSelectPlanet,
  onSelectStar,
  recipeOverride,
  result,
}: PlanetExperienceProps) => {
  const [fps, setFps] = useState("--");
  const [qualityTier, setQualityTier] = useState("AUTO");
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "error">("loading");
  const [viewMode, setViewMode] = useState<ViewMode>("orbit");
  const [xrStatus, setXrStatus] = useState<XrStatus>("checking");
  const [hostJumpState, setHostJumpState] = useState<"idle" | "loading" | "error">("idle");
  const planet = result.planet;
  const observation = planet.observation;
  const recipe = useMemo(
    () => recipeOverride ?? deriveWorldRecipe(planet),
    [planet, recipeOverride],
  );

  const openHostStar = async (): Promise<void> => {
    if (result.mode === "custom" || hostJumpState === "loading") return;
    setHostJumpState("loading");
    const found = await onSelectHostStar(planet.hostStar);
    if (!found) setHostJumpState("error");
  };

  useEffect(() => {
    document.body.dataset.xrStatus = xrStatus;
  }, [xrStatus]);

  useEffect(() => host?.onXrStatus(setXrStatus), [host]);

  useEffect(() => {
    if (!host) return;
    setQualityTier(host.qualityTier.toUpperCase());
    document.body.dataset.qualityTier = host.qualityTier;
    const fpsTimer = window.setInterval(() => {
      setFps(Math.round(host.getFps()).toString());
    }, 1_000);
    return () => window.clearInterval(fpsTimer);
  }, [host]);

  // The world is handed to the shared renderer, which disposes the previous one as it takes
  // this one. Nothing is torn down when this view unmounts: a running immersive session is
  // living on that renderer, and the destination replacing this view is what releases it.
  useEffect(() => {
    if (!host) return;

    let abandoned = false;
    setSceneState("loading");
    setViewMode("orbit");

    void import("../planet-scene.ts")
      .then(({ createPlanetWorld }) =>
        host.mountWorld(() =>
          createPlanetWorld(host, {
            planet,
            recipe,
            onViewModeChange: setViewMode,
            onSelectHostStar: result.mode === "custom" ? undefined : () => void openHostStar(),
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
      .catch((error: unknown) => {
        console.error(error);
        if (!abandoned) setSceneState("error");
      });

    return () => {
      abandoned = true;
    };
  }, [
    host,
    onGeneratePlanet,
    onGenerateStar,
    onSelectHostStar,
    onSelectPlanet,
    onSelectStar,
    planet,
    recipe,
    result.mode,
  ]);

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
      className={`experience-shell view-${viewMode} ${sceneState === "ready" || sceneState === "error" ? "scene-ready" : ""} ${sceneState === "error" ? "scene-error" : ""}`}
    >
      <div className="space-haze" aria-hidden="true" />
      <div className="viewport-grid" aria-hidden="true" />
      <div className="surface-veil" aria-hidden="true" />

      <div
        className="approach-status"
        role={viewMode === "surface" ? "status" : undefined}
        aria-hidden={viewMode !== "surface"}
        aria-live="polite"
      >
        <span className="approach-reticle" aria-hidden="true" />
        <span>
          <small>{recipe.renderer === "rocky" ? "SURFACE APPROACH" : "ATMOSPHERIC APPROACH"}</small>
          <strong>
            {recipe.renderer === "rocky" ? "TERRAIN VISTA ACTIVE" : "CLOUD DECK VISTA ACTIVE"}
          </strong>
        </span>
        <span>SCROLL OUT TO ORBIT</span>
      </div>

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
            id="open-catalog"
            className="catalog-trigger"
            type="button"
            aria-label="Open NASA exoplanet catalog"
            onClick={onOpenCatalog}
          >
            <span className="catalog-radar" aria-hidden="true" />
            <span>
              <small>NASA CATALOG</small>
              <strong>EXPLORE WORLDS</strong>
            </span>
            <kbd>/</kbd>
          </button>
          <button
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
        <section className="world-intro" aria-labelledby="world-name">
          <p className="eyebrow">
            <span>{result.mode === "custom" ? "GENERATED WORLD" : "CONFIRMED WORLD"}</span>
            <span>{planet.kind.replace("-", " ")}</span>
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
            <span aria-hidden="true" /> PLAUSIBLE VISUALIZATION FROM OBSERVED DATA
          </p>
        </section>

        <aside
          className="telemetry"
          aria-label={result.mode === "custom" ? "Custom planet data" : "Observed planet data"}
        >
          <div className="telemetry-heading">
            <span>
              <small>{result.mode === "custom" ? "WORLD FORGE" : "NASA ARCHIVE"}</small>
              {result.mode === "custom" ? "Chosen properties" : "Observed properties"}
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
          <div className="telemetry-detail host-system-detail">
            <span>HOST SYSTEM</span>
            {result.mode === "custom" ? (
              <strong>USER DEFINED</strong>
            ) : (
              <button
                className="system-jump"
                type="button"
                disabled={hostJumpState === "loading"}
                onClick={() => void openHostStar()}
              >
                <span aria-hidden="true">☀</span>
                <strong>{planet.hostStar}</strong>
                <small>{hostJumpState === "loading" ? "RESOLVING…" : "VISIT STAR ↗"}</small>
              </button>
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
              <small className="system-jump-error" role="status">
                SIMBAD could not resolve this host name.
              </small>
            ) : null}
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
            <small>SESSION STATUS</small>
            <strong>
              {sceneState === "error"
                ? "RENDERER UNAVAILABLE"
                : `${xrCopy[xrStatus].label}${isXrEmulated() ? " · EMULATED" : ""}`}
            </strong>
          </span>
        </div>
        <div className="interaction-hint" aria-label="Desktop controls">
          <span>
            <kbd>WASD</kbd>
            <small>MOVE</small>
          </span>
          <span>
            <kbd>DRAG</kbd>
            <small>{viewMode === "surface" ? "LOOK" : "ORBIT"}</small>
          </span>
          <span>
            <kbd>SCROLL</kbd>
            <small>{viewMode === "surface" ? "RETURN" : "ZOOM / APPROACH"}</small>
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
