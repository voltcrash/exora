/**
 * The in-headset console: everything the flat page offers, reachable without taking the headset
 * off.
 *
 * The browser UI is a set of dialogs — a NASA planet catalog, a SIMBAD star catalog, the world
 * forge — and none of it survives an immersive session. Rather than shipping a second half-
 * featured menu, this module rebuilds those journeys as pages on one holographic panel: browse
 * collections and categories, type a query on an in-world keyboard, read the archive's own
 * numbers for the object in front of you, forge a new world or star, and travel to any of it
 * without leaving VR. Scene-specific entries (change view, recentre, visit the host star) are
 * supplied by whichever scene owns the console.
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
import { hasRenderer } from "./planet-utils.tsx";
import { createXrPanel, type XrPanel } from "./xr-panel.ts";
import {
  homeActionCapacity,
  rowCapacity,
  type XrBlock,
  type XrCell,
  type XrPanelView,
} from "./xr-panel-layout.ts";
import {
  adjustPlanetField,
  adjustStarField,
  applyKeyStroke,
  cycle,
  forgePlanetKindLabel,
  forgeSeed,
  forgeStarKindLabel,
  KEYBOARD_ROWS,
  paginate,
  planetCellDetail,
  PLANET_CATEGORIES,
  PLANET_COLLECTIONS,
  PLANET_FORGE_FIELDS,
  PLANET_FORGE_KINDS,
  starCellDetail,
  STAR_CATEGORIES,
  STAR_COLLECTIONS,
  STAR_FORGE_FIELDS,
  STAR_FORGE_KINDS,
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
  onTravelPlanet?: (planet: ExoplanetProfile) => void;
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

type ConsoleTab = "data" | "forge" | "home" | "stars" | "worlds";
type CatalogTab = "categories" | "collections" | "search";
type ForgeTab = "build" | "shape";

/** Rows a result page can show, derived from the space the tab strips and status line leave. */
const RESULT_ROWS = rowCapacity(64 + 18 + 64 + 18 + 44 + 18) - 1;
/** Scene entries the home page can carry and still leave room for the exit row. */
const HOME_ACTION_ROWS = homeActionCapacity();

const FOOTER_HINT = "TRIGGER SELECTS · A/X OPENS · B/Y HIDES · WRIST PAD TOGGLES";

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

  let tab: ConsoleTab = "home";
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

  const goTo = (next: ConsoleTab): void => {
    tab = next;
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
    if (tab === "stars") {
      loadStarListing(`“${trimmed}”`, (signal) => searchStars(trimmed, { signal }));
      return;
    }
    loadPlanetListing(`“${trimmed}”`, (signal) => searchPlanets(trimmed, { signal }));
  };

  const tabsBlock = (): XrBlock => ({
    cells: (
      [
        ["home", "Home"],
        ["worlds", "Worlds"],
        ["stars", "Stars"],
        ["forge", "Forge"],
        ["data", "Data"],
      ] as const
    ).map(([id, label]) => ({
      active: tab === id,
      id: `tab-${id}`,
      label,
      onSelect: () => goTo(id),
    })),
    kind: "tabs",
  });

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
      { cells, kind: "rows" },
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
          columns: 2,
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

  const buildView = (): XrPanelView => {
    const blocks: XrBlock[] = [tabsBlock()];
    let subtitle = host.subtitle();
    let back: XrCell | undefined;

    switch (tab) {
      case "home":
        blocks.push({
          cells: [
            ...host.sceneActions().slice(0, HOME_ACTION_ROWS),
            {
              detail: "Back to the browser view",
              id: "exit",
              label: "Exit immersive VR",
              onSelect: host.onExit,
              tone: "danger",
            },
          ],
          kind: "rows",
        });
        break;
      case "worlds":
      case "stars": {
        const kind = tab === "worlds" ? "planet" : "star";
        subtitle = kind === "planet" ? "NASA exoplanet archive" : "SIMBAD stellar catalog";
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
      case "forge":
        subtitle = "Exora world forge";
        blocks.push(...forgeBlocks());
        break;
      case "data":
        subtitle = "Observed properties";
        blocks.push(
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
      subtitle,
      title: tab === "home" || tab === "data" ? host.title() : titleFor(tab),
    };
  };

  const titleFor = (current: ConsoleTab): string =>
    current === "worlds" ? "Explore worlds" : current === "stars" ? "Explore stars" : "World forge";

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
