import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { deriveWorldRecipe, WORLDGEN_VERSION, type WorldRecipe } from "@exora/worldgen";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PlanetLoadResult } from "../api-client.ts";
import {
  present,
  presentTabs,
  type DestinationPanelModel,
  type PanelBody,
  type PanelFact,
  type PanelMetric,
} from "../destination-panel.ts";
import { warmDestinations } from "../destination-cache.ts";
import type { ViewMode } from "../planet-scene.ts";
import { formatMeasurement, formatNumber, formatPlanetName } from "../planet-utils.tsx";
import type { PlanetarySubsystem } from "../planetary-subsystems.ts";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import { SURFACE_TRANSITION_MS, type TravelPhase } from "../travel-transition.ts";
import { useTypographySettled } from "../use-typography-settled.ts";
import { DestinationIdentity } from "./DestinationIdentity.tsx";
import { DestinationPanel } from "./DestinationPanel.tsx";
import { MissionControl } from "./MissionControl.tsx";
import sharedStyles from "./ExperienceShared.module.css";
import hudStyles from "./DestinationHud.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles, hudStyles);

interface PlanetExperienceProps {
  chromeHidden: boolean;
  host: SceneHost | null;
  onToggleChrome: () => void;
  onOpenDiscover: () => void;
  onSelectHostStar: (hostStar: string) => Promise<boolean>;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
  onSelectSystem: (hostStar: string) => Promise<boolean>;
  recipeOverride: WorldRecipe | null;
  result: PlanetLoadResult;
  travelPhase: TravelPhase;
}

const visualNote = ({
  custom,
  isMoon,
  solar,
  solarIdentity,
  subsystemActive,
}: {
  custom: boolean;
  isMoon: boolean;
  solar: boolean;
  solarIdentity: ExoplanetProfile["solarSystem"];
  subsystemActive: boolean;
}): string => {
  if (subsystemActive) {
    return "JPL MEAN ORBITS · LOG-COMPRESSED DISTANCE · BODY SIZES EXAGGERATED";
  }
  if (custom) return `SHAREABLE URL RECIPE · WORLDGEN V${WORLDGEN_VERSION}`;
  if (!solar) return "PLAUSIBLE VISUALIZATION FROM OBSERVED DATA";
  if (solarIdentity?.surfaceStatus === "unresolved") {
    return "UNRESOLVED SURFACE · PHYSICALLY CONSTRAINED NEUTRAL VISUALIZATION";
  }
  if (solarIdentity?.surfaceStatus === "modeled") {
    return "MEASURED PROPORTIONS · UNRESOLVED NEUTRAL SURFACE";
  }
  if (solarIdentity?.texture?.topography) {
    return "DAWN GLOBAL MOSAIC + MEASURED TOPOGRAPHY · EXORA LIGHTING";
  }
  if (solarIdentity?.texture) {
    return isMoon
      ? "NASA MISSION MOSAIC · MEASURED ROTATION + EXORA LIGHTING"
      : "SPACECRAFT GLOBAL MOSAIC · EXORA ATMOSPHERE + LIGHTING";
  }
  return "KNOWN PLANET · PHYSICALLY TUNED ATMOSPHERIC VISUALIZATION";
};

const subsystemLayers = (subsystem: PlanetarySubsystem): readonly PanelBody[] => [
  ...subsystem.rings.map((ring) => ({
    id: `ring-${ring.name}`,
    kind: "marker",
    meta: "MEASURED BOUNDARIES",
    name: ring.name,
  })),
  ...subsystem.lagrangePoints.map((point) => ({
    id: `lagrange-${point.reference}-${point.label}`,
    kind: "marker",
    meta: `${point.reference} · DERIVED MARKER`,
    name: point.label,
  })),
  ...(subsystem.magnetosphere
    ? [
        {
          id: "magnetosphere",
          kind: "marker",
          meta: `${subsystem.magnetosphere.evidence} BOUNDARY`,
          name: "Magnetosphere",
        },
      ]
    : []),
  ...(subsystem.aurora
    ? [
        {
          id: "aurora",
          kind: "marker",
          meta: `${subsystem.aurora.evidence} LATITUDE · SIMULATED BRIGHTNESS`,
          name: "Auroral regions",
        },
      ]
    : []),
  ...(subsystem.torus
    ? [
        {
          id: "torus",
          kind: "marker",
          meta: `${subsystem.torus.evidence} STRUCTURE · SIMULATED DENSITY`,
          name: `${subsystem.torus.moon} plasma torus`,
        },
      ]
    : []),
  ...subsystem.plumes.map((plume) => ({
    id: `plume-${plume.moon}`,
    kind: "marker",
    meta: `${plume.evidence} EVIDENCE · SIMULATED PARTICLES`,
    name: `${plume.moon} plume`,
  })),
];

