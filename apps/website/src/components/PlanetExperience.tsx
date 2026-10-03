import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import {
  deriveTidalLocking,
  deriveWorldRecipe,
  WORLDGEN_VERSION,
  type WorldRecipe,
} from "@exora/worldgen";
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
import { compositionFacts, readComposition } from "../composition.ts";
import { detectionFacts, readDetectionSignal } from "../detection-signal.ts";
import { nextTransitFact, predictTransits } from "../transit-ephemeris.ts";
import type { ViewMode } from "../planet-scene.ts";
import { readHabitableZone } from "../habitable-zone-reading.ts";
import { readProvenance } from "../measurement-provenance.ts";
import { derivePlanetPhysics } from "../planet-physics.ts";
import { skyFacts } from "../sky-position.ts";
import {
  formatMeasurement,
  formatNumber,
  formatPlanetName,
  formatTimescale,
} from "../planet-utils.tsx";
import type { PlanetarySubsystem } from "../planetary-subsystems.ts";
import { capitalize } from "../readable.ts";
import type { SceneHost } from "../scene-host.ts";
import { starLight } from "../star-light.ts";
import { SURFACE_TRANSITION_MS, type TravelPhase } from "../travel-transition.ts";
import { MassRadiusDiagram } from "./MassRadiusDiagram.tsx";
import { SignalCurves } from "./SignalCurves.tsx";
import { DestinationShell, type SceneState } from "./shell/DestinationShell.tsx";

const TRANSIT_DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  timeZoneName: "short",
  weekday: "short",
});

