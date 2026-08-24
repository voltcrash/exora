import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomStar, CustomWorld } from "@exora/worldgen";
import { useEffect, useRef, useState } from "react";
import type { StarLoadResult } from "../api-client.ts";
import { reachSystem } from "../destination-cache.ts";
import type { StarWorld } from "../star-scene.ts";
import { formatNumber } from "../planet-utils.tsx";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import { deriveStarVisual, starKindLabel, starSummary } from "../star-utils.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { DiscoverTrigger } from "./DiscoverTrigger.tsx";

interface StarExperienceProps {
  chromeHidden: boolean;
  host: SceneHost | null;
  onGeneratePlanet: (world: CustomWorld) => void;
  onGenerateStar: (star: CustomStar) => void;
  onHideChrome: () => void;
  onOpenDiscover: () => void;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
  onSelectSystem: (hostStar: string) => Promise<boolean>;
  result: StarLoadResult;
  systemHostName: string | null;
  travelPhase: TravelPhase;
}

const xrButtonCopy: Record<XrStatus, string> = {
  checking: "CHECKING HEADSET",
  entering: "ENTERING SESSION",
  "in-xr": "SESSION ACTIVE",
  ready: "ENTER IMMERSIVE VR",
  unavailable: "VR UNAVAILABLE",
};

export const StarExperience = ({
  chromeHidden,
  host,
  onGeneratePlanet,
  onGenerateStar,
  onHideChrome,
  onOpenDiscover,
  onSelectPlanet,
  onSelectStar,
  onSelectSystem,
  result,
  systemHostName,
  travelPhase,
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
  const solar = result.mode === "solar";
  // A jump in the air owns the screen: this view's panels go with the world being left, and its
  // loading card stays down, because the flight is what stands in for it now.
  const travelling = travelPhase === "departing" || travelPhase === "crossing";
  const settled = sceneState !== "loading" || travelPhase !== "idle";

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
    // The pull-away and the archive request go out together, so the click reads immediately
    // rather than after however long the answer takes.
    host?.beginTravel();
    // A lookup that fails outright is a destination that is not there: it has to reach the
    // `cancelTravel` below, or the flight would hang pulled back with no world to return to.
    const found = await onSelectSystem(dioramaHostRef.current).catch(() => false);
    if (!found) host?.cancelTravel();
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
        // The same lookup the diorama jump makes, so asking here is what makes that jump
        // instant: whichever alias answers is the one already in hand when it is taken.
        const response = await reachSystem(alias);
        if (response) return response;
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
      className={`experience-shell star-experience ${settled ? "scene-ready" : ""} ${sceneState === "error" ? "scene-error" : ""} ${travelling ? "travelling" : ""} ${chromeHidden ? "chrome-hidden" : ""}`}
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
          <DiscoverTrigger onClick={onOpenDiscover} />
        </div>
      </header>

      <main className="hud">
        <section className="world-intro" aria-labelledby="star-name">
          <p className="eyebrow">
            <span>{custom ? "GENERATED STAR" : solar ? "OUR STAR" : "OBSERVED STAR"}</span>
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
              : solar
                ? "NASA/JPL MEASUREMENTS · EXORA STELLAR SURFACE"
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
              <small>{custom ? "WORLD FORGE" : solar ? "NASA/JPL" : "SIMBAD ARCHIVE"}</small>
              {custom
                ? "Chosen properties"
                : solar
                  ? "Home-star parameters"
                  : "Observed properties"}
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
            {custom
              ? "EXORA CUSTOM GENERATOR · PROCEDURAL"
              : solar
                ? "NASA/JPL SOLAR SYSTEM DYNAMICS · PLANETARY PHYSICAL PARAMETERS"
                : "SIMBAD · BASIC + IDENT + ALLFLUXES"}{" "}
            · {star.source.retrievedOn}
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
        <p>RESOLVING STAR</p>
        <small>{star.name.toUpperCase()} · SPECTRAL MODEL</small>
      </div>
    </div>
  );
};
