import type { EphemerisResponse, ExoplanetProfile, StarProfile } from "@exora/contracts";
import { useEffect, useRef, useState } from "react";
import { loadSolarEphemeris, type SystemLoadResult } from "../api-client.ts";
import { reachStar } from "../destination-cache.ts";
import {
  present,
  presentTabs,
  type DestinationPanelModel,
  type PanelBlock,
} from "../destination-panel.ts";
import { formatNumber } from "../planet-utils.tsx";
import type { SceneHost, XrStatus } from "../scene-host.ts";
import { isEphemerisDerivedAt } from "../solar-ephemeris.ts";
import {
  bodyScaleLabel,
  elementProvenance,
  orbitMappingLabel,
  timeScaleLabel,
  type SystemLayout,
} from "../system-layout.ts";
import type { SystemWorld } from "../system-scene.ts";
import type { TravelPhase } from "../travel-transition.ts";
import { DestinationIdentity } from "./DestinationIdentity.tsx";
import { DestinationPanel } from "./DestinationPanel.tsx";
import { MissionControl } from "./MissionControl.tsx";
import sharedStyles from "./ExperienceShared.module.css";
import hudStyles from "./DestinationHud.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles, hudStyles);

interface SystemExperienceProps {
  chromeHidden: boolean;
  host: SceneHost | null;
  onToggleChrome: () => void;
  onOpenDiscover: () => void;
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
  { label: "1×", secondsPerSecond: 1 },
  { label: "60×", secondsPerSecond: 60 },
  { label: "1 h/s", secondsPerSecond: 3_600 },
  { label: "1 d/s", secondsPerSecond: 86_400 },
] as const;

