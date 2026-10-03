import type { ExoplanetProfile } from "@exora/contracts";
import { WORLDGEN_VERSION } from "@exora/worldgen";
import { useEffect, useRef, useState } from "react";
import type { StarLoadResult } from "../api-client.ts";
import { reachStarSystem, reachSystem } from "../destination-cache.ts";
import {
  present,
  presentTabs,
  type DestinationPanelModel,
  type PanelBlock,
  type PanelMetric,
} from "../destination-panel.ts";
import { formatNumber } from "../planet-utils.tsx";
import { capitalize } from "../readable.ts";
import type { SceneHost } from "../scene-host.ts";
import { starLight } from "../star-light.ts";
import { readStarHabitableZone } from "../star-habitable-zone.ts";
import { hrSubject } from "../hr-diagram.ts";
import { skyFacts } from "../sky-position.ts";
import { deriveStarPhysics } from "../star-physics.ts";
import { deriveStarVisual, starKindLabel, starSummary } from "../star-utils.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { HrDiagram } from "./HrDiagram.tsx";
import { DestinationShell, type SceneState } from "./shell/DestinationShell.tsx";

interface StarExperienceProps {
  host: SceneHost | null;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectSystem: (hostStar: string) => Promise<boolean>;
  result: StarLoadResult;
  systemHostName: string | null;
  travelPhase: TravelPhase;
}

