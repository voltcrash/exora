/**
 * Discover, rebuilt for the headset.
 *
 * The browser's Discover screen is the one place the whole archive is reachable from: a rail of
 * five destinations — the Solar System, the NASA exoplanet archive, the SIMBAD stellar catalog,
 * the black-hole atlas and the world forge — over a workspace that fills the window. None of it
 * survives an immersive session, because a session paints only the Babylon scene.
 *
 * So it is rebuilt here on one full-screen holographic plane, with the same rail, the same five
 * destinations, the same section copy and the same journeys: browse shelves and collections, type
 * a query on an in-world keyboard, forge a world or a star, and travel to any of it without
 * taking the headset off. A sixth rail entry carries what only exists inside a session — the
 * scene's own actions, its readout, and the way out — because those have nowhere else to live
 * once the flat page's controls are gone.
 */

import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import {
  generateCustomStar,
  generateCustomWorld,
  type CustomPlanetParameters,
  type CustomStar,
  type CustomStarParameters,
  type CustomWorld,
} from "@exora/worldgen";
import type { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  discoverPlanets,
  discoverRandomPlanet,
  discoverRandomStar,
  discoverStars,
  searchPlanets,
  searchStars,
} from "./api-client.ts";
import { BLACK_HOLES, type BlackHoleProfile } from "./black-holes.ts";
import { hasRenderer } from "./planet-utils.tsx";
import { SOLAR_SYSTEM_ASTEROIDS, type AsteroidProfile } from "./solar-asteroids.ts";
import { SOLAR_SYSTEM_COMETS, type CometProfile } from "./solar-comets.ts";
import { SOLAR_SYSTEM_MISSIONS, type SolarMissionProfile } from "./solar-missions.ts";
import { SOLAR_SYSTEM_REGIONS, type SolarRegionProfile } from "./solar-regions.ts";
import {
  SOLAR_SYSTEM_DWARF_MOONS,
  SOLAR_SYSTEM_DWARF_PLANETS,
  SOLAR_SYSTEM_MOONS,
  SOLAR_SYSTEM_PLANETS,
  SUN,
} from "./solar-system.ts";
import { createXrPanel, type XrPanel } from "./xr-panel.ts";
import {
  homeActionCapacity,
  rowCapacity,
  type XrBlock,
  type XrCell,
  type XrPanelView,
  type XrRailItem,
} from "./xr-panel-layout.ts";
import {
  adjustPlanetField,
  adjustStarField,
  applyKeyStroke,
  asteroidCellDetail,
  blackHoleCellDetail,
  cometCellDetail,
  cycle,
  forgePlanetKindLabel,
  forgeSeed,
  forgeStarKindLabel,
  KEYBOARD_ROWS,
  missionCellDetail,
  paginate,
  planetCellDetail,
  PLANET_CATEGORIES,
  PLANET_COLLECTIONS,
  PLANET_FORGE_FIELDS,
  PLANET_FORGE_KINDS,
  regionCellDetail,
  SOLAR_SHELVES,
  solarWorldDetail,
  starCellDetail,
  STAR_CATEGORIES,
  STAR_COLLECTIONS,
  STAR_FORGE_FIELDS,
  STAR_FORGE_KINDS,
  type SolarShelf,
  type XrCatalogEntry,
} from "./xr-console-model.ts";

export interface XrConsoleFact {
  label: string;
  value: string;
}

/** What the owning scene contributes: its identity, its readout, and its own quick actions. */
export interface XrConsoleHost {
  facts: () => readonly XrConsoleFact[];
  onExit: () => void;
  onForgePlanet?: (world: CustomWorld) => void;
  onForgeStar?: (star: CustomStar) => void;
  onTravelAsteroid?: (asteroid: AsteroidProfile) => void;
  onTravelBlackHole?: (blackHole: BlackHoleProfile) => void;
  onTravelComet?: (comet: CometProfile) => void;
  onTravelMission?: (mission: SolarMissionProfile) => void;
  onTravelPlanet?: (planet: ExoplanetProfile) => void;
  onTravelRegion?: (region: SolarRegionProfile) => void;
  onTravelStar?: (star: StarProfile) => void;
  sceneActions: () => readonly XrCell[];
  source: () => string;
  subtitle: () => string;
  summary: () => string;
  title: () => string;
}

