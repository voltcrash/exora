import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { useEffect, useRef, useState } from "react";
import type { SystemLoadResult } from "../api-client.ts";
import { reachStar } from "../destination-cache.ts";
import {
  present,
  presentTabs,
  type DestinationPanelModel,
  type PanelBlock,
  type PanelFact,
} from "../destination-panel.ts";
import { formatNumber } from "../planet-utils.tsx";
import type { SceneHost } from "../scene-host.ts";
import {
  createOrbitVoice,
  nearestSimpleRatio,
  orbitPitches,
  type OrbitVoice,
} from "../orbit-sonification.ts";
import { MIN_SOLAR_TIME, MAX_SOLAR_TIME } from "../solar-ephemeris.ts";
import {
  bodyScaleLabel,
  bodySizeProvenance,
  elementProvenance,
  hasEarthSightline,
  habitableZoneLabel,
  habitableZoneTag,
  orbitMappingLabel,
  timeScaleLabel,
  type SystemLayout,
} from "../system-layout.ts";
import { starLight } from "../star-light.ts";
import type { SystemWorld } from "../system-scene.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { DestinationShell, type SceneState } from "./shell/DestinationShell.tsx";
import { Button } from "./ui/Button.tsx";
import { Segmented } from "./ui/Segmented.tsx";
import styles from "./SystemControls.module.css";

interface SystemExperienceProps {
  host: SceneHost | null;
  onSelectHostStar: (hostStar: string) => Promise<boolean>;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
  result: SystemLoadResult;
  travelPhase: TravelPhase;
}

const localDateTimeValue = (date: Date): string => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19);
};

const PLAYBACK_RATES = [
  { id: "1", label: "Real time" },
  { id: "60", label: "1 min/s" },
  { id: "3600", label: "1 h/s" },
  { id: "86400", label: "1 d/s" },
] as const;

const CLOCK_RATES = [
  { id: "0.25", label: "¼×" },
  { id: "1", label: "1×" },
  { id: "4", label: "4×" },
  { id: "16", label: "16×" },
] as const;

const signedDays = (days: number): string => {
  const magnitude = Math.abs(days);
  const text =
    magnitude >= 3_652.5
      ? `${formatNumber(magnitude / 365.25, 0)} yr`
      : magnitude >= 365.25
        ? `${formatNumber(magnitude / 365.25, 1)} yr`
        : `${formatNumber(magnitude, 1)} d`;
  return `${days < 0 ? "−" : "+"}${text}`;
};

