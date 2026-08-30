import type { StarProfile } from "@exora/contracts";
import { useEffect, useState } from "react";
import type { DestinationPanelModel } from "../destination-panel.ts";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import type { SolarRegionProfile } from "../solar-regions.ts";
import { findSolarStar } from "../solar-system.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { useTypographySettled } from "../use-typography-settled.ts";
import { DestinationIdentity } from "./DestinationIdentity.tsx";
import { DestinationPanel } from "./DestinationPanel.tsx";
import { MissionControl } from "./MissionControl.tsx";
import sharedStyles from "./ExperienceShared.module.css";
import hudStyles from "./DestinationHud.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles, hudStyles);

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
  `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}`;

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
  const typographySettled = useTypographySettled();

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

  const panel: DestinationPanelModel = {
    footer: `ANCHOR NAIF / SPK ${region.anchorNaifId} · RETRIEVED 2026-08-23`,
    label: "Region data",
    links: [
      {
        action: "VISIT PARENT ↗",
        glyph: "☀",
        id: "parent",
        onSelect: openParent,
        title: region.parent,
      },
    ],
    metrics: [
      { label: "Inner extent", unit: "AU", value: distanceLabel(region.distanceAu.inner) },
      { label: "Outer extent", unit: "AU", value: distanceLabel(region.distanceAu.outer) },
      { label: "Evidence", value: evidenceLabel.split(" ")[0] ?? evidenceLabel },
      { label: "Particles", value: "SAMPLED" },
    ],
    source: "NASA / JPL · REGIONAL MODEL",
    tabs: [
      {
        blocks: [
          {
            facts: [
              {
                detail: region.disclosure,
                label: "Visualization status",
                tone: "cyan",
                value: evidenceLabel,
              },
              {
                detail: region.distanceAu.note,
                label: "Scale limits",
                value: region.scaleNote,
              },
              {
                detail: `NAIF ${String(region.anchorNaifId)}`,
                label: "Permanent anchor",
                value: `SPK ${region.anchorSpkId}`,
              },
            ],
            type: "facts",
          },
        ],
        id: "evidence",
        label: "Evidence",
      },
      {
        blocks: [
          {
            bodies: region.sources.map((source) => ({
              id: source.datasetId,
              kind: "marker",
              meta: `${source.source} · ${source.retrievedOn}`,
              name: source.datasetId,
            })),
            label: "AUTHORITATIVE DATASETS",
            type: "bodies",
          },
        ],
        count: region.sources.length,
        id: "sources",
        label: "Sources",
      },
    ],
    title: "Scale and evidence",
  };

  return (
    <div
      className={cx(
        `experience-shell ${sceneState === "error" ? "scene-error" : ""} ${travelling ? "travelling" : ""} ${chromeHidden ? "chrome-hidden" : ""}`,
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
          category="SOLAR SYSTEM REGION"
          classification={evidenceLabel}
          name={region.name}
          nameId="world-name"
          note={region.disclosure.toUpperCase()}
          summary={region.summary}
          tags={[evidenceLabel, "STATISTICAL VISUALIZATION", "NON-LINEAR SCALE WHERE LABELLED"]}
          tagsLabel="Region evidence classification"
          tone="region"
        />

        <DestinationPanel fps={fps} model={panel} />
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
      {sceneState !== "error" && (sceneState === "loading" || !typographySettled) ? (
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
