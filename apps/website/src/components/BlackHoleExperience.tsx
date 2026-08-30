import { useEffect, useState } from "react";
import {
  blackHoleKindLabel,
  schwarzschildDiameterKilometers,
  type BlackHoleProfile,
} from "../black-holes.ts";
import type { DestinationPanelModel, PanelMetric } from "../destination-panel.ts";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { useTypographySettled } from "../use-typography-settled.ts";
import { DestinationIdentity } from "./DestinationIdentity.tsx";
import { DestinationPanel } from "./DestinationPanel.tsx";
import { MissionControl } from "./MissionControl.tsx";
import sharedStyles from "./ExperienceShared.module.css";
import hudStyles from "./DestinationHud.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles, hudStyles);

interface BlackHoleExperienceProps {
  blackHole: BlackHoleProfile;
  chromeHidden: boolean;
  host: SceneHost | null;
  onToggleChrome: () => void;
  onOpenDiscover: () => void;
  travelPhase: TravelPhase;
}

/*
 * A horizon is measured in quantities no tile is wide enough to spell out, so the magnitude is
 * carried by the unit — "38.4" under "BILLION KM" — the same way a world's mass is carried by M⊕.
 */
const scaled = (value: number, unit: string): PanelMetric => {
  if (value >= 1_000_000_000) {
    return { label: "", unit: `BILLION ${unit}`, value: (value / 1_000_000_000).toFixed(1) };
  }
  if (value >= 1_000_000) {
    return { label: "", unit: `MILLION ${unit}`, value: (value / 1_000_000).toFixed(1) };
  }
  return { label: "", unit, value: value.toLocaleString("en-US", { maximumFractionDigits: 1 }) };
};

const distanceMetric = (blackHole: BlackHoleProfile): PanelMetric => {
  if (blackHole.distanceLightYears !== null) {
    return { ...scaled(blackHole.distanceLightYears, "LY"), label: "Distance" };
  }
  return blackHole.observation.redshift === null
    ? { label: "Distance", unit: "LY", value: "—" }
    : { label: "Distance", unit: "z REDSHIFT", value: String(blackHole.observation.redshift) };
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
  const typographySettled = useTypographySettled();
  const settled =
    (sceneState === "ready" && typographySettled) ||
    sceneState === "error" ||
    travelPhase !== "idle";
  const diameterKilometers = schwarzschildDiameterKilometers(blackHole);
  const massMetric: PanelMetric =
    blackHole.massSolar === null
      ? { label: "Mass estimate", value: "Unavailable" }
      : { ...scaled(blackHole.massSolar, "M☉"), label: "Mass estimate" };
  const diameterMetric: PanelMetric =
    diameterKilometers === null
      ? { label: "Schwarzschild Ø", value: "Unavailable" }
      : { ...scaled(diameterKilometers, "KM"), label: "Schwarzschild Ø" };

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

  const panel: DestinationPanelModel = {
    footer: blackHole.source.url ? (
      <>
        <a href={blackHole.source.url} target="_blank" rel="noreferrer">
          {blackHole.source.title} ↗
        </a>{" "}
        · {blackHole.source.retrievedOn}
      </>
    ) : (
      <>
        {blackHole.source.title} · {blackHole.source.retrievedOn}
      </>
    ),
    label:
      blackHole.provenance === "observed" ? "Observed black hole data" : "Procedural visualization",
    links: [],
    metrics: [
      massMetric,
      distanceMetric(blackHole),
      diameterMetric,
      { label: "Accretion", value: blackHole.observation.accretion.toUpperCase() },
    ],
    source: blackHole.source.archive,
    tabs: [
      {
        blocks: [
          {
            facts: [
              {
                detail: blackHole.observation.companion
                  ? `Companion · ${blackHole.observation.companion}`
                  : `${blackHole.kind.replaceAll("-", " ")} · ${blackHole.host}`,
                label: "Catalog identity",
                value: blackHole.catalogDesignation,
              },
              {
                detail:
                  blackHole.massSolar === null
                    ? "No catalog mass is available, so the scene uses a non-numeric visual reference. Disk brightness, tilt and motion are illustrative."
                    : blackHole.provenance === "procedural"
                      ? "The diameter is calculated from a generated mass parameter. It is not a telescope measurement. Disk brightness, tilt and motion are illustrative."
                      : "The diameter is a non-spinning reference calculated from the linked mass estimate. Disk brightness, tilt and motion are illustrative.",
                label: "Model disclosure",
                tone: "accent",
                value:
                  blackHole.massSolar === null
                    ? "Visual reference · mass unavailable"
                    : blackHole.provenance === "procedural"
                      ? "Readable scale · generated parameter"
                      : "Readable scale · observed mass",
              },
            ],
            type: "facts",
          },
        ],
        id: "record",
        label: "Record",
      },
    ],
    title:
      blackHole.provenance === "observed" ? "Measured horizon record" : "Generated horizon record",
  };

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
        <DestinationIdentity
          category={`${blackHole.provenance.toUpperCase()} BLACK HOLE`}
          classification={blackHoleKindLabel(blackHole)}
          name={<BlackHoleName name={blackHole.name} />}
          nameId="black-hole-name"
          note="INTERPRETIVE GRAVITATIONAL-LENSING MODEL · NOT TELESCOPE IMAGERY"
          summary={blackHole.observation.summary}
          tags={[
            blackHole.milestone,
            blackHole.host,
            ...(blackHole.constellation ? [blackHole.constellation] : []),
          ]}
          tagsLabel="Black hole classification"
          tone="black-hole"
        />

        <DestinationPanel fps={fps} model={panel} />
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
