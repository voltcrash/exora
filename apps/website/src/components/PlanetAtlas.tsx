import type { ExoplanetProfile } from "@exora/contracts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { loadPlanetByName, loadPlanetPopulation } from "../api-client.ts";
import {
  ATLAS_AXES,
  countByGroup,
  createNearestIndex,
  decodePopulation,
  discoveriesByYear,
  logPosition,
  matchWorlds,
  METHOD_GROUPS,
  plotWorlds,
  POPULATION_FLAGS,
  type AtlasView,
  type AtlasWorld,
  type MethodGroup,
  type PlottedWorld,
} from "../atlas-model.ts";
import { hasRenderer } from "../planet-utils.tsx";
import { useTabList } from "../use-tab-list.ts";
import styles from "./PlanetAtlas.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(styles);

type AtlasTab = AtlasView | "years";

const TABS: readonly { id: AtlasTab; label: string }[] = [
  { id: "radius", label: "Size & orbit" },
  { id: "mass", label: "Mass & orbit" },
  { id: "years", label: "Discoveries by year" },
];

// NASA planetary fact sheet: orbital period in days, radius and mass in Earth units.
const SOLAR_SYSTEM = [
  { label: "Me", mass: 0.0553, name: "Mercury", period: 88, radius: 0.383 },
  { label: "V", mass: 0.815, name: "Venus", period: 224.7, radius: 0.949 },
  { label: "E", mass: 1, name: "Earth", period: 365.25, radius: 1 },
  { label: "Ma", mass: 0.107, name: "Mars", period: 687, radius: 0.532 },
  { label: "J", mass: 317.8, name: "Jupiter", period: 4_333, radius: 11.21 },
  { label: "S", mass: 95.2, name: "Saturn", period: 10_759, radius: 9.45 },
  { label: "U", mass: 14.5, name: "Uranus", period: 30_687, radius: 4.01 },
  { label: "N", mass: 17.1, name: "Neptune", period: 60_190, radius: 3.88 },
] as const;

const PLOT_MARGIN = { bottom: 34, left: 52, right: 18, top: 14 } as const;
const HIT_RADIUS_PX = 14;

const figures = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });
const whole = new Intl.NumberFormat("en");

const tickLabel = (value: number): string =>
  value >= 1_000_000
    ? `${String(value / 1_000_000)}M`
    : value >= 1_000
      ? `${String(value / 1_000)}k`
      : String(value);

const colorOf = (group: MethodGroup): string =>
  METHOD_GROUPS.find((entry) => entry.id === group)?.color ?? "#74838a";

let populationRequest: Promise<AtlasWorld[]> | null = null;
const population = (): Promise<AtlasWorld[]> => {
  populationRequest ??= loadPlanetPopulation()
    .then(({ data }) => decodePopulation(data))
    .catch((error: unknown) => {
      populationRequest = null;
      throw error;
    });
  return populationRequest;
};

const describeWorld = (world: AtlasWorld): string =>
  [
    world.periodDays === null ? null : `P ${figures.format(world.periodDays)} d`,
    world.radiusEarth === null
      ? null
      : `${world.flags & POPULATION_FLAGS.radiusEstimated ? "~" : ""}${figures.format(world.radiusEarth)} R⊕`,
    world.massEarth === null
      ? null
      : `${world.flags & POPULATION_FLAGS.massMinimum ? "≥" : world.flags & POPULATION_FLAGS.massEstimated ? "~" : ""}${figures.format(world.massEarth)} M⊕`,
    world.equilibriumTemperatureKelvin === null
      ? null
      : `${whole.format(world.equilibriumTemperatureKelvin)} K`,
  ]
    .filter(Boolean)
    .join(" · ");

interface Size {
  height: number;
  width: number;
}

const useElementSize = (element: HTMLElement | null): Size => {
  const [size, setSize] = useState<Size>({ height: 0, width: 0 });
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ height: entry.contentRect.height, width: entry.contentRect.width });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
};

