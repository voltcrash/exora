import type { ExoplanetProfile } from "@exora/contracts";
import { WORLDGEN_VERSION } from "@exora/worldgen";
import { useEffect, useRef, useState } from "react";
import type { StarLoadResult } from "../api-client.ts";
import { reachStarSystem, reachSystem } from "../destination-cache.ts";
import { formatNumber } from "../planet-utils.tsx";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import { deriveStarVisual, starKindLabel, starSummary } from "../star-utils.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { FrameRateSignal } from "./FrameRateSignal.tsx";
import { MissionControl } from "./MissionControl.tsx";
import { MobileSheet } from "./MobileSheet.tsx";
import sharedStyles from "./ExperienceShared.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles);

interface StarExperienceProps {
  chromeHidden: boolean;
  host: SceneHost | null;
  onToggleChrome: () => void;
  onOpenDiscover: () => void;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectSystem: (hostStar: string) => Promise<boolean>;
  result: StarLoadResult;
  systemHostName: string | null;
  travelPhase: TravelPhase;
}

export const StarExperience = ({
  chromeHidden,
  host,
  onToggleChrome,
  onOpenDiscover,
  onSelectPlanet,
  onSelectSystem,
  result,
  systemHostName,
  travelPhase,
}: StarExperienceProps) => {
  const [fps, setFps] = useState("--");
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "error">("loading");
  const [xrStatus, setXrStatus] = useState<XrStatus>("checking");
  const [systemPlanets, setSystemPlanets] = useState<ExoplanetProfile[]>([]);
  const [systemCached, setSystemCached] = useState(false);
  const [systemState, setSystemState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [dioramaState, setDioramaState] = useState<"error" | "idle" | "loading">("idle");
  const [worldsOpen, setWorldsOpen] = useState(false);
  const star = result.star;
  const observation = star.observation;
  const visual = deriveStarVisual(star);
  const custom = result.mode === "custom";
  const solar = result.mode === "solar";
  const travelling = travelPhase === "departing" || travelPhase === "crossing";
  const settled = sceneState !== "loading" || travelPhase !== "idle";

  const dioramaHostRef = useRef(star.name);
  useEffect(() => {
    dioramaHostRef.current = systemHostName ?? systemPlanets[0]?.hostStar ?? star.name;
  }, [star.name, systemHostName, systemPlanets]);

  const openSystem = async (): Promise<void> => {
    if (dioramaState === "loading") return;
    setDioramaState("loading");
    host?.beginTravel();
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
    setSystemState("loading");
    const request =
      solar || systemHostName
        ? reachSystem(systemHostName ?? star.name)
        : reachStarSystem(star.name);
    void request
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
  }, [custom, solar, star.name, systemHostName]);

  useEffect(() => host?.onXrStatus(setXrStatus), [host]);

  useEffect(() => {
    if (!host) return;
    const fpsTimer = window.setInterval(() => setFps(Math.round(host.getFps()).toString()), 1_000);
    return () => window.clearInterval(fpsTimer);
  }, [host]);

  useEffect(() => {
    if (!host) return;
    let abandoned = false;
    setSceneState("loading");
    void import("../star-scene.ts")
      .then(({ createStarWorld }) =>
        host.mountWorld(() =>
          createStarWorld(host, {
            star,
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
  }, [host, star]);

  return (
    <div
      className={cx(
        `experience-shell star-experience ${settled ? "scene-ready" : ""} ${sceneState === "error" ? "scene-error" : ""} ${travelling ? "travelling" : ""} ${chromeHidden ? "chrome-hidden" : ""}`,
      )}
    >
      <div className={cx("space-haze")} aria-hidden="true" />
      <div className={cx("viewport-grid")} aria-hidden="true" />

      <header className={cx("topbar")} data-testid="topbar">
        <a className={cx("brand")} href="/" aria-label="Exora home">
          <span className={cx("brand-mark")} aria-hidden="true" />
          <span className={cx("brand-copy")}>
            <strong>EXORA</strong>
            <small>UNIVERSE OBSERVATORY</small>
          </span>
        </a>
      </header>

      <main className={cx("hud")} data-testid="hud">
        <section
          className={cx("world-intro")}
          data-testid="world-intro"
          aria-labelledby="star-name"
        >
          <p className={cx("eyebrow")}>
            <span>{custom ? "GENERATED STAR" : solar ? "OUR STAR" : "OBSERVED STAR"}</span>
            <span>{starKindLabel(star)}</span>
          </p>
          <h1 id="star-name">{star.name}</h1>
          <div className={cx("world-tags")}>
            <span>{visual.label}</span>
            <span>{observation.spectralType ?? "SPECTRUM UNKNOWN"}</span>
            <span>
              {custom ? "" : "~"}
              {formatNumber(visual.temperatureKelvin, 0)} K
            </span>
          </div>
          <p className={cx("world-summary")}>{starSummary(star)}</p>
          <p className={cx("visual-note")}>
            <span aria-hidden="true" />{" "}
            {custom
              ? `SHAREABLE URL RECIPE · WORLDGEN V${WORLDGEN_VERSION}`
              : solar
                ? "NASA/JPL MEASUREMENTS · EXORA STELLAR SURFACE"
                : observation.effectiveTemperatureKelvin == null
                  ? "STELLAR APPEARANCE INFERRED FROM SIMBAD SPECTRAL CLASS"
                  : "SIMBAD STELLAR MEASUREMENTS · EXORA STELLAR SURFACE"}
          </p>
          {!custom ? (
            <section className={cx("known-worlds")} aria-labelledby="known-worlds-title">
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
                  className={cx("system-jump diorama-jump")}
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
                <small className={cx("system-jump-error")} role="status">
                  The archive links no placeable orbits to this host.
                </small>
              ) : null}
              {systemPlanets.length > 0 ? (
                <div className={cx("known-world-list")}>
                  {systemPlanets.map((planet) => (
                    <button
                      key={planet.id}
                      type="button"
                      onClick={() => onSelectPlanet(planet, systemCached)}
                    >
                      <span className={cx(`known-world-orb ${planet.kind}`)} aria-hidden="true" />
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
          className={cx("telemetry")}
          data-testid="telemetry"
          aria-label={custom ? "Custom star data" : "Observed star data"}
        >
          <div className={cx("telemetry-heading")}>
            <span>
              <small>{custom ? "WORLD FORGE" : solar ? "NASA/JPL" : "SIMBAD ARCHIVE"}</small>
              {custom
                ? "Chosen properties"
                : solar
                  ? "Home-star parameters"
                  : "Observed properties"}
            </span>
            <FrameRateSignal fps={fps} />
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
            ) : solar ? (
              <>
                <div>
                  <dt>Earth distance</dt>
                  <dd>
                    1 <small>AU</small>
                  </dd>
                </div>
                <div>
                  <dt>V magnitude</dt>
                  <dd>
                    {formatNumber(observation.visualMagnitude, 2)} <small>MAG</small>
                  </dd>
                </div>
                <div>
                  <dt>Diameter</dt>
                  <dd>
                    {formatNumber(observation.diameterKilometers ?? null, 0)} <small>KM</small>
                  </dd>
                </div>
                <div>
                  <dt>Temperature</dt>
                  <dd>
                    {formatNumber(observation.effectiveTemperatureKelvin ?? null, 0)}{" "}
                    <small>K</small>
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
          <div className={cx("telemetry-detail")}>
            <span>CATALOG ID</span>
            <strong>{star.catalogName}</strong>
            <small>
              {star.objectType} · {star.kind.replaceAll("-", " ")}
            </small>
          </div>
          <div className={cx("telemetry-detail")}>
            <span>{custom ? "GENERATION SEED" : solar ? "ROTATION" : "SPACE MOTION"}</span>
            <strong>
              {custom
                ? star.customization?.seed
                : solar
                  ? `${formatNumber((star.solarSystem?.rotationPeriodHours ?? 0) / 24, 2)} D SIDEREAL`
                  : `${formatNumber(observation.radialVelocityKmPerSecond, 1)} KM/S RADIAL`}
            </strong>
            <small>
              {custom
                ? "REPRODUCIBLE PROCEDURAL PROFILE"
                : solar
                  ? `AXIAL TILT ${formatNumber(star.solarSystem?.axialTiltDegrees ?? null, 2)}° · DIFFERENTIAL ROTATION`
                  : `RA ${formatNumber(observation.properMotionRaMasPerYear, 1)} · DEC ${formatNumber(observation.properMotionDecMasPerYear, 1)} MAS/YR`}
            </small>
          </div>
          <p className={cx("source-note")}>
            {custom
              ? "EXORA CUSTOM GENERATOR · PROCEDURAL"
              : solar
                ? "NASA/JPL SOLAR SYSTEM DYNAMICS · PLANETARY PHYSICAL PARAMETERS"
                : "SIMBAD · BASIC + IDENT + ALLFLUXES"}{" "}
            · {star.source.retrievedOn}
          </p>
        </aside>

        {!custom ? (
          <div className={cx("mobile-scene-actions mobile-scene-actions-two")}>
            {systemPlanets.length > 0 ? (
              <button
                className={cx("mobile-scene-action")}
                type="button"
                disabled={dioramaState === "loading"}
                onClick={() => void openSystem()}
              >
                <span aria-hidden="true">◎</span>
                <span>
                  <strong>Whole system</strong>
                  <small>{dioramaState === "loading" ? "PLACING ORBITS…" : "VIEW ORBITS"}</small>
                </span>
              </button>
            ) : null}
            <button
              className={cx("mobile-scene-action")}
              type="button"
              onClick={() => setWorldsOpen(true)}
            >
              <span aria-hidden="true">◌</span>
              <span>
                <strong>Known worlds</strong>
                <small>
                  {systemState === "loading"
                    ? "QUERYING ARCHIVE…"
                    : `${systemPlanets.length} CONFIRMED`}
                </small>
              </span>
            </button>
          </div>
        ) : null}
      </main>

      <MobileSheet
        eyebrow="CONNECTED SYSTEM"
        title="Known worlds"
        open={worldsOpen}
        onClose={() => setWorldsOpen(false)}
      >
        {systemState === "loading" ? <small role="status">QUERYING NASA ARCHIVE…</small> : null}
        {systemState === "error" ? <small role="status">SYSTEM LINK UNAVAILABLE</small> : null}
        {systemState === "ready" && systemPlanets.length === 0 ? (
          <small>NO CONFIRMED WORLDS LINKED</small>
        ) : null}
        {systemPlanets.length > 0 ? (
          <div className={cx("known-world-list")}>
            {systemPlanets.map((planet) => (
              <button
                key={planet.id}
                type="button"
                onClick={() => {
                  setWorldsOpen(false);
                  onSelectPlanet(planet, systemCached);
                }}
              >
                <span className={cx(`known-world-orb ${planet.kind}`)} aria-hidden="true" />
                <span>
                  <strong>{planet.name}</strong>
                  <small>{planet.kind.replace("-", " ")} · VISIT ↗</small>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </MobileSheet>

      <MissionControl
        chromeHidden={chromeHidden}
        hints={[
          { key: "DRAG", meaning: "ORBIT" },
          { key: "SCROLL", meaning: "ZOOM" },
        ]}
        onToggleChrome={onToggleChrome}
        onOpenDiscover={onOpenDiscover}
        sceneFailed={sceneState === "error"}
        xr={{ host, status: xrStatus }}
      />

      <div className={cx("loading-screen")} role="status">
        <div className={cx("loading-orbit")} aria-hidden="true">
          <span />
        </div>
        <p>RESOLVING STAR</p>
        <small>{star.name.toUpperCase()} · SPECTRAL MODEL</small>
      </div>
    </div>
  );
};