export const SystemExperience = ({
  chromeHidden,
  host,
  onToggleChrome,
  onOpenDiscover,
  onSelectHostStar,
  onSelectPlanet,
  onSelectStar,
  result,
  travelPhase,
}: SystemExperienceProps) => {
  const [fps, setFps] = useState("--");
  const [layout, setLayout] = useState<SystemLayout | null>(null);
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "error">("loading");
  const [xrStatus, setXrStatus] = useState<XrStatus>("checking");
  const [starJumpState, setStarJumpState] = useState<"error" | "idle" | "loading">("idle");
  const [ephemeris, setEphemeris] = useState<EphemerisResponse | null>(null);
  const [ephemerisRequest, setEphemerisRequest] = useState<"error" | "idle" | "loading">("idle");
  const [displayedAt, setDisplayedAt] = useState(() => new Date());
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(3_600);
  const [playbackDirection, setPlaybackDirection] = useState<1 | -1>(1);
  const worldRef = useRef<SystemWorld | null>(null);
  const starJumpRef = useRef(false);
  const ephemerisRef = useRef<EphemerisResponse | null>(null);
  const displayedAtRef = useRef(displayedAt);
  const requestSequence = useRef(0);
  const { cached, hostStar, planets } = result;
  const solar = planets.length > 0 && planets.every((planet) => planet.solarSystem);
  const travelling = travelPhase === "departing" || travelPhase === "crossing";
  const settled = sceneState !== "loading" || travelPhase !== "idle";

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

  useEffect(() => host?.onXrStatus(setXrStatus), [host]);

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
    const fpsTimer = window.setInterval(() => setFps(Math.round(host.getFps()).toString()), 1_000);
    return () => window.clearInterval(fpsTimer);
  }, [host]);

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
      ? "CONTACTING JPL…"
      : ephemerisRequest === "error"
        ? "JPL UNAVAILABLE"
        : ephemeris?.meta.stale
          ? "STALE CACHE"
          : ephemeris?.meta.cached
            ? "SERVER-CACHED JPL"
            : ephemeris
              ? "FRESH JPL VECTOR"
              : "SIMPLIFIED CATALOG";

  const ephemerisControls = (
    <div className={cx("ephemeris")}>
      <p
        className={cx("ephemeris-state")}
        data-stale={ephemeris?.meta.stale ? "true" : undefined}
        role="status"
      >
        {positionMode}
      </p>
      <label>
        <span>LOCAL DATE &amp; TIME</span>
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
      <div className={cx("ephemeris-row")}>
        <button
          type="button"
          disabled={ephemerisRequest === "loading"}
          onClick={() => void activateEphemeris(displayedAt)}
        >
          APPLY JPL
        </button>
        <button
          type="button"
          disabled={ephemerisRequest === "loading"}
          onClick={() => void activateEphemeris(new Date())}
        >
          NOW
        </button>
      </div>
      <div className={cx("ephemeris-row ephemeris-row-three")} aria-label="Ephemeris playback">
        <button
          type="button"
          disabled={!ephemeris}
          aria-pressed={playing && playbackDirection === 1}
          onClick={() => {
            setPlaybackDirection(1);
            setPlaying(true);
          }}
        >
          ▶ PLAY
        </button>
        <button type="button" disabled={!ephemeris || !playing} onClick={() => setPlaying(false)}>
          ‖ PAUSE
        </button>
        <button
          type="button"
          disabled={!ephemeris}
          aria-pressed={playing && playbackDirection === -1}
          onClick={() => {
            setPlaybackDirection(-1);
            setPlaying(true);
          }}
        >
          ◀ REVERSE
        </button>
      </div>
      <label>
        <span>RATE</span>
        <select
          value={playbackRate}
          onChange={(event) => setPlaybackRate(Number(event.currentTarget.value))}
        >
          {PLAYBACK_RATES.map((rate) => (
            <option key={rate.secondsPerSecond} value={rate.secondsPerSecond}>
              {rate.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" disabled={!ephemeris} onClick={useCatalogPositions}>
        CATALOG ORBITS
      </button>
      <p className={cx("panel-status")}>
        {ephemeris
          ? isEphemerisDerivedAt(ephemeris.data, displayedAt)
            ? `DERIVED BETWEEN LOOKUPS · TWO-BODY PROPAGATION FROM ${new Date(ephemeris.meta.epoch).toISOString().replace(".000Z", "Z")} JPL ANCHOR`
            : `MEASURED STATE VECTORS · ${ephemeris.meta.coordinateFrame.toUpperCase()} · CENTER ${ephemeris.meta.center.toUpperCase()}`
          : "CATALOG ORBIT SHAPES · SEEDED PHASES · NOT A DATE-SOLVED CONFIGURATION"}
        {ephemeris?.meta.stale ? " · HORIZONS WAS OFFLINE; EXPIRED CACHE RETAINED" : ""}
      </p>
    </div>
  );

  const worldBlocks: readonly PanelBlock[] = present<PanelBlock>([
    sceneState === "loading" && { text: "PLACING ORBITS…", type: "status" as const },
    drawn.length > 0 && {
      bodies: drawn.map((orbit) => ({
        id: orbit.planet.id,
        kind: orbit.planet.kind,
        meta: `${formatNumber(orbit.elements.semiMajorAxisAu, 3)} AU · ${
          orbit.elements.periodDays === null
            ? "UNTIMED"
            : `${formatNumber(orbit.elements.periodDays, 1)} d`
        } · ${elementProvenance(orbit.elements)}`,
        name: orbit.planet.name,
        onSelect: () => onSelectPlanet(orbit.planet, cached),
      })),
      label: "WORLDS IN THE DIORAMA",
      type: "bodies" as const,
    },
    unplaced.length > 0 && {
      text: `NOT PLACED · ${unplaced.map(({ name }) => name).join(", ")} · NO MEASURED ORBIT SIZE AND NO PERIOD TO DERIVE ONE FROM`,
      tone: "accent" as const,
      type: "status" as const,
    },
  ]);

  const panel: DestinationPanelModel = {
    footer: ephemeris
      ? `NASA/JPL Horizons API ${ephemeris.meta.sourceVersion} · ${ephemeris.meta.cached ? "SERVER CACHE" : "FRESH RESPONSE"}`
      : `NASA Exoplanet Archive · pscomppars · ${result.planets[0]?.source.retrievedOn ?? "unsynchronized"}`,
    label: "System layout and observed data",
    links: [
      {
        action: starJumpState === "loading" ? "RESOLVING…" : "STAND AT THE STAR ↗",
        disabled: starJumpState === "loading",
        ...(starJumpState === "error" ? { error: "SIMBAD could not resolve this host name." } : {}),
        glyph: "☀",
        id: "host-star",
        onSelect: () => void openHostStar(),
        title: hostStar,
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
      { label: "Positions", value: ephemeris ? "JPL" : "CATALOG" },
    ],
    source: "DIORAMA SCALE",
    tabs: presentTabs([
      { blocks: worldBlocks, count: drawn.length, id: "worlds", label: "Worlds" },
      solar && {
        blocks: [{ content: ephemerisControls, label: "LIVE EPHEMERIS", type: "custom" as const }],
        id: "time",
        label: "Time",
      },
      {
        blocks: [
          {
            facts: [
              { label: "Orbit radii", value: layout ? orbitMappingLabel(layout) : "—" },
              { label: "Body radii", value: layout ? bodyScaleLabel(layout) : "—" },
              { label: "Clock", value: layout ? timeScaleLabel(layout) : "—" },
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
            ],
            type: "facts" as const,
          },
          {
            text: "RADII ARE LOGARITHMIC, NOT LINEAR. BODIES ARE DRAWN FAR LARGER THAN THEIR ORBITS TO SCALE.",
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

  return (
    <div
      className={cx(
        `experience-shell system-experience ${settled ? "scene-ready" : ""} ${sceneState === "error" ? "scene-error" : ""} ${travelling ? "travelling" : ""} ${chromeHidden ? "chrome-hidden" : ""}`,
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
          category={solar ? "HOME SYSTEM" : "CONFIRMED SYSTEM"}
          classification={`${planets.length} KNOWN WORLD${planets.length === 1 ? "" : "S"}`}
          name={hostStar}
          nameId="system-name"
          note={
            ephemeris
              ? "BODY POSITIONS: JPL HORIZONS · ORBIT TRACKS: SIMPLIFIED CATALOG"
              : "ORBITS MEASURED · PHASES SEEDED · APPEARANCE INFERRED"
          }
          summary={
            solar
              ? "Every planet in our Solar System, placed on its measured orbit and turning on its own clock. Select a world to cross the system, or the Sun at the centre to stand at our star."
              : `Every confirmed world of ${hostStar}, on the orbit the archive measured for it and turning at its own measured period. Select a world to travel to it, or the star at the centre to stand at the star itself.`
          }
          tags={[
            "ORBITAL DIORAMA",
            `${drawn.length} ORBIT${drawn.length === 1 ? "" : "S"} DRAWN`,
            solar ? "NASA/JPL" : "NASA ARCHIVE",
          ]}
          tagsLabel="System classification"
          tone="region"
        />

        <DestinationPanel fps={fps} model={panel} />
      </main>

      <MissionControl
        chromeHidden={chromeHidden}
        hints={[
          { key: "DRAG", meaning: "ORBIT" },
          { key: "SCROLL", meaning: "ZOOM" },
          { key: "CLICK", meaning: "TRAVEL" },
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
        <p>PLACING ORBITS</p>
        <small>{hostStar.toUpperCase()} · MEASURED ORBITAL ELEMENTS</small>
      </div>
    </div>
  );
};
