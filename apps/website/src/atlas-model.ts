import type { PlanetPopulation } from "@exora/contracts";

/*
 * THE ATLAS MODEL
 *
 * Everything the atlas draws is decided here, away from the canvas: which archive rows can sit on
 * a given pair of axes, how the discovery methods fold into four validated colours, where each
 * world lands, and which one is nearest the pointer. The component only paints the result.
 *
 * A value the archive estimated rather than measured is left off its axis by default: the
 * mass–radius relation the archive uses to fill gaps draws its own artificial curve through the
 * period–radius plane, and plotting it as data would invent structure. Opting in draws those
 * worlds hollow so they never pass for measurements.
 */

export const POPULATION_FLAGS = { massEstimated: 4, massMinimum: 2, radiusEstimated: 1 } as const;

export type MethodGroup = "microlensing" | "other" | "radial-velocity" | "transit";

/** Fixed order: the colour follows the method, never its rank or what is currently shown. */
export const METHOD_GROUPS: readonly {
  color: string;
  id: MethodGroup;
  label: string;
}[] = [
  { color: "#3987e5", id: "transit", label: "Transit" },
  { color: "#c98500", id: "radial-velocity", label: "Radial velocity" },
  { color: "#d55181", id: "microlensing", label: "Microlensing" },
  { color: "#74838a", id: "other", label: "Imaging & other" },
];

const methodGroup = (method: string): MethodGroup =>
  method === "Transit"
    ? "transit"
    : method === "Radial Velocity"
      ? "radial-velocity"
      : method === "Microlensing"
        ? "microlensing"
        : "other";

export interface AtlasWorld {
  distanceParsecs: number | null;
  equilibriumTemperatureKelvin: number | null;
  flags: number;
  group: MethodGroup;
  massEarth: number | null;
  method: string;
  name: string;
  periodDays: number | null;
  radiusEarth: number | null;
  year: number | null;
}

export const decodePopulation = ({ methods, rows }: PlanetPopulation): AtlasWorld[] =>
  rows.map(
    ([name, periodDays, radiusEarth, massEarth, temperature, distance, year, index, flags]) => {
      const method = methods[index] ?? "Unknown";
      return {
        distanceParsecs: distance,
        equilibriumTemperatureKelvin: temperature,
        flags,
        group: methodGroup(method),
        massEarth,
        method,
        name,
        periodDays,
        radiusEarth,
        year,
      };
    },
  );

export type AtlasView = "mass" | "radius";

export interface AtlasAxis {
  domain: readonly [number, number];
  label: string;
  reference: readonly { label: string; value: number }[];
  ticks: readonly number[];
  unit: string;
}

export const ATLAS_AXES: Record<"period" | AtlasView, AtlasAxis> = {
  mass: {
    domain: [0.05, 20_000],
    label: "Mass",
    reference: [
      { label: "Earth", value: 1 },
      { label: "Jupiter", value: 317.8 },
    ],
    ticks: [0.1, 1, 10, 100, 1_000, 10_000],
    unit: "M⊕",
  },
  period: {
    domain: [0.1, 1_000_000],
    label: "Orbital period",
    reference: [{ label: "Earth's year", value: 365.25 }],
    ticks: [0.1, 1, 10, 100, 1_000, 10_000, 100_000, 1_000_000],
    unit: "days",
  },
  radius: {
    domain: [0.3, 30],
    label: "Radius",
    reference: [
      { label: "Earth", value: 1 },
      { label: "Neptune", value: 3.88 },
      { label: "Jupiter", value: 11.21 },
    ],
    ticks: [0.5, 1, 2, 5, 10, 20],
    unit: "R⊕",
  },
};

export interface PlottedWorld {
  estimated: boolean;
  index: number;
  x: number;
  y: number;
}

/** Maps a positive value onto [0, 1] across a log-scaled domain. */
export const logPosition = (value: number, [low, high]: readonly [number, number]): number =>
  (Math.log10(value) - Math.log10(low)) / (Math.log10(high) - Math.log10(low));

const estimatedFor = (world: AtlasWorld, view: AtlasView): boolean =>
  view === "radius"
    ? (world.flags & POPULATION_FLAGS.radiusEstimated) !== 0
    : (world.flags & POPULATION_FLAGS.massEstimated) !== 0;

/**
 * The worlds that can stand on this pair of axes, in unit coordinates (y up), drawn in method order
 * so the rarer methods paint over the transit survey rather than under it.
 */
