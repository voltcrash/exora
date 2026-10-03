import type { EphemerisResponse, ExoplanetProfile, StarProfile } from "@exora/contracts";
import { useEffect, useRef, useState } from "react";
import { loadSolarEphemeris, type SystemLoadResult } from "../api-client.ts";
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
import { isEphemerisDerivedAt } from "../solar-ephemeris.ts";
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
  const [ephemeris, setEphemeris] = useState<EphemerisResponse | null>(null);
  const [ephemerisRequest, setEphemerisRequest] = useState<"error" | "idle" | "loading">("idle");
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
  const voiceRef = useRef<OrbitVoice | null>(null);
  const worldRef = useRef<SystemWorld | null>(null);
  const starJumpRef = useRef(false);
  const ephemerisRef = useRef<EphemerisResponse | null>(null);
  const displayedAtRef = useRef(displayedAt);
  const requestSequence = useRef(0);
  const { cached, hostStar, planets } = result;
  const solar = planets.length > 0 && planets.every((planet) => planet.solarSystem);

  const activateEphemeris = async (epoch: Date): Promise<void> => {
    if (!solar || ephemerisRequest === "loading") return;
    const request = requestSequence.current + 1;
    requestSequence.current = request;
    setPlaying(false);
    setEphemerisRequest("loading");
    try {
      const response = await loadSolarEphemeris(
        epoch,
        planets.flatMap(({ solarSystem }) => (solarSystem ? [solarSystem.naifId] : [])),
      );
      if (requestSequence.current !== request) return;
      ephemerisRef.current = response;
      displayedAtRef.current = epoch;
      setEphemeris(response);
      setDisplayedAt(epoch);
      worldRef.current?.setEphemeris(response.data);
      worldRef.current?.setEphemerisTime(epoch);
      setEphemerisRequest("idle");
    } catch (error) {
      console.error(error);
      if (requestSequence.current === request) setEphemerisRequest("error");
    }
  };

  const useCatalogPositions = (): void => {
    requestSequence.current += 1;
    setPlaying(false);
    setEphemeris(null);
    ephemerisRef.current = null;
    setEphemerisRequest("idle");
    worldRef.current?.setEphemeris(null);
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

  const effectiveClockRate = clockRunning ? clockRate * clockDirection : 0;
  useEffect(() => {
    worldRef.current?.setClockRate(effectiveClockRate);
  }, [effectiveClockRate, layout]);

  useEffect(() => {
    const world = worldRef.current;
    const voice = voiceRef.current;
    if (!listening || !layout || !world || !voice) return;
    const pitches = orbitPitches(layout.orbits.map((orbit) => orbit.elements.periodDays));
    const spread = layout.orbits.length > 1 ? 1.2 / (layout.orbits.length - 1) : 0;
    return world.onSightlineCrossing((index) => {
      const pitch = pitches[index];
      if (pitch !== null && pitch !== undefined) voice.pluck(pitch, -0.6 + index * spread);
    });
  }, [layout, listening]);

  useEffect(
    () => () => {
      voiceRef.current?.dispose();
      voiceRef.current = null;
    },
    [],
  );

  const toggleListening = (): void => {
    if (listening) {
      setListening(false);
      return;
    }
    voiceRef.current ??= createOrbitVoice();
    if (!voiceRef.current) {
      setAudioUnavailable(true);
      return;
    }
    setListening(true);
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
      setDisplayedAt((current) => {
        const requestedTime = current.getTime() + elapsed * playbackRate * playbackDirection;
        const minimum = Date.UTC(1900, 0, 1);
        const maximum = Date.UTC(2100, 11, 31, 23, 59, 59);
        const boundedTime = Math.min(maximum, Math.max(minimum, requestedTime));
        if (boundedTime !== requestedTime) setPlaying(false);
        const next = new Date(boundedTime);
        displayedAtRef.current = next;
        worldRef.current?.setEphemerisTime(next);
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [ephemeris, playbackDirection, playbackRate, playing]);

  useEffect(() => {
    if (!host) return;
    let abandoned = false;
    setSceneState("loading");

    void import("../system-scene.ts")
      .then(({ createSystemWorld }) =>
        host.mountWorld(() =>
          createSystemWorld(host, {
            hostName: hostStar,
            planets,
            onSelectHostStar: () => void openHostStar(),
            onSelectWorld: (planet) => onSelectPlanet(planet, cached),
            onFirstFrame: () => {
              if (!abandoned) setSceneState("ready");
            },
          }),
        ),
      )
      .then((world: SystemWorld | null) => {
        if (!world || abandoned) return;
        worldRef.current = world;
        if (ephemerisRef.current) {
          world.setEphemeris(ephemerisRef.current.data);
          world.setEphemerisTime(displayedAtRef.current);
        }
        setLayout(world.layout);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!abandoned) setSceneState("error");
      });

    return () => {
      abandoned = true;
      worldRef.current = null;
    };
  }, [cached, host, hostStar, onSelectHostStar, onSelectPlanet, onSelectStar, planets]);

  const drawn = layout?.orbits ?? [];
  const unplaced = layout?.unplaced ?? [];

  const positionMode =
    ephemerisRequest === "loading"
      ? "Asking JPL Horizons…"
      : ephemerisRequest === "error"
        ? "JPL Horizons could not be reached"
        : ephemeris?.meta.stale
          ? "JPL positions from an expired cache"
          : ephemeris?.meta.cached
            ? "JPL positions, cached on the server"
            : ephemeris
              ? "Fresh JPL positions"
              : "Simplified catalog orbits";

  const ephemerisControls = (
    <div className={styles["controls"]}>
      <p
        className={styles["state"]}
        data-live={ephemeris ? "true" : undefined}
        data-stale={ephemeris?.meta.stale ? "true" : undefined}
        role="status"
      >
        {positionMode}
      </p>
      <label className={styles["field"]}>
        <span>Local date and time</span>
        <input
          type="datetime-local"
          min="1900-01-01T00:00:00"
          max="2100-12-31T23:59:59"
          step="1"
          value={localDateTimeValue(displayedAt)}
          onChange={(event) => {
            const selected = new Date(event.currentTarget.value);
            if (!Number.isFinite(selected.getTime())) return;
            setPlaying(false);
            displayedAtRef.current = selected;
            setDisplayedAt(selected);
            worldRef.current?.setEphemerisTime(selected);
          }}
        />
      </label>
      <div className={styles["row"]}>
        <Button
          size="sm"
          disabled={ephemerisRequest === "loading"}
          onClick={() => void activateEphemeris(displayedAt)}
        >
          Use this date
        </Button>
        <Button
          size="sm"
          disabled={ephemerisRequest === "loading"}
          onClick={() => void activateEphemeris(new Date())}
        >
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
          ? isEphemerisDerivedAt(ephemeris.data, displayedAt)
            ? `Derived between lookups by two-body propagation from the ${new Date(ephemeris.meta.epoch).toISOString().replace(".000Z", "Z")} JPL anchor.`
            : `Measured state vectors · ${ephemeris.meta.coordinateFrame} frame · centred on ${ephemeris.meta.center}.`
          : "Catalog orbit shapes with seeded phases. This is not the configuration on any real date until JPL positions are applied."}
        {ephemeris?.meta.stale ? " Horizons was offline, so an expired cache was kept." : ""}
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
        disabled={Boolean(ephemeris) || audioUnavailable}
        aria-pressed={listening}
        onClick={toggleListening}
      >
        {listening ? "Stop listening" : "Listen to the orbits"}
      </Button>
      <p className={styles["note"]}>
        {audioUnavailable
          ? "This browser offers no Web Audio, so the orbits cannot be heard."
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
      ? `NASA/JPL Horizons API ${ephemeris.meta.sourceVersion} · ${ephemeris.meta.cached ? "server cache" : "fresh response"}`
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
      { label: "Positions", value: ephemeris ? "JPL" : "Catalog" },
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
                  ? isEphemerisDerivedAt(ephemeris.data, displayedAt)
                    ? "Playback is derived from the last JPL state-vector anchor; apply the shown time for a new authoritative solution."
                    : "Geometric heliocentric state vectors from the validated Horizons API response."
                  : "No catalog records where a world is on its orbit. Starting positions are seeded from each planet’s identifier.",
                label: "Orbital phase",
                ...(ephemeris ? { tone: "cyan" as const } : {}),
                value: ephemeris ? "JPL Horizons" : "Not measured",
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
          ? "Body positions from JPL Horizons; orbit tracks are simplified catalog shapes."
          : "Orbits measured, phases seeded, appearance inferred.",
        summary: solar
          ? "Every planet in our Solar System, placed on its measured orbit and turning on its own clock. Select a world to cross the system, or the Sun at the centre to stand at our star."
          : `Every confirmed world of ${hostStar}, on the orbit the archive measured for it and turning at its own measured period. Select a world to travel to it, or the star at the centre to stand at the star itself.`,
        tags: [
          "Orbital diorama",
          `${drawn.length} orbit${drawn.length === 1 ? "" : "s"} drawn`,
          solar ? "NASA/JPL" : "NASA Exoplanet Archive",
        ],
        tagsLabel: "System classification",
        tone: "region",
      }}
      light={starLight(solar ? null : hostTemperature)}
      loading={{ detail: `${hostStar} · measured orbital elements`, title: "Placing orbits" }}
      panel={panel}
      sceneState={sceneState}
      travelPhase={travelPhase}
    />
  );
};
