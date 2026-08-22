import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomStar, CustomWorld } from "@exora/worldgen";
import { useEffect, useRef, useState } from "react";
import { loadPlanetsByHost, type StarLoadResult } from "../api-client.ts";
import type { StarWorld } from "../star-scene.ts";
import { formatNumber } from "../planet-utils.tsx";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import { deriveStarVisual, starKindLabel, starSummary } from "../star-utils.ts";
import { isXrEmulated } from "../xr-emulator.ts";

interface StarExperienceProps {
  host: SceneHost | null;
  onGeneratePlanet: (world: CustomWorld) => void;
  onGenerateStar: (star: CustomStar) => void;
  onOpenBuilder: () => void;
  onOpenPlanets: () => void;
  onOpenStars: () => void;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
  onSelectSystem: (hostStar: string) => Promise<boolean>;
  result: StarLoadResult;
  systemHostName: string | null;
}

const xrCopy: Record<XrStatus, { button: string; label: string }> = {
  checking: { button: "CHECKING HEADSET", label: "CHECKING WEBXR" },
  entering: { button: "ENTERING SESSION", label: "OPENING IMMERSIVE VR" },
  "in-xr": { button: "SESSION ACTIVE", label: "IMMERSIVE VR ACTIVE" },
  ready: { button: "ENTER IMMERSIVE VR", label: "WEBXR READY" },
  unavailable: { button: "VR UNAVAILABLE", label: "DESKTOP EXPLORATION" },
};

