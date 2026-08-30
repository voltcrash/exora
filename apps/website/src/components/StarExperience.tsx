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
import type { SceneHost, XrStatus } from "../scene-host.ts";
import { deriveStarVisual, starKindLabel, starSummary } from "../star-utils.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { useTypographySettled } from "../use-typography-settled.ts";
import { DestinationIdentity } from "./DestinationIdentity.tsx";
import { DestinationPanel } from "./DestinationPanel.tsx";
import { MissionControl } from "./MissionControl.tsx";
import sharedStyles from "./ExperienceShared.module.css";
import hudStyles from "./DestinationHud.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles, hudStyles);

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
  const star = result.star;
  const observation = star.observation;
  const visual = deriveStarVisual(star);
  const custom = result.mode === "custom";
  const solar = result.mode === "solar";
  const travelling = travelPhase === "departing" || travelPhase === "crossing";
  const typographySettled = useTypographySettled();
  const settled =
    (sceneState === "ready" && typographySettled) ||
    sceneState === "error" ||
    travelPhase !== "idle";

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
    systemState === "loading" && { text: "QUERYING NASA ARCHIVE…", type: "status" as const },
    systemState === "error" && {
      text: "SYSTEM LINK UNAVAILABLE",
      tone: "accent" as const,
      type: "status" as const,
    },
    systemState === "ready" &&
      systemPlanets.length === 0 && {
        text: "NO CONFIRMED WORLDS LINKED",
        type: "status" as const,
      },
    systemPlanets.length > 0 && {
      bodies: systemPlanets.map((planet) => ({
        id: planet.id,
        kind: planet.kind,
        meta: planet.kind.replace("-", " "),
        name: planet.name,
        onSelect: () => onSelectPlanet(planet, systemCached),
      })),
      label: "CONFIRMED WORLDS",
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
        action: dioramaState === "loading" ? "PLACING ORBITS…" : "STAND AMONG THE ORBITS ↗",
        disabled: dioramaState === "loading",
        ...(dioramaState === "error"
          ? { error: "The archive links no placeable orbits to this host." }
          : {}),
        glyph: "◎",
        id: "whole-system",
        onSelect: () => void openSystem(),
        title: "Whole system",
      },
    ]),
    metrics: custom ? customMetrics : solar ? solarMetrics : observedMetrics,
    source: custom ? "WORLD FORGE" : solar ? "NASA/JPL" : "SIMBAD ARCHIVE",
    tabs: presentTabs([
      !custom && {
        blocks: worldBlocks,
        count: systemPlanets.length,
        id: "worlds",
        label: "Worlds",
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
    ]),
    title: custom ? "Chosen properties" : solar ? "Home-star parameters" : "Observed properties",
  };

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
        <DestinationIdentity
          category={custom ? "GENERATED STAR" : solar ? "OUR STAR" : "OBSERVED STAR"}
          classification={starKindLabel(star)}
          name={star.name}
          nameId="star-name"
          note={
            custom
              ? `SHAREABLE URL RECIPE · WORLDGEN V${WORLDGEN_VERSION}`
              : solar
                ? "NASA/JPL MEASUREMENTS · EXORA STELLAR SURFACE"
                : observation.effectiveTemperatureKelvin == null
                  ? "STELLAR APPEARANCE INFERRED FROM SIMBAD SPECTRAL CLASS"
                  : "SIMBAD STELLAR MEASUREMENTS · EXORA STELLAR SURFACE"
          }
          summary={starSummary(star)}
          tags={[
            visual.label,
            observation.spectralType ?? "SPECTRUM UNKNOWN",
            `${custom ? "" : "~"}${formatNumber(visual.temperatureKelvin, 0)} K`,
          ]}
          tagsLabel="Star classification"
          tone="star"
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
        <div className={cx("loading-orbit")} aria-hidden="true">
          <span />
        </div>
        <p>RESOLVING STAR</p>
        <small>{star.name.toUpperCase()} · SPECTRAL MODEL</small>
      </div>
    </div>
  );
};