export interface XrConsole {
  attach: (xr: WebXRDefaultExperience) => void;
  dispose: () => void;
  /** Brings an open console back within reach after the scene has moved the wearer. */
  recall: () => void;
  /** Repaints from the host's current state, used when the scene's own entries change. */
  refresh: () => void;
  setVisible: (visible: boolean) => void;
  update: (deltaSeconds: number) => void;
}

type DiscoverSection = "black-holes" | "forge" | "solar" | "stars" | "view" | "worlds";
type CatalogTab = "categories" | "collections" | "search";
type ForgeTab = "build" | "shape";

/** Entries a result page can show, over two columns, once the tab strips and status line are in. */
const RESULT_ROWS = rowCapacity(64 + 18 + 64 + 18 + 44 + 18, 2) - 1;
/** Entries a Solar System shelf can show: one tab strip and a status line above them. */
const SOLAR_ROWS = rowCapacity(64 + 18 + 44 + 18, 2) - 1;
/** Scene entries the view page can carry and still leave room for the readout below them. */
const SCENE_ACTION_ROWS = homeActionCapacity();

const FOOTER_HINT = "TRIGGER SELECTS · A/X OPENS DISCOVER · B/Y CLOSES IT";

/** The rail, its copy and its accents, kept in step with the browser screen's own sections. */
const SECTIONS: readonly {
  accent: string;
  eyebrow: string;
  glyph: string;
  id: DiscoverSection;
  label: string;
  source: string;
  summary: string;
  title: string;
}[] = [
  {
    accent: "#ffc27a",
    eyebrow: "NASA / JPL home system",
    glyph: "☉",
    id: "solar",
    label: "Solar System",
    source: "NASA / JPL",
    summary: "Measured bodies, mission targets, dynamic regions and exploration history.",
    title: "Start close to home.",
  },
  {
    accent: "#6fe3ff",
    eyebrow: "NASA exoplanet archive",
    glyph: "◎",
    id: "worlds",
    label: "Exoplanets",
    source: "NASA ARCHIVE",
    summary: "Search by name, explore curated collections, or browse by physics.",
    title: "Find another world.",
  },
  {
    accent: "#ffdf9b",
    eyebrow: "SIMBAD stellar archive",
    glyph: "✦",
    id: "stars",
    label: "Stars",
    source: "SIMBAD",
    summary: "Search the stellar catalog, browse distinct families, or take a surprise jump.",
    title: "Follow the light.",
  },
  {
    accent: "#c3a6ff",
    eyebrow: "NASA / EHT / ESA compact object atlas",
    glyph: "◉",
    id: "black-holes",
    label: "Black Holes",
    source: "NASA / EHT / ESA",
    summary: "Five observed systems, entered through disclosed, data-led visualizations.",
    title: "Follow the light to its edge.",
  },
  {
    accent: "#ff9d87",
    eyebrow: "Exora celestial synthesis",
    glyph: "+",
    id: "forge",
    label: "World Forge",
    source: "EXORA LABS",
    summary: "Build a world or star from first principles and launch it into the live renderer.",
    title: "Make the next discovery.",
  },
  {
    accent: "#8cffd6",
    eyebrow: "Observed properties",
    glyph: "◈",
    id: "view",
    label: "This View",
    source: "LIVE RENDERER",
    summary: "What is in front of you, how to move around it, and the way back out.",
    title: "Where you are.",
  },
];

const initialPlanetParameters: CustomPlanetParameters = {
  activity: 0.64,
  atmosphere: 0.58,
  axialTilt: 0.56,
  baseColor: [0.12, 0.54, 0.68],
  kind: "rocky",
  name: "Asteria",
  radius: 0.52,
  rings: false,
  rotation: 0.46,
  seed: 7_319,
  temperatureKelvin: 286,
  water: 0.56,
};

const initialStarParameters: CustomStarParameters = {
  activity: 0.68,
  kind: "main-sequence",
  name: "Solara",
  radius: 0.55,
  rotation: 0.42,
  seed: 42_017,
  temperatureKelvin: 5_772,
};