export const StarExperience = ({
  host,
  onGeneratePlanet,
  onGenerateStar,
  onOpenBuilder,
  onOpenPlanets,
  onOpenStars,
  onSelectPlanet,
  onSelectStar,
  onSelectSystem,
  result,
  systemHostName,
}: StarExperienceProps) => {
  const worldRef = useRef<StarWorld | null>(null);
  const [fps, setFps] = useState("--");
  const [qualityTier, setQualityTier] = useState("AUTO");
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "error">("loading");
  const [xrStatus, setXrStatus] = useState<XrStatus>("checking");
  const [systemPlanets, setSystemPlanets] = useState<ExoplanetProfile[]>([]);
  const [systemCached, setSystemCached] = useState(false);
  const [systemState, setSystemState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [dioramaState, setDioramaState] = useState<"error" | "idle" | "loading">("idle");
  const star = result.star;
  const observation = star.observation;
  const visual = deriveStarVisual(star);
  const custom = result.mode === "custom";

  /**
   * The name the archive files this system under.
   *
   * SIMBAD and NASA rarely spell a host the same way, so the diorama is asked for under whichever
   * alias actually returned worlds, falling back to the star's own name. Held in a ref because
   * the console entry inside the headset is handed to the scene at mount, before the archive has
   * answered — reading the state directly would leave it travelling to whatever was known then.
   */
  const dioramaHostRef = useRef(star.name);
  useEffect(() => {
    dioramaHostRef.current = systemHostName ?? systemPlanets[0]?.hostStar ?? star.name;
  }, [star.name, systemHostName, systemPlanets]);

  const openSystem = async (): Promise<void> => {
    if (dioramaState === "loading") return;
    setDioramaState("loading");
    const found = await onSelectSystem(dioramaHostRef.current);
    setDioramaState(found ? "idle" : "error");
  };

  useEffect(() => {
    if (custom) {
      setSystemPlanets([]);
      setSystemState("idle");
      return;
    }
    const controller = new AbortController();
    const aliases = [systemHostName, star.name, star.catalogName.replace(/^\*\s*/, "")].filter(
      (name, index, names): name is string => Boolean(name) && names.indexOf(name) === index,
    );
    setSystemState("loading");
    void (async () => {
      for (const alias of aliases) {
        const response = await loadPlanetsByHost(alias, { signal: controller.signal });
        if (response.planets.length > 0) return response;
      }
      return null;
    })()
      .then((response) => {
        if (controller.signal.aborted) return;
        setSystemPlanets(response?.planets ?? []);
        setSystemCached(response?.cached ?? false);
        setSystemState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setSystemState("error");
      });
    return () => controller.abort();
  }, [custom, star.catalogName, star.name, systemHostName]);

  useEffect(() => {
    worldRef.current?.setSystemWorlds(systemPlanets, (planet) =>
      onSelectPlanet(planet, systemCached),
    );
  }, [onSelectPlanet, sceneState, systemCached, systemPlanets]);

  useEffect(() => {
    document.body.dataset.xrStatus = xrStatus;
  }, [xrStatus]);

  useEffect(() => host?.onXrStatus(setXrStatus), [host]);

  useEffect(() => {
    if (!host) return;
    setQualityTier(host.qualityTier.toUpperCase());
    const fpsTimer = window.setInterval(() => setFps(Math.round(host.getFps()).toString()), 1_000);
    return () => window.clearInterval(fpsTimer);
  }, [host]);

  // The world is handed to the shared renderer, which disposes the previous one as it takes
  // this one. Nothing is torn down when this view unmounts: a running immersive session is
  // living on that renderer, and the destination replacing this view is what releases it.
  useEffect(() => {
    if (!host) return;
    let abandoned = false;
    setSceneState("loading");
    void import("../star-scene.ts")
      .then(({ createStarWorld }) =>
        host.mountWorld(() =>
          createStarWorld(host, {
            star,
            // The console inside the headset can travel anywhere the browser catalog can, so the
            // same selection handlers the DOM dialogs use are handed to the scene.
            onSelectPlanet: (destination) => onSelectPlanet(destination, false),
            onSelectStar: (destination) => onSelectStar(destination, false),
            onSelectSystem: custom ? undefined : () => void openSystem(),
            onForgeWorld: onGeneratePlanet,
            onForgeStar: onGenerateStar,
            onFirstFrame: () => {
              if (!abandoned) setSceneState("ready");
            },
          }),
        ),
      )
      .then((world) => {
        if (!world) return;
        worldRef.current = world;
        world.setSystemWorlds(systemPlanets, (planet) => onSelectPlanet(planet, systemCached));
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!abandoned) setSceneState("error");
      });
    return () => {
      abandoned = true;
    };
  }, [custom, host, onGeneratePlanet, onGenerateStar, onSelectPlanet, onSelectStar, star]);

  return (
    <div
      className={`experience-shell star-experience ${sceneState !== "loading" ? "scene-ready" : ""} ${sceneState === "error" ? "scene-error" : ""}`}
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
            className="star-trigger active"
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
        <section className="world-intro" aria-labelledby="star-name">
          <p className="eyebrow">
            <span>{custom ? "GENERATED STAR" : "OBSERVED STAR"}</span>
            <span>{starKindLabel(star)}</span>
          </p>
          <h1 id="star-name">{star.name}</h1>
          <div className="world-tags">
            <span>{visual.label}</span>
            <span>{observation.spectralType ?? "SPECTRUM UNKNOWN"}</span>
            <span>
              {custom ? "" : "~"}
              {formatNumber(visual.estimatedTemperatureKelvin, 0)} K
            </span>
          </div>
          <p className="world-summary">{starSummary(star)}</p>
          <p className="visual-note">
            <span aria-hidden="true" />{" "}
            {custom
              ? "USER-DESIGNED PROCEDURAL STAR"
              : "STELLAR APPEARANCE INFERRED FROM SPECTRAL CLASS"}
          </p>
          {!custom ? (
            <section className="known-worlds" aria-labelledby="known-worlds-title">
              <div>
                <p>CONNECTED SYSTEM</p>
                <h2 id="known-worlds-title">Known worlds</h2>
              </div>
              {systemState === "loading" ? (
                <small role="status">QUERYING NASA ARCHIVE…</small>
              ) : null}
              {systemState === "error" ? (
                <small role="status">SYSTEM LINK UNAVAILABLE</small>
              ) : null}
              {systemState === "ready" && systemPlanets.length === 0 ? (
                <small>NO CONFIRMED WORLDS LINKED</small>
              ) : null}
              {systemPlanets.length > 0 ? (
                <button
                  className="system-jump diorama-jump"
                  type="button"
                  disabled={dioramaState === "loading"}
                  onClick={() => void openSystem()}
                >
                  <span aria-hidden="true">◎</span>
                  <strong>Whole system</strong>
                  <small>
                    {dioramaState === "loading" ? "PLACING ORBITS…" : "STAND AMONG THE ORBITS ↗"}
                  </small>
                </button>
              ) : null}
              {dioramaState === "error" ? (
                <small className="system-jump-error" role="status">
                  The archive links no placeable orbits to this host.
                </small>
              ) : null}
              {systemPlanets.length > 0 ? (
                <div className="known-world-list">
                  {systemPlanets.map((planet) => (
                    <button
                      key={planet.id}
                      type="button"
                      onClick={() => onSelectPlanet(planet, systemCached)}
                    >
                      <span className={`known-world-orb ${planet.kind}`} aria-hidden="true" />
                      <span>
                        <strong>{planet.name}</strong>
                        <small>{planet.kind.replace("-", " ")} · VISIT ↗</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </section>

        <aside
          className="telemetry"
          aria-label={custom ? "Custom star data" : "Observed star data"}
        >
          <div className="telemetry-heading">
            <span>
              <small>{custom ? "WORLD FORGE" : "SIMBAD ARCHIVE"}</small>
              {custom ? "Chosen properties" : "Observed properties"}
            </span>
            <span className="signal-bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>
          <dl>
            {custom ? (
              <>
                <div>
                  <dt>Temperature</dt>
                  <dd>
                    {formatNumber(star.customization?.temperatureKelvin ?? null, 0)}{" "}
                    <small>K</small>
                  </dd>
                </div>
                <div>
                  <dt>Scale</dt>
                  <dd>
                    {formatNumber((star.customization?.radius ?? 0) * 100, 0)} <small>%</small>
                  </dd>
                </div>
                <div>
                  <dt>Activity</dt>
                  <dd>
                    {formatNumber((star.customization?.activity ?? 0) * 100, 0)} <small>%</small>
                  </dd>
                </div>
                <div>
                  <dt>Rotation</dt>
                  <dd>
                    {formatNumber((star.customization?.rotation ?? 0) * 100, 0)} <small>%</small>
                  </dd>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
          </dl>
          <div className="telemetry-detail">
            <span>CATALOG ID</span>
            <strong>{star.catalogName}</strong>
            <small>
              {star.objectType} · {star.kind.replaceAll("-", " ")}
            </small>
          </div>
          <div className="telemetry-detail">
            <span>{custom ? "GENERATION SEED" : "SPACE MOTION"}</span>
            <strong>
              {custom
                ? star.customization?.seed
                : `${formatNumber(observation.radialVelocityKmPerSecond, 1)} KM/S RADIAL`}
            </strong>
            <small>
              {custom
                ? "REPRODUCIBLE PROCEDURAL PROFILE"
                : `RA ${formatNumber(observation.properMotionRaMasPerYear, 1)} · DEC ${formatNumber(observation.properMotionDecMasPerYear, 1)} MAS/YR`}
            </small>
          </div>
          <p className="source-note">
            {custom ? "EXORA CUSTOM GENERATOR · PROCEDURAL" : "SIMBAD · BASIC + IDENT + ALLFLUXES"}{" "}
            · {star.source.retrievedOn}
          </p>
        </aside>
      </main>

      <footer className="mission-control">
        <div className="system-status">
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
        <p>RESOLVING STAR</p>
        <small>{star.name.toUpperCase()} · SPECTRAL MODEL</small>
      </div>
    </div>
  );
};