export const SystemExperience = ({
  host,
  onSelectHostStar,
  onSelectPlanet,
  onSelectStar,
  result,
  travelPhase,
}: SystemExperienceProps) => {
  const [layout, setLayout] = useState<SystemLayout | null>(null);
  const [sceneState, setSceneState] = useState<SceneState>("loading");
  const [starJumpState, setStarJumpState] = useState<"error" | "idle" | "loading">("idle");
  const [ephemeris, setEphemeris] = useState(false);
  const [displayedAt, setDisplayedAt] = useState(() => new Date());
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(3_600);
  const [playbackDirection, setPlaybackDirection] = useState<1 | -1>(1);
  const [clockRate, setClockRate] = useState(1);
  const [clockDirection, setClockDirection] = useState<1 | -1>(1);
  const [clockRunning, setClockRunning] = useState(true);
  const [orbitDays, setOrbitDays] = useState(0);
  const [listening, setListening] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const audioStarting = useRef(false);
  const voiceRef = useRef<OrbitVoice | null>(null);
  const worldRef = useRef<SystemWorld | null>(null);
  const starJumpRef = useRef(false);
  const ephemerisRef = useRef(false);
  const displayedAtRef = useRef(displayedAt);
  const { cached, hostStar, planets } = result;
  const solar = planets.length > 0 && planets.every((planet) => planet.solarSystem);

  const activateEphemeris = (epoch: Date): void => {
    if (
      !solar ||
      !Number.isFinite(epoch.getTime()) ||
      epoch.getTime() < MIN_SOLAR_TIME ||
      epoch.getTime() > MAX_SOLAR_TIME
    )
      return;
    setPlaying(false);
    ephemerisRef.current = true;
    displayedAtRef.current = epoch;
    setEphemeris(true);
    setListening(false);
    setDisplayedAt(epoch);
    worldRef.current?.setEphemerisTime(epoch);
    worldRef.current?.setEphemeris(true);
  };

  const useCatalogPositions = (): void => {
    setPlaying(false);
    setEphemeris(false);
    ephemerisRef.current = false;
    worldRef.current?.setEphemeris(false);
  };

  const openHostStar = async (): Promise<void> => {
    if (starJumpRef.current) return;
    starJumpRef.current = true;
    setStarJumpState("loading");
    host?.beginTravel();
    const found = await onSelectHostStar(hostStar).catch(() => false);
    if (!found) host?.cancelTravel();
    starJumpRef.current = false;
    setStarJumpState(found ? "idle" : "error");
  };

  useEffect(() => {
    void reachStar(hostStar).catch(() => null);
  }, [hostStar]);

  const effectiveClockRate = !ephemeris && clockRunning ? clockRate * clockDirection : 0;
  useEffect(() => {
    worldRef.current?.setClockRate(effectiveClockRate);
  }, [effectiveClockRate, layout]);

  useEffect(() => {
    const world = worldRef.current;
    const voice = voiceRef.current;
    if (!listening || !layout || !world || !voice) return;
    const pitches = orbitPitches(layout.orbits.map((orbit) => orbit.elements.periodDays));
    const spread = layout.orbits.length > 1 ? 1.2 / (layout.orbits.length - 1) : 0;
    const stopState = voice.onStateChange((running) => {
      if (!running) setListening(false);
    });
    const stopCrossings = world.onSightlineCrossing((index) => {
      const pitch = pitches[index];
      if (pitch !== null && pitch !== undefined) voice.pluck(pitch, -0.6 + index * spread);
    });
    return () => {
      stopState();
      stopCrossings();
    };
  }, [layout, listening]);

  useEffect(
    () => () => {
      voiceRef.current?.dispose();
      voiceRef.current = null;
    },
    [],
  );

  const toggleListening = async (): Promise<void> => {
    if (audioStarting.current || ephemerisRef.current) return;
    if (listening) {
      setListening(false);
      return;
    }
    voiceRef.current ??= createOrbitVoice();
    if (!voiceRef.current) {
      setAudioUnavailable(true);
      return;
    }
    audioStarting.current = true;
    const voice = voiceRef.current;
    const ready = await voice.resume();
    audioStarting.current = false;
    if (voiceRef.current !== voice || ephemerisRef.current) return;
    setAudioUnavailable(!ready);
    setListening(ready);
  };

  useEffect(() => {
    if (!layout) return;
    const timer = window.setInterval(() => {
      setOrbitDays(worldRef.current?.orbitDays() ?? 0);
    }, 250);
    return () => window.clearInterval(timer);
  }, [layout]);

  useEffect(() => {
    if (!playing || !ephemeris) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - previous;
      previous = now;
      const requestedTime =
        displayedAtRef.current.getTime() + elapsed * playbackRate * playbackDirection;
      const minimum = MIN_SOLAR_TIME;
      const maximum = MAX_SOLAR_TIME;
      const boundedTime = Math.min(maximum, Math.max(minimum, requestedTime));
      if (boundedTime !== requestedTime) setPlaying(false);
      const next = new Date(boundedTime);
      displayedAtRef.current = next;
      worldRef.current?.setEphemerisTime(next);
      setDisplayedAt(next);
    }, 100);
    return () => window.clearInterval(timer);
  }, [ephemeris, playbackDirection, playbackRate, playing]);

  useEffect(() => {
    if (!host) return;
    let abandoned = false;
    const controller = new AbortController();
    setSceneState("loading");

    void Promise.all([
      import("../system-scene.ts"),
      solar ? import("../solar-orbits.ts") : Promise.resolve(null),
    ])
      .then(([{ createSystemWorld }, orbitalModel]) =>
        abandoned
          ? null
          : host.mountWorld(
              () =>
                createSystemWorld(host, {
                  ...(orbitalModel ? { solarPositionsAt: orbitalModel.solarPositionsAt } : {}),
                  hostName: hostStar,
                  planets,
                  onSelectHostStar: () => void openHostStar(),
                  onSelectWorld: (planet) => onSelectPlanet(planet, cached),
                  onFirstFrame: () => {
                    if (!abandoned) setSceneState("ready");
                  },
                }),
              controller.signal,
            ),
      )
      .then((world: SystemWorld | null) => {
        if (!world || abandoned) return;
        worldRef.current = world;
        if (ephemerisRef.current) {
          world.setEphemerisTime(displayedAtRef.current);
          world.setEphemeris(true);
        }
        setLayout(world.layout);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!abandoned) setSceneState("error");
      });

    return () => {
      abandoned = true;
      controller.abort();
      worldRef.current = null;
    };
  }, [cached, host, hostStar, onSelectHostStar, onSelectPlanet, onSelectStar, planets, solar]);

  const drawn = layout?.orbits ?? [];
  const unplaced = layout?.unplaced ?? [];

  const positionMode = ephemeris ? "Derived local positions" : "Simplified catalog orbits";

  const ephemerisControls = (
    <div className={styles["controls"]}>
      <p className={styles["state"]} data-live={ephemeris ? "true" : undefined} role="status">
        {positionMode}
      </p>
      <label className={styles["field"]}>
        <span>Local date and time</span>
        <input
          type="datetime-local"
          min={localDateTimeValue(new Date(MIN_SOLAR_TIME))}
          max={localDateTimeValue(new Date(MAX_SOLAR_TIME))}
          step="1"
          value={localDateTimeValue(displayedAt)}
          onChange={(event) => {
            const selected = new Date(event.currentTarget.value);
            if (
              !Number.isFinite(selected.getTime()) ||
              selected.getTime() < MIN_SOLAR_TIME ||
              selected.getTime() > MAX_SOLAR_TIME
            )
              return;
            setPlaying(false);
            displayedAtRef.current = selected;
            setDisplayedAt(selected);
            worldRef.current?.setEphemerisTime(selected);
          }}
        />
      </label>
      <div className={styles["row"]}>
        <Button size="sm" onClick={() => activateEphemeris(displayedAt)}>
          Use this date
        </Button>
        <Button size="sm" onClick={() => activateEphemeris(new Date())}>
          Now
        </Button>
      </div>
      <div className={styles["transport"]} role="group" aria-label="Ephemeris playback">
        <Button
          size="sm"
          icon="reverse"
          disabled={!ephemeris}
          aria-pressed={playing && playbackDirection === -1}
          onClick={() => {
            setPlaybackDirection(-1);
            setPlaying(true);
          }}
        >
          Reverse
        </Button>
        <Button
          size="sm"
          icon="pause"
          disabled={!ephemeris || !playing}
          onClick={() => setPlaying(false)}
        >
          Pause
        </Button>
        <Button
          size="sm"
          icon="play"
          disabled={!ephemeris}
          aria-pressed={playing && playbackDirection === 1}
          onClick={() => {
            setPlaybackDirection(1);
            setPlaying(true);
          }}
        >
          Play
        </Button>
      </div>
      <div className={styles["field"]}>
        <span>Playback rate</span>
        <Segmented
          label="Playback rate"
          options={PLAYBACK_RATES}
          value={String(playbackRate) as (typeof PLAYBACK_RATES)[number]["id"]}
          onChange={(rate) => setPlaybackRate(Number(rate))}
        />
      </div>
      <Button size="sm" variant="ghost" disabled={!ephemeris} onClick={useCatalogPositions}>
        Back to catalog orbits
      </Button>
      <p className={styles["note"]}>
        {ephemeris
          ? "Derived locally from bundled orbital states using blended two-body propagation. Heliocentric ecliptic J2000; UTC 1900–2100. Worst sampled error 0.000332 AU across 65 comparisons (52 away from anchors); not a guaranteed bound. Earth and Pluto use system barycenters. Approximate visualization, not navigation."
          : "Catalog orbit shapes with seeded phases. Apply a date for derived local positions."}
      </p>
    </div>
  );

  const neighbourRatios: readonly PanelFact[] = drawn.flatMap((orbit, index) => {
    const next = drawn[index + 1];
    const inner = orbit.elements.periodDays;
    const outer = next?.elements.periodDays ?? null;
    if (!next || inner === null || outer === null || inner <= 0) return [];
    const ratio = outer / inner;
    const simple = nearestSimpleRatio(ratio);
    return [
      {
        detail: simple
          ? `Within 1% of ${simple} · heard as that interval`
          : "No simple ratio within 1% · the two notes drift apart",
        label: `${orbit.planet.name} → ${next.planet.name}`,
        ...(simple ? { tone: "cyan" as const } : {}),
        value: `${formatNumber(ratio, 3)} × the period`,
      },
    ];
  });

  const clockControls = (
    <div className={styles["controls"]}>
      <p
        className={styles["state"]}
        data-live={!ephemeris && clockRunning ? "true" : undefined}
        role="status"
      >
        {ephemeris
          ? "JPL positions are driving the diorama"
          : `${clockRunning ? (clockDirection === 1 ? "Running" : "Running backwards") : "Held"} · ${
              layout
                ? `1 s = ${formatNumber(layout.daysPerSecond * clockRate, 2)} d`
                : "placing orbits"
            }`}
      </p>
      <p className={styles["readout"]} aria-live="off">
        <strong>{signedDays(orbitDays)}</strong> of catalog orbit since this view opened
      </p>
      <div className={styles["transport"]} role="group" aria-label="Diorama clock">
        <Button
          size="sm"
          icon="reverse"
          disabled={Boolean(ephemeris)}
          aria-pressed={clockRunning && clockDirection === -1}
          onClick={() => {
            setClockDirection(-1);
            setClockRunning(true);
          }}
        >
          Reverse
        </Button>
        <Button
          size="sm"
          icon="pause"
          disabled={Boolean(ephemeris)}
          aria-pressed={!clockRunning}
          onClick={() => setClockRunning(false)}
        >
          Hold
        </Button>
        <Button
          size="sm"
          icon="play"
          disabled={Boolean(ephemeris)}
          aria-pressed={clockRunning && clockDirection === 1}
          onClick={() => {
            setClockDirection(1);
            setClockRunning(true);
          }}
        >
          Run
        </Button>
      </div>
      <div className={styles["field"]}>
        <span>Clock rate</span>
        <Segmented
          label="Clock rate"
          options={CLOCK_RATES}
          value={String(clockRate) as (typeof CLOCK_RATES)[number]["id"]}
          onChange={(rate) => {
            if (!ephemeris) setClockRate(Number(rate));
          }}
        />
      </div>
      <Button
        icon={listening ? "music-off" : "music"}
        disabled={Boolean(ephemeris)}
        aria-pressed={listening}
        onClick={() => void toggleListening()}
      >
        {listening ? "Stop listening" : "Listen to the orbits"}
      </Button>
      <p className={styles["note"]}>
        {audioUnavailable
          ? "Audio could not start. Try listening again after checking browser audio access."
          : "Each world plucks a note as it crosses our line of sight — the moment it would transit. Pitch follows orbital frequency, folded into one octave, so resonant orbits sound in harmony."}
      </p>
      <p className={styles["note"]}>
        {ephemeris
          ? "Go back to catalog orbits in the Time tab to run this clock."
          : "Every world keeps its measured period; the rate scales all of them together."}
      </p>
    </div>
  );

  const worldBlocks: readonly PanelBlock[] = present<PanelBlock>([
    sceneState === "loading" && { text: "Placing orbits…", type: "status" as const },
    drawn.length > 0 && {
      bodies: drawn.map((orbit) => ({
        id: orbit.planet.id,
        kind: orbit.planet.kind,
        meta: [
          `${formatNumber(orbit.elements.semiMajorAxisAu, 3)} AU`,
          orbit.elements.periodDays === null
            ? "untimed"
            : `${formatNumber(orbit.elements.periodDays, 1)} d`,
          habitableZoneTag(orbit.habitableZone),
          elementProvenance(orbit.elements),
          bodySizeProvenance(orbit),
        ]
          .filter(Boolean)
          .join(" · "),
        name: orbit.planet.name,
        onSelect: () => onSelectPlanet(orbit.planet, cached),
      })),
      label: "Worlds in the diorama",
      type: "bodies" as const,
    },
    unplaced.length > 0 && {
      text: `Not placed: ${unplaced.map(({ name }) => name).join(", ")}. The archive has no orbit size for them and no period to derive one from.`,
      tone: "accent" as const,
      type: "status" as const,
    },
  ]);

  const panel: DestinationPanelModel = {
    footer: ephemeris
      ? "Local two-body orbital model · derived · UTC 1900–2100"
      : `NASA Exoplanet Archive · pscomppars · ${result.planets[0]?.source.retrievedOn ?? "unsynchronized"}`,
    label: "System layout and observed data",
    links: [
      {
        busy: starJumpState === "loading",
        disabled: starJumpState === "loading",
        ...(starJumpState === "error"
          ? { error: `SIMBAD could not find a star called ${hostStar}.` }
          : {}),
        icon: "star",
        id: "host-star",
        label: `Visit ${hostStar}`,
        onSelect: () => void openHostStar(),
      },
    ],
    metrics: [
      { label: "Worlds", value: planets.length.toString() },
      { label: "Orbits drawn", value: drawn.length.toString() },
      {
        label: "Host radius",
        unit: "R☉",
        value: layout ? formatNumber(layout.hostRadiusSolar, 2) : "—",
      },
      { label: "Positions", value: ephemeris ? "Derived" : "Catalog" },
    ],
    source: "Diorama scale",
    tabs: presentTabs([
      { blocks: worldBlocks, count: drawn.length, id: "worlds", label: "Worlds" },
      {
        blocks: [
          { content: clockControls, type: "custom" as const },
          { facts: neighbourRatios, type: "facts" as const },
        ],
        id: "clock",
        label: "Clock",
      },
      solar && {
        blocks: [{ content: ephemerisControls, type: "custom" as const }],
        id: "time",
        label: "Time",
      },
      {
        blocks: [
          {
            facts: present<PanelFact>([
              { label: "Orbit radii", value: layout ? orbitMappingLabel(layout) : "—" },
              { label: "Body radii", value: layout ? bodyScaleLabel(layout) : "—" },
              {
                ...(clockRate === 1
                  ? {}
                  : { detail: `Running at ${String(clockRate)}× in the Clock tab` }),
                label: "Clock",
                value: layout ? timeScaleLabel(layout) : "—",
              },
              layout &&
                hasEarthSightline(layout) && {
                  detail:
                    "Catalog inclinations are measured against the sky, so Earth lies along this axis. A world whose orbit is seen edge-on along it crosses the star's face.",
                  label: "Line of sight",
                  value: "Dashed axis toward Earth",
                },
              {
                detail: layout?.habitableZone
                  ? `Kopparapu et al. (2014) flux limits for an Earth-mass world, from the host's ${
                      layout.habitableZone.luminositySource === "measured"
                        ? "measured luminosity"
                        : "radius and temperature"
                    }${
                      layout.habitableZone.extrapolated
                        ? ", extrapolated beyond the fit's 2,600–7,200 K calibration"
                        : ""
                    }. The green band spans the conservative zone and fades across the optimistic one.`
                  : "The archive lacks the host temperature and luminosity or radius the flux limits need.",
                label: "Habitable zone",
                ...(layout?.habitableZone ? { tone: "cyan" as const } : {}),
                value: layout ? habitableZoneLabel(layout) : "—",
              },
              {
                detail: ephemeris
                  ? "Derived locally from bundled osculating states; simplified two-body dynamics, not a measured position."
                  : "No catalog records where a world is on its orbit. Starting positions are seeded from each planet’s identifier.",
                label: "Orbital phase",
                ...(ephemeris ? { tone: "cyan" as const } : {}),
                value: ephemeris ? "Derived locally" : "Not measured",
              },
            ]),
            type: "facts" as const,
          },
          {
            text: "Radii are logarithmic, not linear, and bodies are drawn far larger than their orbits would allow.",
            tone: "accent" as const,
            type: "status" as const,
          },
        ],
        id: "scale",
        label: "Scale",
      },
    ]),
    title: "What the picture compressed",
  };

  const hostTemperature = planets.find(
    (planet) => planet.observation.hostTemperatureKelvin !== null,
  )?.observation.hostTemperatureKelvin;

  return (
    <DestinationShell
      className="system-experience"
      hints={[
        { key: "Drag", meaning: "Orbit" },
        { key: "Scroll", meaning: "Zoom" },
        { key: "Click", meaning: "Travel" },
        { key: "H", meaning: "Hide interface" },
      ]}
      host={host}
      identity={{
        category: solar ? "Home system" : "Confirmed system",
        classification: `${planets.length} known world${planets.length === 1 ? "" : "s"}`,
        name: hostStar,
        nameId: "system-name",
        note: ephemeris
          ? "Body positions are derived locally; orbit tracks are simplified catalog shapes."
          : "Orbits measured, phases seeded, appearance inferred.",
        summary: solar
          ? "Every planet in our Solar System, placed on its measured orbit and turning on its own clock. Select a world to cross the system, or the Sun at the centre to stand at our star."
          : `Every confirmed world of ${hostStar}, on the orbit the archive measured for it and turning at its own measured period. Select a world to travel to it, or the star at the centre to stand at the star itself.`,
        tags: [],
        tagsLabel: "System classification",
        tone: "region",
      }}
      light={starLight(solar ? null : hostTemperature)}
      loading={{ title: hostStar }}
      panel={panel}
      sceneState={sceneState}
      travelPhase={travelPhase}
    />
  );
};
