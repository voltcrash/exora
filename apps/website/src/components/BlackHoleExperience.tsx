import { useEffect, useState } from "react";
import {
  blackHoleKindLabel,
  schwarzschildDiameterKilometers,
  type BlackHoleProfile,
} from "../black-holes.ts";
import { deriveBlackHolePhysics } from "../black-hole-physics.ts";
import { presentTabs, type DestinationPanelModel, type PanelMetric } from "../destination-panel.ts";
import { capitalize } from "../readable.ts";
import type { SceneHost } from "../scene-host.ts";
import { diskLight } from "../star-light.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { DestinationShell, type SceneState } from "./shell/DestinationShell.tsx";

interface BlackHoleExperienceProps {
  blackHole: BlackHoleProfile;
  host: SceneHost | null;
  travelPhase: TravelPhase;
}

/*
 * A horizon is measured in quantities no tile is wide enough to spell out, so the magnitude is
 * carried by the unit — "38.4" beside "billion km" — the same way a world's mass is carried by M⊕.
 */
const scaled = (value: number, unit: string): PanelMetric => {
  if (value >= 1_000_000_000) {
    return { label: "", unit: `billion ${unit}`, value: (value / 1_000_000_000).toFixed(1) };
  }
  if (value >= 1_000_000) {
    return { label: "", unit: `million ${unit}`, value: (value / 1_000_000).toFixed(1) };
  }
  return { label: "", unit, value: value.toLocaleString("en-US", { maximumFractionDigits: 1 }) };
};

const distanceMetric = (blackHole: BlackHoleProfile): PanelMetric => {
  if (blackHole.distanceLightYears !== null) {
    return { ...scaled(blackHole.distanceLightYears, "ly"), label: "Distance" };
  }
  return blackHole.observation.redshift === null
    ? { label: "Distance", unit: "ly", value: "—" }
    : { label: "Distance", unit: "redshift z", value: String(blackHole.observation.redshift) };
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

export const BlackHoleExperience = ({ blackHole, host, travelPhase }: BlackHoleExperienceProps) => {
  const [sceneState, setSceneState] = useState<SceneState>("loading");
  const diameterKilometers = schwarzschildDiameterKilometers(blackHole);
  const massMetric: PanelMetric =
    blackHole.massSolar === null
      ? { label: "Mass estimate", value: "Unavailable" }
      : { ...scaled(blackHole.massSolar, "M☉"), label: "Mass estimate" };
  const diameterMetric: PanelMetric =
    diameterKilometers === null
      ? { label: "Schwarzschild Ø", value: "Unavailable" }
      : { ...scaled(diameterKilometers, "km"), label: "Schwarzschild Ø" };
  const physics = deriveBlackHolePhysics(blackHole);

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
      { label: "Accretion", value: capitalize(blackHole.observation.accretion) },
    ],
    source: blackHole.source.archive,
    tabs: presentTabs([
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
      physics.length > 0 && {
        blocks: [{ facts: physics, type: "facts" }],
        id: "physics",
        label: "Physics",
      },
    ]),
    title:
      blackHole.provenance === "observed" ? "Measured horizon record" : "Generated horizon record",
  };

  return (
    <DestinationShell
      className="black-hole-experience"
      hints={[
        { key: "Drag", meaning: "Orbit" },
        { key: "Scroll", meaning: "Zoom" },
        { key: "H", meaning: "Hide interface" },
      ]}
      host={host}
      identity={{
        category: `${capitalize(blackHole.provenance)} black hole`,
        classification: blackHoleKindLabel(blackHole),
        name: <BlackHoleName name={blackHole.name} />,
        nameId: "black-hole-name",
        note: "An interpretive model of gravitational lensing, not telescope imagery.",
        summary: blackHole.observation.summary,
        tags: [
          blackHole.milestone,
          blackHole.host,
          ...(blackHole.constellation ? [blackHole.constellation] : []),
        ],
        tagsLabel: "Black hole classification",
        tone: "black-hole",
      }}
      light={diskLight(blackHole.visual.diskHueDegrees)}
      loading={{ detail: `${blackHole.name} · horizon reference`, title: "Modelling spacetime" }}
      panel={panel}
      sceneState={sceneState}
      travelPhase={travelPhase}
    />
  );
};
