import type { StarProfile } from "@exora/contracts";
import { useEffect, useState } from "react";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import type { SolarRegionProfile } from "../solar-regions.ts";
import { findSolarStar } from "../solar-system.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { FrameRateSignal } from "./FrameRateSignal.tsx";
import { MissionControl } from "./MissionControl.tsx";
import sharedStyles from "./ExperienceShared.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles);

interface RegionExperienceProps {
  chromeHidden: boolean;
  host: SceneHost | null;
  onToggleChrome: () => void;
  onOpenDiscover: () => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
  region: SolarRegionProfile;
  travelPhase: TravelPhase;
}

const distanceLabel = (value: number): string =>
  `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} AU`;

export const RegionExperience = ({
  chromeHidden,
  host,
  onToggleChrome,
  onOpenDiscover,
  onSelectStar,
  region,
  travelPhase,
}: RegionExperienceProps) => {
  const [fps, setFps] = useState("--");
  const [xrStatus, setXrStatus] = useState<XrStatus>("checking");
  const [sceneState, setSceneState] = useState<"error" | "loading" | "ready">("loading");
  const travelling = travelPhase === "departing" || travelPhase === "crossing";

  useEffect(() => host?.onXrStatus(setXrStatus), [host]);

  useEffect(() => {
    if (!host) return;
    const timer = window.setInterval(() => setFps(Math.round(host.getFps()).toString()), 1_000);
    return () => window.clearInterval(timer);
  }, [host]);

  useEffect(() => {
    if (!host) return;
    let abandoned = false;
    setSceneState("loading");
    void import("../solar-region-scene.ts")
      .then(({ createSolarRegionWorld }) =>
        host.mountWorld(() =>
          createSolarRegionWorld(host, {
            onFirstFrame: () => {
              if (!abandoned) setSceneState("ready");
            },
            region,
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
  }, [host, region]);

  const openParent = (): void => {
    const sun = findSolarStar(region.parent);
    if (sun) onSelectStar(sun, true);
  };

  const evidenceLabel = region.evidence.replaceAll("-", " ").toUpperCase();

  return (
    <div
      className={cx(
        `experience-shell region-experience scene-${sceneState} ${travelling ? "travelling" : ""} ${chromeHidden ? "chrome-hidden" : ""}`,
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
          aria-labelledby="world-name"
        >
          <p className={cx("eyebrow")}>
            <span>SOLAR SYSTEM REGION</span>
            <span>{evidenceLabel}</span>
          </p>
          <h1 id="world-name">{region.name}</h1>
          <div className={cx("world-tags")} aria-label="Region evidence classification">
            <span>{evidenceLabel}</span>
            <span>STATISTICAL VISUALIZATION</span>
            <span>NON-LINEAR SCALE WHERE LABELLED</span>
          </div>
          <p className={cx("world-summary")}>{region.summary}</p>
          <p className={cx("visual-note region-visual-note")}>
            <span aria-hidden="true" /> {region.disclosure.toUpperCase()}
          </p>
          <p className={cx("region-scale-note")}>{region.scaleNote}</p>
          <p className={cx("region-identifiers")} aria-label="Permanent anchor identifiers">
            <strong>ANCHOR SPK {region.anchorSpkId}</strong>
            <span>NAIF {region.anchorNaifId}</span>
          </p>
        </section>
        <aside
          className={cx("telemetry region-telemetry")}
          data-testid="telemetry"
          aria-label="Region data"
        >
          <div className={cx("telemetry-heading")}>
            <span>
              <small>NASA / JPL · REGIONAL MODEL</small>Scale and evidence
            </span>
            <FrameRateSignal fps={fps} />
          </div>
          <dl>
            <div>
              <dt>Inner extent</dt>
              <dd>{distanceLabel(region.distanceAu.inner)}</dd>
            </div>
            <div>
              <dt>Outer extent</dt>
              <dd>{distanceLabel(region.distanceAu.outer)}</dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd className={cx("region-evidence-value")}>{evidenceLabel}</dd>
            </div>
            <div>
              <dt>Particles</dt>
              <dd className={cx("region-evidence-value")}>SAMPLED</dd>
            </div>
          </dl>
          <div className={cx("telemetry-detail host-system-detail")}>
            <span>DIRECT PARENT</span>
            <button className={cx("system-jump")} type="button" onClick={openParent}>
              <span aria-hidden="true">☀</span>
              <strong>{region.parent}</strong>
              <small>VISIT PARENT ↗</small>
            </button>
          </div>
          <div className={cx("telemetry-detail scientific-disclosure")}>
            <span>VISUALIZATION STATUS</span>
            <strong>{evidenceLabel}</strong>
            <small>{region.disclosure}</small>
          </div>
          <div className={cx("telemetry-detail scientific-disclosure")}>
            <span>SCALE LIMITS</span>
            <strong>{region.scaleNote}</strong>
            <small>{region.distanceAu.note}</small>
          </div>
          <div className={cx("telemetry-detail region-sources")}>
            <span>AUTHORITATIVE DATASETS</span>
            {region.sources.map((source) => (
              <p key={source.datasetId}>
                <strong>{source.datasetId}</strong>
                <small>
                  {source.source} · {source.retrievedOn}
                </small>
              </p>
            ))}
          </div>
          <p className={cx("source-note")}>
            ANCHOR NAIF / SPK {region.anchorNaifId} · RETRIEVED 2026-08-23
          </p>
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
        <div className={cx("loading-screen")} role="status">
          <div className={cx("loading-orbit")} aria-hidden="true">
            <span />
          </div>
          <p>BUILDING REGIONAL SCALE MODEL</p>
          <small>
            {region.name.toUpperCase()} · {evidenceLabel}
          </small>
        </div>
      ) : null}
    </div>
  );
};