interface PlanetExperienceProps {
  host: SceneHost | null;
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
    return "JPL mean orbits, with distances log-compressed and bodies drawn larger than life.";
  }
  if (custom) return `Rebuilt from the recipe in its link · worldgen v${WORLDGEN_VERSION}.`;
  if (!solar) return "";
  if (solarIdentity?.surfaceStatus === "unresolved") {
    return "No spacecraft has resolved this surface, so it is drawn neutral within its measured constraints.";
  }
  if (solarIdentity?.surfaceStatus === "modeled") {
    return "Measured proportions; the surface itself is unresolved and drawn neutral.";
  }
  if (solarIdentity?.texture?.topography) {
    return "Dawn's global mosaic over measured topography, lit by Exora.";
  }
  if (solarIdentity?.texture) {
    return isMoon
      ? "NASA mission mosaic on its measured rotation, lit by Exora."
      : "Spacecraft global mosaic under an atmosphere and lighting modelled by Exora.";
  }
  return "A known planet, its atmosphere tuned to its measured physics.";
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
  host,
  onSelectHostStar,
  onSelectPlanet,
  onSelectStar,
  onSelectSystem,
  recipeOverride,
  result,
  travelPhase,
}: PlanetExperienceProps) => {
  const [clockMs, setClockMs] = useState(Date.now);
  const [sceneState, setSceneState] = useState<SceneState>("loading");
  const [sceneMode, setSceneMode] = useState<"subsystem" | "world">("world");
  const [subsystem, setSubsystem] = useState<PlanetarySubsystem | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("orbit");
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

  useEffect(() => {
    const minuteTimer = window.setInterval(() => setClockMs(Date.now()), 60_000);
    return () => window.clearInterval(minuteTimer);
  }, []);

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
  const provenance = readProvenance(observation);

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
    {
      label: provenance.massLabel,
      unit: massUnit,
      value: `${massValue === null ? "" : provenance.massPrefix}${formatMeasurement(massValue)}`,
    },
    {
      label: provenance.radiusLabel,
      unit: radiusUnit,
      value: `${radiusValue === null ? "" : provenance.radiusPrefix}${formatMeasurement(radiusValue)}`,
    },
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

  const tidalLocking = custom || primaryBody ? null : deriveTidalLocking(planet);
  const detection = useMemo(
    () => readDetectionSignal(planet, recipe.derived.equilibriumTemperatureKelvin),
    [planet, recipe.derived.equilibriumTemperatureKelvin],
  );
  const composition = useMemo(
    () => readComposition(planet, recipe.derived.equilibriumTemperatureKelvin),
    [planet, recipe.derived.equilibriumTemperatureKelvin],
  );
  const nextTransit = useMemo(
    () =>
      nextTransitFact(
        predictTransits({
          declinationDegrees: observation.declinationDegrees,
          nowMs: clockMs,
          periodDays: observation.orbitalPeriodDays,
          rightAscensionDegrees: observation.rightAscensionDegrees,
          signal: observation.signal,
        }),
        detection.transit?.durationHours ?? null,
        clockMs,
        TRANSIT_DATE_FORMAT,
      ),
    [clockMs, detection.transit?.durationHours, observation],
  );
  const habitableZone = custom || primaryBody ? null : readHabitableZone(planet);

  const worldFacts: readonly PanelFact[] = present<PanelFact>([
    {
      detail: `Exora inference · ${recipe.confidence} confidence`,
      label: "Atmosphere model",
      tone: "accent",
      value: recipe.atmosphere.label.split(" · ")[0],
    },
    provenance.note !== null && {
      detail: provenance.note,
      label: "Mass & radius",
      tone: "gold",
      value: provenance.summary,
    },
    habitableZone && {
      detail: habitableZone.detail,
      label: "Habitable zone",
      ...(habitableZone.within ? { tone: "cyan" as const } : {}),
      value: habitableZone.value,
    },
    !custom && {
      detail: hostSpectrum,
      label: "Host spectrum",
      value: observation.hostSpectralType ?? "Not reported",
    },
    tidalLocking && {
      detail: tidalLocking.locked
        ? `Star-raised tides despin it in ~${formatTimescale(tidalLocking.despinTimescaleYears)}, so one hemisphere always faces ${planet.hostStar} · day = orbit = ${formatNumber(tidalLocking.rotationPeriodDays, 2)} d`
        : `Tidal despin would take ~${formatTimescale(tidalLocking.despinTimescaleYears)}, so it likely keeps a day of its own`,
      label: "Rotation",
      value: tidalLocking.locked ? "Tidally locked" : "Free rotation",
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
        icon: subsystemActive ? ("planet" as const) : ("moon" as const),
        id: "subsystem",
        label: subsystemActive ? `Back to ${planet.name}` : `Explore ${planet.name}'s moons`,
        onSelect: () => setSceneMode(subsystemActive ? "world" : "subsystem"),
        pressed: subsystemActive,
      },
      !custom &&
        !subsystemActive && {
          busy: hostJumpState === "loading",
          disabled: hostJumpState === "loading",
          ...(hostJumpState === "error"
            ? { error: `SIMBAD could not find a star called ${planet.hostStar}.` }
            : {}),
          icon: "star" as const,
          id: "host-star",
          label: `Visit ${planet.hostStar}`,
          onSelect: () => void openHostStar(),
        },
      !custom &&
        !subsystemActive && {
          busy: systemJumpState === "loading",
          disabled: systemJumpState === "loading",
          ...(systemJumpState === "error"
            ? { error: "The archive has no orbits it can place for this system." }
            : {}),
          icon: "orbit" as const,
          id: "whole-system",
          label: "Whole system",
          onSelect: () => void openHostSystem(),
        },
      primaryBody && !subsystemActive
        ? {
            icon: "planet" as const,
            id: "primary-body",
            label: `Visit ${primaryBody}`,
            onSelect: openPrimaryBody,
          }
        : null,
    ]),
    metrics: subsystemActive ? subsystemMetrics : worldMetrics,
    source: custom ? "World Forge" : solar ? "NASA/JPL" : "NASA Exoplanet Archive",
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
            !custom &&
              !solar && {
                blocks: [
                  {
                    facts: skyFacts({
                      declinationDegrees: observation.declinationDegrees,
                      distanceParsecs: observation.distanceParsecs,
                      rightAscensionDegrees: observation.rightAscensionDegrees,
                      visualMagnitude: null,
                    }),
                    type: "facts" as const,
                  },
                ],
                id: "sky",
                label: "Sky",
              },
            !custom &&
              !primaryBody && {
                blocks: [
                  {
                    content: composition ? (
                      <MassRadiusDiagram name={planet.name} reading={composition} />
                    ) : null,
                    type: "custom" as const,
                  },
                  {
                    facts: [
                      ...compositionFacts(composition),
                      ...derivePlanetPhysics(planet, recipe.derived),
                    ],
                    type: "facts" as const,
                  },
                ],
                id: "physics",
                label: "Physics",
              },
            !custom &&
              !solar && {
                blocks: [
                  { facts: present([nextTransit]), type: "facts" as const },
                  {
                    content: (
                      <SignalCurves
                        eccentricity={observation.orbitalEccentricity}
                        periodDays={observation.orbitalPeriodDays}
                        transit={detection.transit}
                        velocity={detection.velocity}
                      />
                    ),
                    type: "custom" as const,
                  },
                  { facts: detectionFacts(planet, detection), type: "facts" as const },
                ],
                id: "signal",
                label: "Signal",
              },
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

  const hints = [
    { key: "Drag", meaning: viewMode === "surface" ? "Look around" : "Orbit" },
    {
      key: "Scroll",
      meaning:
        viewMode === "surface"
          ? "Return to orbit"
          : viewMode === "subsystem"
            ? "Scale the system"
            : "Zoom, or land",
    },
    ...(viewMode === "subsystem" ? [] : [{ key: "W A S D", meaning: "Move" }]),
    ...(viewMode === "subsystem"
      ? [{ key: "Click", meaning: "Visit a moon" }]
      : viewMode === "orbit" && !custom
        ? [{ key: "Click", meaning: "Visit the star" }]
        : []),
    { key: "H", meaning: "Hide interface" },
  ];

  return (
    <DestinationShell
      className={`view-${viewMode} ${subsystemActive ? "subsystem-experience" : ""}`}
      hints={hints}
      host={host}
      identity={{
        category: custom ? "Generated world" : solar ? "Solar System" : "Confirmed world",
        classification: capitalize(
          (solar ? solarIdentity?.bodyType.replace("-", " ") : planet.kind.replace("-", " ")) ??
            "world",
        ),
        name: formatPlanetName(planet.name),
        nameId: "world-name",
        note: visualNote({ custom, isMoon, solar, solarIdentity, subsystemActive }),
        summary: (solar ? solarIdentity?.summary : recipe.summary) ?? recipe.summary,
        tags: [
          recipe.classification,
          recipe.derived.equilibriumTemperatureKelvin === null
            ? "Temperature unknown"
            : `${recipe.derived.equilibriumTemperatureSource === "derived" ? "~" : ""}${formatNumber(recipe.derived.equilibriumTemperatureKelvin, 0)} K`,
          observation.discoveryMethod,
        ],
        tagsLabel: "World classification",
        tone: subsystemActive ? "subsystem" : "world",
      }}
      light={starLight(custom ? null : observation.hostTemperatureKelvin)}
      loading={{
        detail: subsystemActive
          ? `${planet.name} and its moons`
          : `${planet.name} · seed ${recipe.seed.toString(16).toUpperCase()}`,
        title: subsystemActive ? "Placing moons" : "Calculating world",
      }}
      panel={panel}
      sceneState={sceneState}
      style={{ "--surface-transition": `${SURFACE_TRANSITION_MS}ms` } as CSSProperties}
      surfaceVeil
      travelPhase={travelPhase}
    />
  );
};