const Scatter = ({
  onTravel,
  plotted,
  query,
  view,
  worlds,
}: {
  onTravel: (world: AtlasWorld) => void;
  plotted: readonly PlottedWorld[];
  query: ReadonlySet<number>;
  view: AtlasView;
  worlds: readonly AtlasWorld[];
}) => {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { height, width } = useElementSize(frame);
  const [hovered, setHovered] = useState<PlottedWorld | null>(null);
  const plotWidth = Math.max(width - PLOT_MARGIN.left - PLOT_MARGIN.right, 1);
  const plotHeight = Math.max(height - PLOT_MARGIN.top - PLOT_MARGIN.bottom, 1);
  const nearest = useMemo(() => createNearestIndex(plotted), [plotted]);
  const vertical = ATLAS_AXES[view];
  const horizontal = ATLAS_AXES.period;
  const px = (unit: number): number => PLOT_MARGIN.left + unit * plotWidth;
  const py = (unit: number): number => PLOT_MARGIN.top + (1 - unit) * plotHeight;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const searching = query.size > 0;
    for (const point of plotted) {
      const world = worlds[point.index]!;
      const x = PLOT_MARGIN.left + point.x * plotWidth;
      const y = PLOT_MARGIN.top + (1 - point.y) * plotHeight;
      context.globalAlpha = searching && !query.has(point.index) ? 0.12 : 0.78;
      context.beginPath();
      context.arc(x, y, 2.3, 0, Math.PI * 2);
      if (point.estimated) {
        context.strokeStyle = colorOf(world.group);
        context.lineWidth = 1;
        context.stroke();
      } else {
        context.fillStyle = colorOf(world.group);
        context.fill();
      }
    }
    context.globalAlpha = 1;
  }, [height, plotHeight, plotWidth, plotted, query, width, worlds]);

  const locate = (event: ReactMouseEvent<HTMLDivElement>): PlottedWorld | null => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left - PLOT_MARGIN.left) / plotWidth;
    const y = 1 - (event.clientY - bounds.top - PLOT_MARGIN.top) / plotHeight;
    return nearest(x, y, HIT_RADIUS_PX / plotHeight, plotWidth / plotHeight);
  };

  const hoveredWorld = hovered ? worlds[hovered.index] : null;
  const tooltipLeft = hovered ? px(hovered.x) : 0;
  const tooltipTop = hovered ? py(hovered.y) : 0;

  return (
    <div
      ref={setFrame}
      className={cx("atlas-plot")}
      data-hovering={hovered !== null}
      onPointerLeave={() => setHovered(null)}
      onPointerMove={(event) => setHovered(locate(event))}
      onClick={(event) => {
        const target = locate(event);
        if (target) onTravel(worlds[target.index]!);
      }}
    >
      <canvas
        ref={canvasRef}
        className={cx("atlas-canvas")}
        role="img"
        aria-label={`${whole.format(plotted.length)} confirmed worlds plotted by orbital period and ${vertical.label.toLowerCase()}. Use the find box to reach a world by name.`}
      />
      <svg className={cx("atlas-axes")} width={width} height={height} aria-hidden="true">
        {horizontal.ticks.map((tick) => {
          const x = px(logPosition(tick, horizontal.domain));
          return (
            <g key={`x-${String(tick)}`}>
              <line
                className={cx("atlas-grid")}
                x1={x}
                x2={x}
                y1={PLOT_MARGIN.top}
                y2={PLOT_MARGIN.top + plotHeight}
              />
              <text className={cx("atlas-tick")} x={x} y={height - 18} textAnchor="middle">
                {tickLabel(tick)}
              </text>
            </g>
          );
        })}
        {vertical.ticks.map((tick) => {
          const y = py(logPosition(tick, vertical.domain));
          return (
            <g key={`y-${String(tick)}`}>
              <line
                className={cx("atlas-grid")}
                x1={PLOT_MARGIN.left}
                x2={PLOT_MARGIN.left + plotWidth}
                y1={y}
                y2={y}
              />
              <text
                className={cx("atlas-tick")}
                x={PLOT_MARGIN.left - 8}
                y={y + 3}
                textAnchor="end"
              >
                {tickLabel(tick)}
              </text>
            </g>
          );
        })}
        {view === "radius" ? (
          <g>
            <rect
              className={cx("atlas-valley")}
              x={PLOT_MARGIN.left}
              width={px(logPosition(100, horizontal.domain)) - PLOT_MARGIN.left}
              y={py(logPosition(2, vertical.domain))}
              height={py(logPosition(1.5, vertical.domain)) - py(logPosition(2, vertical.domain))}
            />
            <text
              className={cx("atlas-note")}
              x={px(logPosition(100, horizontal.domain)) + 6}
              y={py(logPosition(1.73, vertical.domain)) + 3}
            >
              radius valley · Fulton et al. 2017
            </text>
          </g>
        ) : null}
        {SOLAR_SYSTEM.map((planet) => {
          const value = view === "radius" ? planet.radius : planet.mass;
          const x = px(logPosition(planet.period, horizontal.domain));
          const y = py(logPosition(value, vertical.domain));
          return (
            <g key={planet.name}>
              <circle className={cx("atlas-solar")} cx={x} cy={y} r={4} />
              <text className={cx("atlas-solar-label")} x={x + 7} y={y + 3}>
                {planet.label}
              </text>
            </g>
          );
        })}
        <text
          className={cx("atlas-axis-label")}
          x={PLOT_MARGIN.left + plotWidth / 2}
          y={height - 3}
          textAnchor="middle"
        >
          {horizontal.label} · {horizontal.unit} · log scale
        </text>
        <text
          className={cx("atlas-axis-label")}
          transform={`translate(12 ${String(PLOT_MARGIN.top + plotHeight / 2)}) rotate(-90)`}
          textAnchor="middle"
        >
          {vertical.label} · {vertical.unit} · log scale
        </text>
        {hovered ? (
          <circle className={cx("atlas-focus")} cx={px(hovered.x)} cy={py(hovered.y)} r={7} />
        ) : null}
      </svg>
      {hoveredWorld ? (
        <div
          className={cx("atlas-tooltip")}
          data-flip={tooltipLeft > width * 0.62}
          style={{ left: tooltipLeft, top: tooltipTop }}
        >
          <strong>{hoveredWorld.name}</strong>
          <span>{describeWorld(hoveredWorld)}</span>
          <small>
            <i style={{ background: colorOf(hoveredWorld.group) }} />
            {hoveredWorld.method}
            {hoveredWorld.year === null ? "" : ` · ${String(hoveredWorld.year)}`} · click to travel
          </small>
        </div>
      ) : null}
    </div>
  );
};