export const PlanetExperience = ({
  chromeHidden,
  host,
  onToggleChrome,
  onOpenDiscover,
  onSelectHostStar,
  onSelectPlanet,
  onSelectStar,
  onSelectSystem,
  recipeOverride,
  result,
  travelPhase,
}: PlanetExperienceProps) => {
  const [fps, setFps] = useState("--");
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "error">("loading");
  const [sceneMode, setSceneMode] = useState<"subsystem" | "world">("world");
  const [subsystem, setSubsystem] = useState<PlanetarySubsystem | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("orbit");
  const [xrStatus, setXrStatus] = useState<XrStatus>("checking");
  const [hostJumpState, setHostJumpState] = useState<"idle" | "loading" | "error">("idle");
  const [systemJumpState, setSystemJumpState] = useState<"idle" | "loading" | "error">("idle");
  const [findSolarWorld, setFindSolarWorld] = useState<
    ((name: string) => ExoplanetProfile | null) | null
  >(null);
  const hostJumpRef = useRef(false);
  const findSolarWorldRef = useRef<((name: string) => ExoplanetProfile | null) | null>(null);
  findSolarWorldRef.current = findSolarWorld;
  const planet = result.planet;
  const custom = result.mode === "custom";
  const solar = result.mode === "solar";
  const solarIdentity = planet.solarSystem;
  const subsystemActive = sceneMode === "subsystem" && subsystem !== null;
  const isMoon = solarIdentity?.bodyType === "moon";
  const observation = planet.observation;
  const recipe = useMemo(
    () => recipeOverride ?? deriveWorldRecipe(planet),
    [planet, recipeOverride],
  );

  useEffect(() => {
    let active = true;
    if (!solar) {
      setSubsystem(null);
      return () => {
        active = false;
      };
    }

    void Promise.all([import("../planetary-subsystems.ts"), import("../solar-system.ts")]).then(
      ([{ findPlanetarySubsystem }, solarSystem]) => {
        if (!active) return;
        setFindSolarWorld(() => solarSystem.findSolarWorld);
        setSubsystem(findPlanetarySubsystem(planet.name));
      },
    );
    return () => {
      active = false;
    };
  }, [planet.name, solar]);

  const travelling = travelPhase === "departing" || travelPhase === "crossing";
  const typographySettled = useTypographySettled();
  const settled =
    (sceneState === "ready" && typographySettled) ||
    sceneState === "error" ||
    travelPhase !== "idle";

  const openHostStar = async (): Promise<void> => {
    if (custom || hostJumpRef.current) return;
    hostJumpRef.current = true;
    setHostJumpState("loading");
    host?.beginTravel();
    const found = await onSelectHostStar(planet.hostStar).catch(() => false);
    hostJumpRef.current = false;
    if (!found) {
      host?.cancelTravel();
      setHostJumpState("error");
    }
  };

  const openHostSystem = async (): Promise<void> => {
    if (custom || systemJumpState === "loading") return;
    setSystemJumpState("loading");
    host?.beginTravel();
    const found = await onSelectSystem(planet.hostStar).catch(() => false);
    if (!found) host?.cancelTravel();
    setSystemJumpState(found ? "idle" : "error");
  };

  useEffect(() => {
    if (!custom) warmDestinations(planet.hostStar);
  }, [custom, planet.hostStar]);

  useEffect(() => host?.onXrStatus(setXrStatus), [host]);

  useEffect(() => {
    if (!host) return;
    document.body.dataset.qualityTier = host.qualityTier;
    const fpsTimer = window.setInterval(() => {
      setFps(Math.round(host.getFps()).toString());
    }, 1_000);
    return () => window.clearInterval(fpsTimer);
  }, [host]);

  useEffect(() => {
    if (!host) return;

    let abandoned = false;
    setSceneState("loading");
    setViewMode(subsystemActive ? "subsystem" : "orbit");

    const mount = subsystemActive
      ? import("../subsystem-scene.ts").then(({ createSubsystemWorld }) =>
          host.mountWorld(() =>
            createSubsystemWorld(host, {
              onFirstFrame: () => {
                if (!abandoned) setSceneState("ready");
              },
              onSelectMoon: (name) => {
                const destination = findSolarWorldRef.current?.(name);
                if (destination) onSelectPlanet(destination, true);
              },
              planet,
              subsystem,
            }),
          ),
        )
      : import("../planet-scene.ts").then(({ createPlanetWorld }) =>
          host.mountWorld(() =>
            createPlanetWorld(host, {
              planet,
              recipe,
              onViewModeChange: setViewMode,
              ...(custom ? {} : { onSelectHostStar: () => void openHostStar() }),
              onFirstFrame: () => {
                if (!abandoned) setSceneState("ready");
              },
            }),
          ),
        );

    void mount.catch((error: unknown) => {
      console.error(error);
      if (!abandoned) setSceneState("error");
    });

    return () => {
      abandoned = true;
    };
  }, [
    custom,
    host,
    onSelectHostStar,
    onSelectPlanet,
    onSelectStar,
    onSelectSystem,
    planet,
    recipe,
    subsystem,
    subsystemActive,
  ]);

  const useJupiterUnits =
    planet.kind === "gas-giant" ||
    (planet.kind === "unknown" &&
      observation.massEarth === null &&
      observation.radiusEarth === null);
  const massUnit = useJupiterUnits ? (
    <>
      M<sub>J</sub>
    </>
  ) : (
    <>
      M<sub>⊕</sub>
    </>
  );
  const massValue = useJupiterUnits
    ? (observation.massJupiter ?? observation.massEarth)
    : (observation.massEarth ?? observation.massJupiter);
  const radiusUnit = useJupiterUnits ? (
    <>
      R<sub>J</sub>
    </>
  ) : (
    <>
      R<sub>⊕</sub>
    </>
  );
  const radiusValue = useJupiterUnits
    ? (observation.radiusJupiter ?? observation.radiusEarth)
    : (observation.radiusEarth ?? observation.radiusJupiter);
  const localOrbitKilometers = solarIdentity?.orbitalSemiMajorAxisKilometers ?? null;

  const primaryBody = isMoon ? (solarIdentity.parent ?? null) : null;

  const openPrimaryBody = (): void => {
    if (!isMoon || !solarIdentity.parent) return;
    const primary = findSolarWorld?.(solarIdentity.parent);
    if (primary) onSelectPlanet(primary, true);
  };

  const hostSpectrum = [
    observation.hostSpectralType ?? "Spectrum unavailable",
    observation.hostTemperatureKelvin === null
      ? null
      : `${formatNumber(observation.hostTemperatureKelvin, 0)} K`,
    observation.hostRadiusSolar === null
      ? null
      : `${formatNumber(observation.hostRadiusSolar, 2)} R☉`,
  ]
    .filter(Boolean)
    .join(" · ");

  const worldMetrics: readonly PanelMetric[] = [
    { label: "Mass", unit: massUnit, value: formatMeasurement(massValue) },
    { label: "Radius", unit: radiusUnit, value: formatMeasurement(radiusValue) },
    {
      label: "Orbit",
      unit: localOrbitKilometers === null ? "AU" : "KM",
      value: formatMeasurement(localOrbitKilometers ?? observation.semiMajorAxisAu, 1),
    },
    solarIdentity
      ? {
          label: "Period",
          unit: "DAYS",
          value: formatMeasurement(solarIdentity.orbitalPeriodDays ?? null, 2),
        }
      : { label: "Distance", unit: "PC", value: formatMeasurement(observation.distanceParsecs, 1) },
  ];

  const subsystemMetrics: readonly PanelMetric[] = subsystem
    ? [
        { label: "Moons", value: subsystem.moons.length.toString() },
        { label: "Ring layers", value: subsystem.rings.length.toString() },
        { label: "Resonances", value: subsystem.resonances.length.toString() },
        { label: "Fields", value: subsystemLayers(subsystem).length.toString() },
      ]
    : [];

  const worldFacts: readonly PanelFact[] = present<PanelFact>([
    {
      detail: `Exora inference · ${recipe.confidence} confidence`,
      label: "Atmosphere model",
      tone: "accent",
      value: recipe.atmosphere.label.split(" · ")[0],
    },
    !custom && {
      detail: hostSpectrum,
      label: "Host spectrum",
      value: observation.hostSpectralType ?? "Not reported",
    },
    custom && {
      detail: "The generated URL carries this recipe, so the same world rebuilds from the link.",
      label: "Shareable recipe",
      value: `Worldgen v${WORLDGEN_VERSION}`,
    },
    primaryBody
      ? {
          detail: `NAIF ${String(solarIdentity?.naifId ?? 0)} · direct parent ${primaryBody}`,
          label: `Orbit around ${primaryBody}`,
          value: `${formatNumber(solarIdentity?.orbitalPeriodDays ?? null, 3)} day sidereal`,
        }
      : null,
    solarIdentity
      ? {
          ...(solarIdentity.spkId ? { detail: `NAIF ${String(solarIdentity.naifId)}` } : {}),
          label: "Permanent identifier",
          value: solarIdentity.spkId
            ? `SPK ${solarIdentity.spkId}`
            : `NAIF ${String(solarIdentity.naifId)}`,
        }
      : null,
  ]);

  const panel: DestinationPanelModel = {
    footer: `${planet.source.archive} · ${planet.source.table} · ${planet.source.retrievedOn}`,
    label: custom ? "Custom planet data" : "Observed planet data",
    links: present([
      subsystem && {
        action: subsystemActive ? "RETURN TO WORLD" : "EXPLORE MOONS + FIELDS ↗",
        glyph: subsystemActive ? "◉" : "⌾",
        id: "subsystem",
        onSelect: () => setSceneMode(subsystemActive ? "world" : "subsystem"),
        pressed: subsystemActive,
        title: subsystemActive ? `${planet.name} close view` : `${planet.name} system`,
        tone: "cyan" as const,
      },
      !custom &&
        !subsystemActive && {
          action: hostJumpState === "loading" ? "RESOLVING…" : "VISIT STAR ↗",
          disabled: hostJumpState === "loading",
          ...(hostJumpState === "error"
            ? { error: "SIMBAD could not resolve this host name." }
            : {}),
          glyph: "☀",
          id: "host-star",
          onSelect: () => void openHostStar(),
          title: planet.hostStar,
        },
      !custom &&
        !subsystemActive && {
          action: systemJumpState === "loading" ? "PLACING ORBITS…" : "VIEW EVERY ORBIT ↗",
          disabled: systemJumpState === "loading",
          ...(systemJumpState === "error"
            ? { error: "The archive links no placeable orbits to this host." }
            : {}),
          glyph: "◎",
          id: "whole-system",
          onSelect: () => void openHostSystem(),
          title: "Whole system",
        },
      primaryBody && !subsystemActive
        ? {
            action: "VISIT PRIMARY ↗",
            glyph: "◉",
            id: "primary-body",
            onSelect: openPrimaryBody,
            title: primaryBody,
          }
        : null,
    ]),
    metrics: subsystemActive ? subsystemMetrics : worldMetrics,
    source: custom ? "WORLD FORGE" : solar ? "NASA/JPL" : "NASA ARCHIVE",
    tabs:
      subsystemActive && subsystem
        ? presentTabs([
            {
              blocks: [
                {
                  bodies: subsystem.moons.map((moon) => {
                    const destination = findSolarWorld?.(moon.name);
                    return {
                      id: String(moon.naifId),
                      meta: `NAIF ${String(moon.naifId)} · ${formatNumber(moon.orbitalSemiMajorAxisKilometers, 0)} km · ${moon.retrograde ? "retrograde" : "prograde"} · i ${String(moon.inclinationDegrees)}°`,
                      name: moon.name,
                      ...(destination
                        ? { onSelect: () => onSelectPlanet(destination, true) }
                        : { status: "UNRESOLVED" }),
                    };
                  }),
                  label: "SELECTED MOONS · JPL MEAN ELEMENTS",
                  type: "bodies",
                },
              ],
              count: subsystem.moons.length,
              id: "moons",
              label: "Moons",
            },
            {
              blocks: [
                {
                  bodies: subsystemLayers(subsystem),
                  label: "VISIBLE SYSTEM LAYERS",
                  type: "bodies",
                },
              ],
              id: "layers",
              label: "Layers",
            },
            {
              blocks: [
                {
                  facts: subsystem.resonances.map((resonance) => ({
                    detail: resonance.note,
                    label: resonance.ratio,
                    value: resonance.bodies.join(" · "),
                  })),
                  type: "facts",
                },
                subsystem.resonances.length === 0 && {
                  text: "No principal resonance authored for this view.",
                  type: "status" as const,
                },
              ].filter(Boolean) as never,
              count: subsystem.resonances.length,
              id: "resonances",
              label: "Resonances",
            },
            {
              blocks: [
                {
                  facts: [
                    {
                      detail:
                        "JPL mean elements preserve parent-relative distance, inclination, period, and retrograde direction.",
                      label: "Orbit evidence",
                      tone: "cyan" as const,
                      value: "Measured",
                    },
                    {
                      detail:
                        "Field boundaries, auroral brightness, plasma density, and plume particles are explanatory visualizations.",
                      label: "Transient layers",
                      tone: "accent" as const,
                      value: "Simulated",
                    },
                    {
                      detail: "Neutral silhouettes only; no surface geography has been invented.",
                      label: "Minor moons",
                      value: "Unresolved surfaces",
                    },
                  ],
                  type: "facts",
                },
              ],
              id: "evidence",
              label: "Evidence",
            },
          ])
        : presentTabs([
            { blocks: [{ facts: worldFacts, type: "facts" }], id: "record", label: "Record" },
            solarIdentity?.surfaceNote
              ? {
                  blocks: [
                    {
                      facts: [
                        {
                          detail: solarIdentity.surfaceNote,
                          label: "Surface evidence",
                          value: solarIdentity.surfaceStatus ?? "Unresolved",
                        },
                      ],
                      type: "facts",
                    },
                  ],
                  id: "evidence",
                  label: "Evidence",
                }
              : null,
          ]),
    title: subsystemActive
      ? "Subsystem layout"
      : custom
        ? "Chosen properties"
        : solar
          ? "Planetary parameters"
          : "Observed properties",
  };

  return (
    <div
      className={cx(
        `experience-shell view-${viewMode} ${subsystemActive ? "subsystem-experience" : ""} ${settled ? "scene-ready" : ""} ${sceneState === "error" ? "scene-error" : ""} ${travelling ? "travelling" : ""} ${chromeHidden ? "chrome-hidden" : ""}`,
      )}
      style={{ "--surface-transition": `${SURFACE_TRANSITION_MS}ms` } as CSSProperties}
    >
      <div className={cx("space-haze")} aria-hidden="true" />
      <div className={cx("viewport-grid")} aria-hidden="true" />
      <div className={cx("surface-veil")} aria-hidden="true" />

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
          category={custom ? "GENERATED WORLD" : solar ? "SOLAR SYSTEM WORLD" : "CONFIRMED WORLD"}
          classification={
            (solar ? solarIdentity?.bodyType : planet.kind.replace("-", " ")) ?? "WORLD"
          }
          name={formatPlanetName(planet.name)}
          nameId="world-name"
          note={visualNote({ custom, isMoon, solar, solarIdentity, subsystemActive })}
          summary={(solar ? solarIdentity?.summary : recipe.summary) ?? recipe.summary}
          tags={[
            recipe.classification,
            observation.equilibriumTemperatureKelvin === null
              ? "TEMP UNKNOWN"
              : `${formatNumber(observation.equilibriumTemperatureKelvin, 0)} K`,
            observation.discoveryMethod,
          ]}
          tagsLabel="World classification"
          tone={subsystemActive ? "subsystem" : "world"}
        />

        <DestinationPanel fps={fps} model={panel} />
      </main>

      <MissionControl
        chromeHidden={chromeHidden}
        hints={[
          { key: "WASD", meaning: "MOVE" },
          { key: "DRAG", meaning: viewMode === "surface" ? "LOOK" : "ORBIT" },
          {
            key: "SCROLL",
            meaning:
              viewMode === "surface"
                ? "RETURN"
                : viewMode === "subsystem"
                  ? "SCALE SYSTEM"
                  : "ZOOM / APPROACH",
          },
          ...(viewMode === "subsystem"
            ? [{ key: "CLICK", meaning: "VISIT MOON" }]
            : viewMode === "orbit" && !custom
              ? [{ key: "CLICK", meaning: "VISIT STAR" }]
              : []),
        ]}
        onToggleChrome={onToggleChrome}
        onOpenDiscover={onOpenDiscover}
        sceneFailed={sceneState === "error"}
        xr={{ host, status: xrStatus }}
      />

      <div
        className={cx(`loading-screen ${typographySettled ? "type-settled" : ""}`)}
        role="status"
      >
        <div className={cx("loading-orbit")} aria-hidden="true">
          <span />
        </div>
        <p>CALCULATING WORLD</p>
        <small>
          {subsystemActive
            ? `${planet.name.toUpperCase()} SUBSYSTEM`
            : `${planet.name.toUpperCase()} · SEED ${recipe.seed.toString(16).toUpperCase()}`}
        </small>
      </div>
    </div>
  );
};
