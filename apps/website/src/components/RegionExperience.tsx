import type { StarProfile } from "@exora/contracts";
import { useEffect, useState } from "react";
import type { DestinationPanelModel } from "../destination-panel.ts";
import { capitalize } from "../readable.ts";
import type { SceneHost } from "../scene-host.ts";
import type { SolarRegionProfile } from "../solar-regions.ts";
import { findSolarStar } from "../solar-system.ts";
import { starLight } from "../star-light.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { DestinationShell, type SceneState } from "./shell/DestinationShell.tsx";

interface RegionExperienceProps {
  host: SceneHost | null;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
  region: SolarRegionProfile;
  travelPhase: TravelPhase;
}

const distanceLabel = (value: number): string =>
  `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}`;

export const RegionExperience = ({
  host,
  onSelectStar,
  region,
  travelPhase,
}: RegionExperienceProps) => {
  const [sceneState, setSceneState] = useState<SceneState>("loading");

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

  const evidenceLabel = capitalize(region.evidence.replaceAll("-", " "));

  const panel: DestinationPanelModel = {
    footer: `Anchored to NAIF / SPK ${region.anchorNaifId} · retrieved 2026-08-23`,
    label: "Region data",
    links: [
      {
        icon: "star",
        id: "parent",
        label: `Visit the ${region.parent}`,
        onSelect: openParent,
      },
    ],
    metrics: [
      { label: "Inner extent", unit: "AU", value: distanceLabel(region.distanceAu.inner) },
      { label: "Outer extent", unit: "AU", value: distanceLabel(region.distanceAu.outer) },
      { label: "Evidence", value: evidenceLabel.split(" ")[0] ?? evidenceLabel },
      { label: "Particles", value: "Sampled" },
    ],
    source: "NASA/JPL regional model",
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
            label: "Authoritative datasets",
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
    <DestinationShell
      hints={[
        { key: "Drag", meaning: "Orbit" },
        { key: "Scroll", meaning: "Scale" },
        { key: "H", meaning: "Hide interface" },
      ]}
      host={host}
      identity={{
        category: "Solar System region",
        classification: evidenceLabel,
        name: region.name,
        nameId: "world-name",
        note: region.disclosure,
        summary: region.summary,
        tags: [evidenceLabel, "Statistical visualization", "Non-linear scale where labelled"],
        tagsLabel: "Region evidence classification",
        tone: "region",
      }}
      light={starLight(null)}
      loading={{ detail: `${region.name} · ${evidenceLabel}`, title: "Building a scale model" }}
      panel={panel}
      sceneState={sceneState}
      travelPhase={travelPhase}
    />
  );
};