const YearChart = ({
  hidden,
  worlds,
}: {
  hidden: ReadonlySet<MethodGroup>;
  worlds: readonly AtlasWorld[];
}) => {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const { height, width } = useElementSize(frame);
  const [active, setActive] = useState<number | null>(null);
  const years = useMemo(() => discoveriesByYear(worlds), [worlds]);
  const groups = METHOD_GROUPS.filter((group) => !hidden.has(group.id));
  const totals = years.map((entry) =>
    groups.reduce((sum, group) => sum + entry.counts[group.id], 0),
  );
  const peak = Math.max(1, ...totals);
  const step = peak > 1_000 ? 500 : peak > 400 ? 200 : peak > 100 ? 50 : 20;
  const top = Math.ceil(peak / step) * step;
  const plotWidth = Math.max(width - PLOT_MARGIN.left - PLOT_MARGIN.right, 1);
  const plotHeight = Math.max(height - PLOT_MARGIN.top - PLOT_MARGIN.bottom, 1);
  const band = plotWidth / Math.max(years.length, 1);
  const barWidth = Math.min(24, Math.max(band - 2, 1));
  const y = (count: number): number => PLOT_MARGIN.top + plotHeight * (1 - count / top);
  const activeEntry = active === null ? null : years[active];

  return (
    <div
      ref={setFrame}
      className={cx("atlas-plot years")}
      data-hovering={active !== null}
      onPointerLeave={() => setActive(null)}
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const index = Math.floor((event.clientX - bounds.left - PLOT_MARGIN.left) / band);
        setActive(index >= 0 && index < years.length ? index : null);
      }}
    >
      <svg
        className={cx("atlas-axes")}
        width={width}
        height={height}
        role="img"
        aria-label="Confirmed planets announced each year, stacked by discovery method"
      >
        {Array.from({ length: top / step + 1 }, (_, index) => index * step).map((tick) => (
          <g key={`y-${String(tick)}`}>
            <line
              className={cx("atlas-grid")}
              x1={PLOT_MARGIN.left}
              x2={PLOT_MARGIN.left + plotWidth}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text
              className={cx("atlas-tick")}
              x={PLOT_MARGIN.left - 8}
              y={y(tick) + 3}
              textAnchor="end"
            >
              {whole.format(tick)}
            </text>
          </g>
        ))}
        {years.map((entry, index) => {
          const x = PLOT_MARGIN.left + index * band + (band - barWidth) / 2;
          let base = 0;
          return (
            <g key={entry.year} data-active={active === index}>
              {groups.map((group) => {
                const count = entry.counts[group.id];
                if (count === 0) return null;
                const bottom = y(base);
                base += count;
                const segmentTop = y(base);
                const segmentHeight = Math.max(bottom - segmentTop - 2, 0.5);
                return (
                  <rect
                    key={group.id}
                    className={cx("atlas-bar")}
                    x={x}
                    y={segmentTop}
                    width={barWidth}
                    height={segmentHeight}
                    rx={base === totals[index] ? 3 : 0}
                    fill={group.color}
                  />
                );
              })}
              {entry.year % 5 === 0 ? (
                <text
                  className={cx("atlas-tick")}
                  x={x + barWidth / 2}
                  y={height - 18}
                  textAnchor="middle"
                >
                  {entry.year}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {activeEntry ? (
        <div
          className={cx("atlas-tooltip")}
          data-flip={(active ?? 0) > years.length * 0.62}
          style={{
            left: PLOT_MARGIN.left + (active ?? 0) * band + band / 2,
            top: y(totals[active ?? 0] ?? 0),
          }}
        >
          <strong>
            {activeEntry.year} · {whole.format(totals[active ?? 0] ?? 0)} worlds
          </strong>
          {groups.map((group) => (
            <small key={group.id}>
              <i style={{ background: group.color }} />
              {whole.format(activeEntry.counts[group.id])} {group.label.toLowerCase()}
            </small>
          ))}
        </div>
      ) : null}
      <table className={cx("visually-hidden")}>
        <caption>Confirmed planets announced per year</caption>
        <tbody>
          {years
            .filter((entry) => entry.total > 0)
            .map((entry) => (
              <tr key={entry.year}>
                <th scope="row">{entry.year}</th>
                <td>{entry.total}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
};

interface PlanetAtlasProps {
  onSelect: (planet: ExoplanetProfile, cached: boolean) => void;
}

/*
 * EVERY CONFIRMED WORLD AT ONCE
 *
 * The catalogues answer "show me this one"; the atlas answers "where does it sit". Six thousand
 * worlds on the planes astronomers read the population from — period against size, where the hot
 * Jupiters pile up and the radius valley opens; period against mass, the radial-velocity survey's
 * own view — and the year-by-year arrival of each method. The Solar System's planets are placed on
 * the same axes, which is the quickest way to see how unlike ours the known systems are.
 */
export const PlanetAtlas = ({ onSelect }: PlanetAtlasProps) => {
  const [worlds, setWorlds] = useState<AtlasWorld[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<AtlasTab>("radius");
  const [hidden, setHidden] = useState<ReadonlySet<MethodGroup>>(new Set());
  const [includeEstimates, setIncludeEstimates] = useState(false);
  const [search, setSearch] = useState("");
  const [travel, setTravel] = useState<{ error: boolean; name: string } | null>(null);
  const tabList = useTabList({
    label: "Atlas views",
    list: "atlas",
    onSelect: setTab,
    value: tab,
    values: TABS.map(({ id }) => id),
  });

  useEffect(() => {
    let active = true;
    population()
      .then((loaded) => {
        if (active) setWorlds(loaded);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const view: AtlasView = tab === "mass" ? "mass" : "radius";
  const plotted = useMemo(
    () => (worlds ? plotWorlds(worlds, view, { hidden, includeEstimates }) : []),
    [hidden, includeEstimates, view, worlds],
  );
  const counts = useMemo(() => (worlds ? countByGroup(worlds) : null), [worlds]);
  const matches = useMemo(() => (worlds ? matchWorlds(worlds, search) : []), [search, worlds]);
  const matchIndexes = useMemo(() => {
    if (!worlds || matches.length === 0) return new Set<number>();
    const names = new Set(matches.map((world) => world.name));
    return new Set(worlds.flatMap((world, index) => (names.has(world.name) ? [index] : [])));
  }, [matches, worlds]);

  const travelTo = async (world: AtlasWorld): Promise<void> => {
    setTravel({ error: false, name: world.name });
    const result = await loadPlanetByName(world.name).catch(() => null);
    if (result && hasRenderer(result.planet)) {
      onSelect(result.planet, result.cached);
      return;
    }
    setTravel({ error: true, name: world.name });
  };

  const toggleGroup = (group: MethodGroup): void =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  const onFind = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const [first] = matches;
    if (first) void travelTo(first);
  };

  return (
    <section className={cx("atlas")} aria-labelledby="atlas-heading">
      <h2 className={cx("visually-hidden")} id="atlas-heading">
        Exoplanet atlas
      </h2>

      <div className={cx("atlas-toolbar")}>
        <div className={cx("atlas-tabs")} {...tabList.tabListProps}>
          {TABS.map(({ id, label }) => (
            <button key={id} {...tabList.tabProps(id)} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <form className={cx("atlas-find")} role="search" onSubmit={onFind}>
          <input
            type="search"
            value={search}
            placeholder="Find a world in the atlas"
            aria-label="Find a world in the atlas"
            onChange={(event) => setSearch(event.target.value)}
          />
        </form>
      </div>

      {matches.length > 0 ? (
        <ul className={cx("atlas-matches")} aria-label="Atlas matches">
          {matches.map((world) => (
            <li key={world.name}>
              <button type="button" onClick={() => void travelTo(world)}>
                <i style={{ background: colorOf(world.group) }} aria-hidden="true" />
                <strong>{world.name}</strong>
                <small>{describeWorld(world)}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={cx("atlas-legend")} role="group" aria-label="Discovery methods shown">
        {METHOD_GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            aria-pressed={!hidden.has(group.id)}
            onClick={() => toggleGroup(group.id)}
          >
            <i style={{ background: group.color }} aria-hidden="true" />
            <span>{group.label}</span>
            <small>{counts ? whole.format(counts[group.id]) : "—"}</small>
          </button>
        ))}
        {tab !== "years" ? (
          <label className={cx("atlas-estimates")}>
            <input
              type="checkbox"
              checked={includeEstimates}
              onChange={(event) => setIncludeEstimates(event.target.checked)}
            />
            <span>Include archive estimates · drawn hollow</span>
          </label>
        ) : null}
      </div>

      <div className={cx("atlas-stage")} {...tabList.panelProps(tab)}>
        {failed ? (
          <p className={cx("atlas-status")} role="status">
            The NASA Exoplanet Archive could not be reached. The atlas needs the whole catalogue, so
            try again in a moment.
          </p>
        ) : !worlds ? (
          <p className={cx("atlas-status")} role="status">
            Reading every confirmed world from the NASA Exoplanet Archive…
          </p>
        ) : tab === "years" ? (
          <YearChart hidden={hidden} worlds={worlds} />
        ) : (
          <Scatter
            onTravel={(world) => void travelTo(world)}
            plotted={plotted}
            query={matchIndexes}
            view={view}
            worlds={worlds}
          />
        )}
      </div>

      <p className={cx("atlas-caption")} role="status">
        {travel
          ? travel.error
            ? `${travel.name} could not be opened. Its archive record may lack the size needed to render it.`
            : `Travelling to ${travel.name}…`
          : worlds
            ? tab === "years"
              ? `${whole.format(worlds.length)} confirmed worlds by the year they were announced.`
              : `${whole.format(plotted.length)} of ${whole.format(worlds.length)} worlds have a measured period and ${view === "radius" ? "radius" : "mass"}${includeEstimates ? " or an archive estimate" : ""}. ${view === "mass" ? "Radial-velocity masses are minimums (M sin i). " : ""}Lettered rings are the Solar System's planets.`
            : ""}
      </p>
    </section>
  );
};