export const StarExperience = ({
  host,
  onSelectPlanet,
  onSelectSystem,
  result,
  systemHostName,
  travelPhase,
}: StarExperienceProps) => {
  const [sceneState, setSceneState] = useState<SceneState>("loading");
  const [systemPlanets, setSystemPlanets] = useState<ExoplanetProfile[]>([]);
  const [systemCached, setSystemCached] = useState(false);
  const [systemState, setSystemState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [dioramaState, setDioramaState] = useState<"error" | "idle" | "loading">("idle");
  const star = result.star;
  const observation = star.observation;
  const visual = deriveStarVisual(star);
  const custom = result.mode === "custom";
  const habitableZone = custom ? null : readStarHabitableZone(star, systemPlanets);
  const physics = deriveStarPhysics(star, new Date().getFullYear());
  const hrPoint = hrSubject(star);
  const solar = result.mode === "solar";

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

  const customMetrics: readonly PanelMetric[] = [
    {
      label: "Temperature",
      unit: "K",
      value: formatNumber(star.customization?.temperatureKelvin ?? null, 0),
    },
    { label: "Scale", unit: "%", value: formatNumber((star.customization?.radius ?? 0) * 100, 0) },
    {
      label: "Activity",
      unit: "%",
      value: formatNumber((star.customization?.activity ?? 0) * 100, 0),
    },
    {
      label: "Rotation",
      unit: "%",
      value: formatNumber((star.customization?.rotation ?? 0) * 100, 0),
    },
  ];

  const solarMetrics: readonly PanelMetric[] = [
    { label: "Earth distance", unit: "AU", value: "1" },
    { label: "V magnitude", unit: "MAG", value: formatNumber(observation.visualMagnitude, 2) },
    {
      label: "Diameter",
      unit: "KM",
      value: formatNumber(observation.diameterKilometers ?? null, 0),
    },
    {
      label: "Temperature",
      unit: "K",
      value: formatNumber(observation.effectiveTemperatureKelvin ?? null, 0),
    },
  ];

  const observedMetrics: readonly PanelMetric[] = [
    { label: "Distance", unit: "PC", value: formatNumber(observation.distanceParsecs, 2) },
    { label: "V magnitude", unit: "MAG", value: formatNumber(observation.visualMagnitude, 2) },
    { label: "RA", unit: "°", value: formatNumber(observation.rightAscensionDegrees, 2) },
    { label: "DEC", unit: "°", value: formatNumber(observation.declinationDegrees, 2) },
  ];

  const worldBlocks: readonly PanelBlock[] = present<PanelBlock>([
    systemState === "loading" && {
      text: "Asking the NASA Exoplanet Archive for this star's worlds…",
      type: "status" as const,
    },
    systemState === "error" && {
      text: "The archive could not be reached, so this star's worlds are unknown for now.",
      tone: "accent" as const,
      type: "status" as const,
    },
    systemState === "ready" &&
      systemPlanets.length === 0 && {
        text: "The archive lists no confirmed worlds around this star.",
        type: "status" as const,
      },
    systemPlanets.length > 0 && {
      bodies: systemPlanets.map((planet) => ({
        id: planet.id,
        kind: planet.kind,
        meta: capitalize(planet.kind.replace("-", " ")),
        name: planet.name,
        onSelect: () => onSelectPlanet(planet, systemCached),
      })),
      label: "Confirmed worlds",
      type: "bodies" as const,
    },
  ]);

  const panel: DestinationPanelModel = {
    footer: `${
      custom
        ? "EXORA CUSTOM GENERATOR · PROCEDURAL"
        : solar
          ? "NASA/JPL SOLAR SYSTEM DYNAMICS · PLANETARY PHYSICAL PARAMETERS"
          : "SIMBAD · BASIC + IDENT + ALLFLUXES"
    } · ${star.source.retrievedOn}`,
    label: custom ? "Custom star data" : "Observed star data",
    links: present([
      systemPlanets.length > 0 && {
        busy: dioramaState === "loading",
        disabled: dioramaState === "loading",
        ...(dioramaState === "error"
          ? { error: "The archive has no orbits it can place for this system." }
          : {}),
        icon: "orbit" as const,
        id: "whole-system",
        label: "Whole system",
        onSelect: () => void openSystem(),
      },
    ]),
    metrics: custom ? customMetrics : solar ? solarMetrics : observedMetrics,
    source: custom ? "World Forge" : solar ? "NASA/JPL" : "SIMBAD",
    tabs: presentTabs([
      !custom && {
        blocks: worldBlocks,
        count: systemPlanets.length,
        id: "worlds",
        label: "Worlds",
      },
      !custom &&
        !solar && {
          blocks: [{ facts: skyFacts(observation), type: "facts" as const }],
          id: "sky",
          label: "Sky",
        },
      {
        blocks: [
          {
            facts: present([
              {
                detail: `${star.objectType} · ${star.kind.replaceAll("-", " ")}`,
                label: "Catalog ID",
                value: star.catalogName,
              },
              {
                detail: custom
                  ? "Reproducible procedural profile"
                  : solar
                    ? `Axial tilt ${formatNumber(star.solarSystem?.axialTiltDegrees ?? null, 2)}° · differential rotation`
                    : `RA ${formatNumber(observation.properMotionRaMasPerYear, 1)} · DEC ${formatNumber(observation.properMotionDecMasPerYear, 1)} mas/yr`,
                label: custom ? "Generation seed" : solar ? "Rotation" : "Space motion",
                value: custom
                  ? (star.customization?.seed ?? "—")
                  : solar
                    ? `${formatNumber((star.solarSystem?.rotationPeriodHours ?? 0) / 24, 2)} d sidereal`
                    : `${formatNumber(observation.radialVelocityKmPerSecond, 1)} km/s radial`,
              },
              habitableZone && {
                detail: habitableZone.detail,
                label: "Habitable zone",
                value: habitableZone.value,
              },
              custom && {
                detail:
                  "The generated URL carries this recipe, so the same star reignites from the link.",
                label: "Shareable recipe",
                value: `Worldgen v${WORLDGEN_VERSION}`,
              },
            ]),
            type: "facts",
          },
        ],
        id: "record",
        label: "Record",
      },
      (physics.length > 0 || hrPoint !== null) && {
        blocks: [
          {
            content: hrPoint ? <HrDiagram name={star.name} subject={hrPoint} /> : null,
            type: "custom",
          },
          { facts: physics, type: "facts" },
        ],
        id: "physics",
        label: "Physics",
      },
    ]),
    title: custom ? "Chosen properties" : solar ? "Home-star parameters" : "Observed properties",
  };

  return (
    <DestinationShell
      className="star-experience"
      hints={[
        { key: "Drag", meaning: "Orbit" },
        { key: "Scroll", meaning: "Zoom" },
        { key: "H", meaning: "Hide interface" },
      ]}
      host={host}
      identity={{
        category: custom ? "Generated star" : solar ? "Our star" : "Observed star",
        classification: starKindLabel(star),
        name: star.name,
        nameId: "star-name",
        note: custom
          ? `Rebuilt from the recipe in its link · worldgen v${WORLDGEN_VERSION}.`
          : solar
            ? "NASA/JPL measurements, with a stellar surface modelled by Exora."
            : observation.effectiveTemperatureKelvin == null
              ? "Its appearance is inferred from the spectral class SIMBAD records."
              : "SIMBAD measurements, with a stellar surface modelled by Exora.",
        summary: starSummary(star),
        tags: [
          visual.label,
          observation.spectralType ?? "Spectrum unknown",
          `${custom ? "" : "~"}${formatNumber(visual.temperatureKelvin, 0)} K`,
        ],
        tagsLabel: "Star classification",
        tone: "star",
      }}
      light={starLight(visual.temperatureKelvin)}
      loading={{ detail: `${star.name} · spectral model`, title: "Resolving star" }}
      panel={panel}
      sceneState={sceneState}
      travelPhase={travelPhase}
    />
  );
};