export const createXrConsole = (
  scene: Scene,
  host: XrConsoleHost,
  anisotropy?: number,
): XrConsole => {
  const panel: XrPanel = createXrPanel(scene, anisotropy);

  let section: DiscoverSection = "solar";
  let solarShelf: SolarShelf = "planets";
  let solarPage = 0;
  let catalogTab: CatalogTab = "collections";
  let forgeTab: ForgeTab = "build";
  let forgeMode: "planet" | "star" = "planet";
  let planetParameters = initialPlanetParameters;
  let starParameters = initialStarParameters;
  let keyboardTarget: "forge-name" | "search" | null = null;
  let query = "";
  let dirty = true;

  interface Listing {
    label: string;
    page: number;
    planets: readonly ExoplanetProfile[];
    stars: readonly StarProfile[];
    state: "error" | "loading" | "ready";
  }
  let listing: Listing | null = null;
  let requestToken = 0;
  let controller: AbortController | null = null;

  const render = (): void => {
    if (!panel.isVisible()) {
      dirty = true;
      return;
    }
    dirty = false;
    panel.setView(buildView());
  };

  const goTo = (next: DiscoverSection): void => {
    section = next;
    if (next !== "worlds" && next !== "stars") listing = null;
    keyboardTarget = null;
    render();
  };

  const cancelRequest = (): void => {
    controller?.abort();
    controller = null;
    requestToken += 1;
  };

  const startListing = (label: string): { signal: AbortSignal; token: number } => {
    cancelRequest();
    controller = new AbortController();
    requestToken += 1;
    listing = { label, page: 0, planets: [], stars: [], state: "loading" };
    render();
    return { signal: controller.signal, token: requestToken };
  };

  const loadPlanetListing = (
    label: string,
    load: (signal: AbortSignal) => Promise<{ planets: readonly ExoplanetProfile[] }>,
  ): void => {
    const { signal, token } = startListing(label);
    void load(signal)
      .then((result) => {
        if (token !== requestToken) return;
        listing = {
          label,
          page: 0,
          planets: result.planets.filter(hasRenderer),
          stars: [],
          state: "ready",
        };
        render();
      })
      .catch(() => {
        if (token !== requestToken) return;
        listing = { label, page: 0, planets: [], stars: [], state: "error" };
        render();
      });
  };

  const loadStarListing = (
    label: string,
    load: (signal: AbortSignal) => Promise<{ stars: readonly StarProfile[] }>,
  ): void => {
    const { signal, token } = startListing(label);
    void load(signal)
      .then((result) => {
        if (token !== requestToken) return;
        listing = { label, page: 0, planets: [], stars: result.stars, state: "ready" };
        render();
      })
      .catch(() => {
        if (token !== requestToken) return;
        listing = { label, page: 0, planets: [], stars: [], state: "error" };
        render();
      });
  };

  const surprise = (kind: "planet" | "star"): void => {
    const { token } = startListing(kind === "planet" ? "Surprise world" : "Surprise star");
    const request =
      kind === "planet"
        ? discoverRandomPlanet().then(({ planet }) => host.onTravelPlanet?.(planet))
        : discoverRandomStar().then(({ star }) => host.onTravelStar?.(star));
    void request.catch(() => {
      if (token !== requestToken) return;
      listing = {
        label: kind === "planet" ? "Surprise world" : "Surprise star",
        page: 0,
        planets: [],
        stars: [],
        state: "error",
      };
      render();
    });
  };

  const runSearch = (): void => {
    const trimmed = query.trim();
    if (!trimmed) return;
    keyboardTarget = null;
    if (section === "stars") {
      loadStarListing(`“${trimmed}”`, (signal) => searchStars(trimmed, { signal }));
      return;
    }
    loadPlanetListing(`“${trimmed}”`, (signal) => searchPlanets(trimmed, { signal }));
  };

  const rail = (): XrRailItem[] =>
    SECTIONS.map((entry, index) => ({
      accent: entry.accent,
      cell: {
        active: section === entry.id,
        id: `section-${entry.id}`,
        label: entry.label,
        onSelect: () => goTo(entry.id),
      },
      glyph: entry.glyph,
      index: `0${index + 1}`,
      source: entry.source,
    }));

  const catalogTabsBlock = (): XrBlock => ({
    cells: (
      [
        ["collections", "Collections"],
        ["categories", "Categories"],
        ["search", "Search"],
      ] as const
    ).map(([id, label]) => ({
      active: catalogTab === id && !listing,
      id: `catalog-${id}`,
      label,
      onSelect: () => {
        catalogTab = id;
        listing = null;
        keyboardTarget = id === "search" ? "search" : null;
        cancelRequest();
        render();
      },
    })),
    kind: "tabs",
  });

  const entryCells = (
    entries: readonly XrCatalogEntry[],
    onSelect: (entry: XrCatalogEntry) => void,
  ): XrCell[] =>
    entries.map((entry) => ({
      detail: entry.note,
      id: entry.id,
      label: entry.label,
      onSelect: () => onSelect(entry),
    }));

  const listingBlocks = (kind: "planet" | "star"): XrBlock[] => {
    if (!listing) return [];
    if (listing.state === "loading") {
      return [
        {
          kind: "status",
          text: `Scanning ${kind === "planet" ? "NASA" : "SIMBAD"} archive…`,
          tone: "primary",
        },
        { kind: "note", text: `${listing.label} · the archive is answering, this takes a moment.` },
      ];
    }
    if (listing.state === "error") {
      return [
        { kind: "status", text: "Archive unreachable", tone: "danger" },
        { kind: "note", text: "The catalog request failed. Pick the collection again to retry." },
      ];
    }

    const source: readonly unknown[] = kind === "planet" ? listing.planets : listing.stars;
    if (source.length === 0) {
      return [
        { kind: "status", text: `${listing.label} · nothing renderable`, tone: "danger" },
        { kind: "note", text: "No object in this result set has enough data to be visualized." },
      ];
    }

    const current = listing;
    const cells: XrCell[] =
      kind === "planet"
        ? paginate(current.planets, current.page, RESULT_ROWS).items.map((planet) => ({
            detail: planetCellDetail(planet),
            id: planet.id,
            label: planet.name,
            onSelect: () => host.onTravelPlanet?.(planet),
          }))
        : paginate(current.stars, current.page, RESULT_ROWS).items.map((star) => ({
            detail: starCellDetail(star),
            id: star.id,
            label: star.name,
            onSelect: () => host.onTravelStar?.(star),
          }));

    const pageCount = Math.max(1, Math.ceil(source.length / RESULT_ROWS));
    const pageIndex = Math.min(Math.max(0, current.page), pageCount - 1);
    if (pageCount > 1) {
      cells.push({
        badge: `${pageIndex + 1}/${pageCount}`,
        id: "next-page",
        label: "More results",
        onSelect: () => {
          listing = { ...current, page: (pageIndex + 1) % pageCount };
          render();
        },
        tone: "ghost",
      });
    }

    return [
      {
        kind: "status",
        text: `${listing.label} · ${source.length} destination${source.length === 1 ? "" : "s"}`,
      },
      { cells, columns: 2, kind: "rows" },
    ];
  };

  const keyboardBlocks = (label: string, value: string): XrBlock[] => [
    { kind: "field", label, value },
    {
      cells: KEYBOARD_ROWS.flatMap((row) =>
        row.map((key) => ({
          id: `key-${key}`,
          label: key,
          onSelect: () => {
            if (keyboardTarget === "forge-name") {
              const name = applyKeyStroke(
                forgeMode === "planet" ? planetParameters.name : starParameters.name,
                key,
                24,
              );
              if (forgeMode === "planet") planetParameters = { ...planetParameters, name };
              else starParameters = { ...starParameters, name };
            } else {
              query = applyKeyStroke(query, key);
            }
            render();
          },
        })),
      ),
      columns: 10,
      height: 78,
      kind: "grid",
    },
  ];

  const catalogBlocks = (kind: "planet" | "star"): XrBlock[] => {
    if (listing) return listingBlocks(kind);

    if (catalogTab === "search") {
      return [
        ...keyboardBlocks(kind === "planet" ? "World search" : "Star search", query),
        {
          cells: [
            {
              badge: query.trim() ? "GO" : undefined,
              disabled: !query.trim(),
              id: "run-search",
              label: "Search the archive",
              onSelect: runSearch,
              tone: "primary",
            },
            {
              disabled: !query,
              id: "clear-search",
              label: "Clear the query",
              onSelect: () => {
                query = "";
                render();
              },
              tone: "ghost",
            },
          ],
          kind: "rows",
        },
      ];
    }

    if (catalogTab === "categories") {
      return [
        {
          cells: entryCells(kind === "planet" ? PLANET_CATEGORIES : STAR_CATEGORIES, (entry) => {
            if (kind === "planet") {
              loadPlanetListing(entry.label, (signal) => discoverPlanets(entry.id, { signal }));
            } else {
              loadStarListing(entry.label, (signal) => discoverStars(entry.id, { signal }));
            }
          }),
          columns: 4,
          height: 104,
          kind: "grid",
        },
      ];
    }

    return [
      {
        cells: [
          ...entryCells(kind === "planet" ? PLANET_COLLECTIONS : STAR_COLLECTIONS, (entry) => {
            if (kind === "planet") {
              loadPlanetListing(entry.label, (signal) => discoverPlanets(entry.id, { signal }));
            } else {
              loadStarListing(entry.label, (signal) => discoverStars(entry.id, { signal }));
            }
          }),
          {
            detail: "Jump somewhere unplanned",
            id: "surprise",
            label: "Surprise me",
            onSelect: () => surprise(kind),
            tone: "primary",
          },
        ],
        kind: "rows",
      },
    ];
  };

  const forgeBlocks = (): XrBlock[] => {
    const modeTabs: XrBlock = {
      cells: (
        [
          ["build", "Identity"],
          ["shape", "Parameters"],
        ] as const
      ).map(([id, label]) => ({
        active: forgeTab === id,
        id: `forge-${id}`,
        label,
        onSelect: () => {
          forgeTab = id;
          keyboardTarget = null;
          render();
        },
      })),
      kind: "tabs",
    };

    const create: XrCell =
      forgeMode === "planet"
        ? {
            badge: "CREATE",
            detail: "Generate and travel to this world",
            id: "forge-create",
            label: "Forge this world",
            onSelect: () => host.onForgePlanet?.(generateCustomWorld(planetParameters)),
            tone: "primary",
          }
        : {
            badge: "CREATE",
            detail: "Ignite and travel to this star",
            id: "forge-create",
            label: "Forge this star",
            onSelect: () => host.onForgeStar?.(generateCustomStar(starParameters)),
            tone: "primary",
          };

    if (keyboardTarget === "forge-name") {
      return [
        modeTabs,
        ...keyboardBlocks(
          forgeMode === "planet" ? "World name" : "Star name",
          forgeMode === "planet" ? planetParameters.name : starParameters.name,
        ),
        {
          cells: [
            {
              id: "name-done",
              label: "Done",
              onSelect: () => {
                keyboardTarget = null;
                render();
              },
              tone: "primary",
            },
          ],
          kind: "rows",
        },
      ];
    }

    if (forgeTab === "shape") {
      const rows =
        forgeMode === "planet"
          ? PLANET_FORGE_FIELDS.filter((field) => field.visible?.(planetParameters) ?? true).map(
              (field) => ({
                decrease: {
                  id: `planet-${field.key}-down`,
                  label: "−",
                  onSelect: () => {
                    planetParameters = adjustPlanetField(planetParameters, field, -1);
                    render();
                  },
                },
                increase: {
                  id: `planet-${field.key}-up`,
                  label: "+",
                  onSelect: () => {
                    planetParameters = adjustPlanetField(planetParameters, field, 1);
                    render();
                  },
                },
                label: field.label(planetParameters),
                value: field.format(planetParameters),
              }),
            )
          : STAR_FORGE_FIELDS.map((field) => ({
              decrease: {
                id: `star-${field.key}-down`,
                label: "−",
                onSelect: () => {
                  starParameters = adjustStarField(starParameters, field, -1);
                  render();
                },
              },
              increase: {
                id: `star-${field.key}-up`,
                label: "+",
                onSelect: () => {
                  starParameters = adjustStarField(starParameters, field, 1);
                  render();
                },
              },
              label: field.label,
              value: field.format(starParameters),
            }));
      return [modeTabs, { kind: "steppers", rows }, { cells: [create], kind: "rows" }];
    }

    const identity: XrCell[] = [
      {
        badge: forgeMode === "planet" ? "PLANET" : "STAR",
        detail: "Switch what the forge builds",
        id: "forge-mode",
        label: "Object type",
        onSelect: () => {
          forgeMode = forgeMode === "planet" ? "star" : "planet";
          render();
        },
      },
      {
        badge: "EDIT",
        detail: forgeMode === "planet" ? planetParameters.name : starParameters.name,
        id: "forge-name",
        label: "Name",
        onSelect: () => {
          keyboardTarget = "forge-name";
          render();
        },
      },
      forgeMode === "planet"
        ? {
            badge: "CYCLE",
            detail: forgePlanetKindLabel(planetParameters.kind),
            id: "forge-family",
            label: "World family",
            onSelect: () => {
              planetParameters = {
                ...planetParameters,
                kind: cycle(PLANET_FORGE_KINDS, planetParameters.kind, 1),
              };
              render();
            },
          }
        : {
            badge: "CYCLE",
            detail: forgeStarKindLabel(starParameters.kind),
            id: "forge-family",
            label: "Stellar family",
            onSelect: () => {
              starParameters = {
                ...starParameters,
                kind: cycle(STAR_FORGE_KINDS, starParameters.kind, 1),
              };
              render();
            },
          },
    ];

    if (forgeMode === "planet") {
      identity.push({
        badge: planetParameters.rings ? "ON" : "OFF",
        detail: "Give the world a ring system",
        id: "forge-rings",
        label: "Rings",
        onSelect: () => {
          planetParameters = { ...planetParameters, rings: !planetParameters.rings };
          render();
        },
      });
    }

    identity.push({
      badge: "RANDOM",
      detail: `Seed ${forgeMode === "planet" ? planetParameters.seed : starParameters.seed}`,
      id: "forge-seed",
      label: "Generation seed",
      onSelect: () => {
        if (forgeMode === "planet") planetParameters = { ...planetParameters, seed: forgeSeed() };
        else starParameters = { ...starParameters, seed: forgeSeed() };
        render();
      },
    });

    identity.push(create);
    return [modeTabs, { cells: identity, kind: "rows" }];
  };

  /**
   * The home system, browsed by shelf the way the browser catalog is.
   *
   * Everything here is local data rather than an archive request, so a shelf paints in the frame
   * it is asked for; only the exoplanet and stellar sections have a network round trip to wait on.
   */
  const solarBlocks = (): XrBlock[] => {
    const shelfTabs: XrBlock = {
      cells: SOLAR_SHELVES.map((shelf) => ({
        active: solarShelf === shelf.id,
        id: `shelf-${shelf.id}`,
        label: shelf.label,
        onSelect: () => {
          solarShelf = shelf.id;
          solarPage = 0;
          render();
        },
      })),
      kind: "tabs",
    };

    const cells: XrCell[] = [];
    switch (solarShelf) {
      case "planets":
        cells.push(
          {
            detail: starCellDetail(SUN),
            id: SUN.id,
            label: SUN.name,
            onSelect: () => host.onTravelStar?.(SUN),
          },
          ...SOLAR_SYSTEM_PLANETS.map((planet) => ({
            detail: solarWorldDetail(planet),
            id: planet.id,
            label: planet.name,
            onSelect: () => host.onTravelPlanet?.(planet),
          })),
        );
        break;
      case "dwarfs":
        cells.push(
          ...SOLAR_SYSTEM_DWARF_PLANETS.map((planet) => ({
            detail: solarWorldDetail(planet),
            id: planet.id,
            label: planet.name,
            onSelect: () => host.onTravelPlanet?.(planet),
          })),
        );
        break;
      case "moons":
        cells.push(
          ...[...SOLAR_SYSTEM_MOONS, ...SOLAR_SYSTEM_DWARF_MOONS].map((moon) => ({
            detail: solarWorldDetail(moon),
            id: moon.id,
            label: moon.name,
            onSelect: () => host.onTravelPlanet?.(moon),
          })),
        );
        break;
      case "asteroids":
        cells.push(
          ...SOLAR_SYSTEM_ASTEROIDS.map((asteroid) => ({
            detail: asteroidCellDetail(asteroid),
            id: asteroid.id,
            label: asteroid.name,
            onSelect: () => host.onTravelAsteroid?.(asteroid),
          })),
        );
        break;
      case "comets":
        cells.push(
          ...SOLAR_SYSTEM_COMETS.map((comet) => ({
            detail: cometCellDetail(comet),
            id: comet.id,
            label: comet.name,
            onSelect: () => host.onTravelComet?.(comet),
          })),
        );
        break;
      case "regions":
        cells.push(
          ...SOLAR_SYSTEM_REGIONS.map((region) => ({
            detail: regionCellDetail(region),
            id: region.id,
            label: region.name,
            onSelect: () => host.onTravelRegion?.(region),
          })),
        );
        break;
      case "missions":
        cells.push(
          ...SOLAR_SYSTEM_MISSIONS.map((mission) => ({
            detail: missionCellDetail(mission),
            id: mission.id,
            label: mission.name,
            onSelect: () => host.onTravelMission?.(mission),
          })),
        );
        break;
    }

    const page = paginate(cells, solarPage, SOLAR_ROWS);
    const shown = [...page.items];
    if (page.pageCount > 1) {
      shown.push({
        badge: `${page.page + 1}/${page.pageCount}`,
        id: "solar-next-page",
        label: "More",
        onSelect: () => {
          solarPage = (page.page + 1) % page.pageCount;
          render();
        },
        tone: "ghost",
      });
    }

    return [
      shelfTabs,
      {
        kind: "status",
        text: `${cells.length} destination${cells.length === 1 ? "" : "s"} · NASA / JPL measured data`,
      },
      { cells: shown, columns: 2, kind: "rows" },
    ];
  };

  const blackHoleBlocks = (): XrBlock[] => [
    { kind: "status", text: "Five landmark systems · NASA / EHT / ESA" },
    {
      cells: BLACK_HOLES.map((blackHole) => ({
        detail: blackHoleCellDetail(blackHole),
        id: blackHole.id,
        label: blackHole.name,
        onSelect: () => host.onTravelBlackHole?.(blackHole),
      })),
      kind: "rows",
    },
    {
      kind: "note",
      text: "Mass, distance and classification are observed. The luminous matter around each one is Exora's disclosed interpretation, not an image.",
    },
  ];

  const buildView = (): XrPanelView => {
    const copy = SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0];
    const blocks: XrBlock[] = [];
    let back: XrCell | undefined;

    switch (section) {
      case "solar":
        blocks.push(...solarBlocks());
        break;
      case "worlds":
      case "stars": {
        const kind = section === "worlds" ? "planet" : "star";
        blocks.push(catalogTabsBlock(), ...catalogBlocks(kind));
        if (listing) {
          back = {
            id: "listing-back",
            label: "Back",
            onSelect: () => {
              cancelRequest();
              listing = null;
              render();
            },
          };
        }
        break;
      }
      case "black-holes":
        blocks.push(...blackHoleBlocks());
        break;
      case "forge":
        blocks.push(...forgeBlocks());
        break;
      case "view":
        blocks.push(
          { cells: host.sceneActions().slice(0, SCENE_ACTION_ROWS), kind: "rows" },
          { facts: host.facts(), kind: "facts" },
          { kind: "note", text: host.summary() },
          { kind: "status", text: host.source() },
        );
        break;
    }

    return {
      back,
      blocks,
      footer: FOOTER_HINT,
      rail: rail(),
      // The way out of Discover and the way out of the session, kept together at the foot of the
      // rail: the browser screen's close button in the same corner, and the one control a wearer
      // cannot fall back on the flat page for.
      railActions: [
        {
          id: "close-discover",
          label: "Return to view",
          onSelect: () => panel.hide(),
        },
        {
          id: "exit-vr",
          label: "Exit immersive VR",
          onSelect: host.onExit,
          tone: "danger",
        },
      ],
      subtitle: section === "view" ? host.subtitle() : copy?.eyebrow,
      summary: section === "view" ? host.summary() : copy?.summary,
      title: section === "view" ? host.title() : (copy?.title ?? "Discover"),
    };
  };

  panel.setView(buildView());

  return {
    attach: (xr) => panel.attach(xr),
    dispose: () => {
      cancelRequest();
      panel.dispose();
    },
    recall: () => panel.recall(),
    refresh: () => render(),
    setVisible: (visible) => {
      if (!visible) {
        panel.hide();
        return;
      }
      if (dirty) {
        panel.setView(buildView());
        dirty = false;
      }
      panel.summon();
    },
    update: (deltaSeconds) => {
      panel.update(deltaSeconds);
      if (dirty && panel.isVisible()) render();
    },
  };
};