export const plotWorlds = (
  worlds: readonly AtlasWorld[],
  view: AtlasView,
  { hidden, includeEstimates }: { hidden: ReadonlySet<MethodGroup>; includeEstimates: boolean },
): PlottedWorld[] => {
  const plotted: PlottedWorld[] = [];
  const period = ATLAS_AXES.period.domain;
  const vertical = ATLAS_AXES[view].domain;
  worlds.forEach((world, index) => {
    if (hidden.has(world.group)) return;
    const value = view === "radius" ? world.radiusEarth : world.massEarth;
    if (world.periodDays === null || value === null) return;
    const estimated = estimatedFor(world, view);
    if (estimated && !includeEstimates) return;
    const x = logPosition(world.periodDays, period);
    const y = logPosition(value, vertical);
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    plotted.push({ estimated, index, x, y });
  });
  const order = new Map(METHOD_GROUPS.map((group, rank) => [group.id, rank]));
  return plotted.sort(
    (a, b) => order.get(worlds[a.index]!.group)! - order.get(worlds[b.index]!.group)!,
  );
};

/** A bucketed index so the pointer finds its nearest world without scanning six thousand. */
export const createNearestIndex = (points: readonly PlottedWorld[], cells = 48) => {
  const buckets = new Map<number, PlottedWorld[]>();
  const key = (column: number, row: number): number => row * cells + column;
  const cellOf = (value: number): number =>
    Math.min(cells - 1, Math.max(0, Math.floor(value * cells)));
  for (const point of points) {
    const bucketKey = key(cellOf(point.x), cellOf(point.y));
    const bucket = buckets.get(bucketKey);
    if (bucket) bucket.push(point);
    else buckets.set(bucketKey, [point]);
  }
  /** Nearest point to (x, y) in unit space within `radius`, scaled by the plot's aspect. */
  return (x: number, y: number, radius: number, aspect = 1): PlottedWorld | null => {
    const reach = Math.ceil(radius * cells) + 1;
    const column = cellOf(x);
    const row = cellOf(y);
    let best: PlottedWorld | null = null;
    let bestDistance = radius;
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        if (column + dx < 0 || column + dx >= cells) continue;
        for (const point of buckets.get(key(column + dx, row + dy)) ?? []) {
          const distance = Math.hypot((point.x - x) * aspect, point.y - y);
          if (distance < bestDistance) {
            best = point;
            bestDistance = distance;
          }
        }
      }
    }
    return best;
  };
};

export interface DiscoveryYear {
  counts: Record<MethodGroup, number>;
  total: number;
  year: number;
}

/** Confirmed worlds announced each year, split by method group, with empty years kept. */
export const discoveriesByYear = (worlds: readonly AtlasWorld[]): DiscoveryYear[] => {
  const years = worlds.map((world) => world.year).filter((year): year is number => year !== null);
  if (years.length === 0) return [];
  const first = Math.min(...years);
  const last = Math.max(...years);
  const table: DiscoveryYear[] = Array.from({ length: last - first + 1 }, (_, offset) => ({
    counts: { microlensing: 0, other: 0, "radial-velocity": 0, transit: 0 },
    total: 0,
    year: first + offset,
  }));
  for (const world of worlds) {
    if (world.year === null) continue;
    const entry = table[world.year - first]!;
    entry.counts[world.group] += 1;
    entry.total += 1;
  }
  return table;
};

export const countByGroup = (worlds: readonly AtlasWorld[]): Record<MethodGroup, number> => {
  const counts: Record<MethodGroup, number> = {
    microlensing: 0,
    other: 0,
    "radial-velocity": 0,
    transit: 0,
  };
  for (const world of worlds) counts[world.group] += 1;
  return counts;
};

/** Case- and punctuation-insensitive name matching for the atlas' find box. */
export const matchWorlds = (
  worlds: readonly AtlasWorld[],
  query: string,
  limit = 8,
): AtlasWorld[] => {
  const normalize = (value: string): string => value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  const needle = normalize(query);
  if (needle.length === 0) return [];
  const starts: AtlasWorld[] = [];
  const contains: AtlasWorld[] = [];
  for (const world of worlds) {
    const name = normalize(world.name);
    if (name.startsWith(needle)) starts.push(world);
    else if (name.includes(needle)) contains.push(world);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
};
