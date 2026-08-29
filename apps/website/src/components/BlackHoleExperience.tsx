import { useEffect, useState } from "react";
import {
  blackHoleKindLabel,
  formatBlackHoleMass,
  schwarzschildDiameterKilometers,
  type BlackHoleProfile,
} from "../black-holes.ts";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { FrameRateSignal } from "./FrameRateSignal.tsx";
import { MissionControl } from "./MissionControl.tsx";
import sharedStyles from "./ExperienceShared.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles);

interface BlackHoleExperienceProps {
  blackHole: BlackHoleProfile;
  chromeHidden: boolean;
  host: SceneHost | null;
  onToggleChrome: () => void;
  onOpenDiscover: () => void;
  travelPhase: TravelPhase;
}

const formatDistance = (blackHole: BlackHoleProfile): string => {
  if (blackHole.distanceLightYears === null) {
    return blackHole.observation.redshift === null
      ? "NOT REPORTED"
      : `REDSHIFT z ${blackHole.observation.redshift}`;
  }
  if (blackHole.distanceLightYears >= 1_000_000_000) {
    return `${(blackHole.distanceLightYears / 1_000_000_000).toFixed(1)} BILLION LY`;
  }
  if (blackHole.distanceLightYears >= 1_000_000) {
    return `${(blackHole.distanceLightYears / 1_000_000).toFixed(1)} MILLION LY`;
  }
  return `${blackHole.distanceLightYears.toLocaleString("en-US")} LY`;
};

const formatDiameter = (kilometers: number): string => {
  if (kilometers >= 1_000_000_000) return `${(kilometers / 1_000_000_000).toFixed(1)} BILLION KM`;
  if (kilometers >= 1_000_000) return `${(kilometers / 1_000_000).toFixed(1)} MILLION KM`;
  return `${kilometers.toLocaleString("en-US", { maximumFractionDigits: 0 })} KM`;
};

const BlackHoleName = ({ name }: { name: string }) => {
  const separator = name.lastIndexOf(" ");

  return separator === -1 ? (
    <em>{name}</em>
  ) : (
    <>
      {name.slice(0, separator)} <em>{name.slice(separator + 1)}</em>
    </>
  );
};

export const BlackHoleExperience = ({
  blackHole,
  chromeHidden,
  host,
  onToggleChrome,
  onOpenDiscover,
  travelPhase,
}: BlackHoleExperienceProps) => {
  const [fps, setFps] = useState("--");
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "error">("loading");
  const [xrStatus, setXrStatus] = useState<XrStatus>("checking");
  const travelling = travelPhase === "departing" || travelPhase === "crossing";
  const settled = sceneState !== "loading" || travelPhase !== "idle";
  const diameterKilometers = schwarzschildDiameterKilometers(blackHole);

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
    void import("../black-hole-scene.ts")
      .then(({ createBlackHoleWorld }) =>
        host.mountWorld(() =>
          createBlackHoleWorld(host, {
            blackHole,
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
  }, [blackHole, host]);

  return (
    <div
      className={cx(
        `experience-shell black-hole-experience ${settled ? "scene-ready" : ""} ${sceneState === "error" ? "scene-error" : ""} ${travelling ? "travelling" : ""} ${chromeHidden ? "chrome-hidden" : ""}`,
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
          aria-labelledby="black-hole-name"
        >
          <p className={cx("eyebrow")}>
            <span>OBSERVED BLACK HOLE</span>
            <span>{blackHoleKindLabel(blackHole)}</span>
          </p>
          <h1 id="black-hole-name">
            <BlackHoleName name={blackHole.name} />
          </h1>
          <div className={cx("world-tags")}>
            <span>{blackHole.milestone}</span>
            <span>{blackHole.host}</span>
            <span>{blackHole.constellation}</span>
          </div>
          <p className={cx("world-summary")}>{blackHole.observation.summary}</p>
          <p className={cx("visual-note black-hole-visual-note")}>
            <span aria-hidden="true" /> INTERPRETIVE GRAVITATIONAL-LENSING MODEL · NOT TELESCOPE
            IMAGERY
          </p>
        </section>

        <aside
          className={cx("telemetry black-hole-telemetry")}
          data-testid="telemetry"
          aria-label="Observed black hole data"
        >
          <div className={cx("telemetry-heading")}>
            <span>
              <small>{blackHole.source.archive}</small>
              Measured horizon record
            </span>
            <FrameRateSignal fps={fps} />
          </div>
          <dl>
            <div>
              <dt>Mass estimate</dt>
              <dd>{formatBlackHoleMass(blackHole.massSolar)}</dd>
            </div>
            <div>
              <dt>Distance</dt>
              <dd>{formatDistance(blackHole)}</dd>
            </div>
            <div>
              <dt>Schwarzschild Ø</dt>
              <dd>{formatDiameter(diameterKilometers)}</dd>
            </div>
            <div>
              <dt>Accretion state</dt>
              <dd>{blackHole.observation.accretion.toUpperCase()}</dd>
            </div>
          </dl>
          <div className={cx("telemetry-detail")}>
            <span>CATALOG IDENTITY</span>
            <strong>{blackHole.catalogDesignation}</strong>
            <small>
              {blackHole.observation.companion
                ? `COMPANION · ${blackHole.observation.companion}`
                : `${blackHole.kind.replaceAll("-", " ")} · ${blackHole.host}`}
            </small>
          </div>
          <div className={cx("telemetry-detail black-hole-science-detail")}>
            <span>MODEL DISCLOSURE</span>
            <strong>READABLE SCALE · OBSERVED MASS</strong>
            <small>
              The diameter is a non-spinning reference calculated from the linked mass estimate.
              Disk brightness, tilt and motion are illustrative.
            </small>
          </div>
          <p className={cx("source-note")}>
            <a href={blackHole.source.url} target="_blank" rel="noreferrer">
              {blackHole.source.title} ↗
            </a>{" "}
            · {blackHole.source.retrievedOn}
          </p>
        </aside>
      </main>

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
        <div className={cx("loading-orbit black-hole-loading")} aria-hidden="true">
          <span />
        </div>
        <p>MODELING SPACETIME</p>
        <small>{blackHole.name.toUpperCase()} · HORIZON REFERENCE</small>
      </div>
    </div>
  );
};
