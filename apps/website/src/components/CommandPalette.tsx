import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { searchPlanets, searchStars } from "../api-client.ts";
import {
  groupEntries,
  rankPaletteEntries,
  type PaletteEntry,
  type PaletteTarget,
} from "../command-palette.ts";
import { planetKindLabel } from "../planet-utils.tsx";
import { TOURS } from "../tours.ts";
import { Icon, type IconName } from "./ui/Icon.tsx";
import { Kbd, MODIFIER_KEY } from "./ui/Kbd.tsx";
import { Spinner } from "./ui/Spinner.tsx";
import styles from "./CommandPalette.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(styles);

const REMOTE_DELAY_MS = 220;

const ACTIONS: readonly PaletteEntry[] = [
  {
    detail: "Browse every catalogue, the Solar System and World Forge",
    group: "Actions",
    id: "action-discover",
    keywords: ["browse", "catalog", "catalogue", "search", "forge", "create", "discover"],
    name: "Open Explore",
    target: { action: "discover", type: "action" },
  },
  {
    detail: "Hide or restore the interface over the view",
    group: "Actions",
    id: "action-clear-view",
    keywords: ["hide", "interface", "screenshot", "chrome", "clear", "view"],
    name: "Hide or show the interface",
    target: { action: "clear-view", type: "action" },
  },
  {
    detail: "Back to the featured world",
    group: "Actions",
    id: "action-home",
    keywords: ["featured", "start", "reset"],
    name: "Return home",
    target: { action: "home", type: "action" },
  },
];

const ICONS: Record<PaletteTarget["type"], IconName> = {
  action: "arrow-right",
  "black-hole": "black-hole",
  planet: "planet",
  region: "sparkle",
  star: "star",
  system: "orbit",
  tour: "route",
};

const ACTION_ICONS: Record<string, IconName> = {
  "clear-view": "eye-off",
  discover: "compass",
  home: "home",
};

const iconFor = (target: PaletteTarget): IconName =>
  target.type === "action" ? (ACTION_ICONS[target.action] ?? "arrow-right") : ICONS[target.type];

let localEntriesRequest: Promise<PaletteEntry[]> | null = null;

const localEntries = (): Promise<PaletteEntry[]> => {
  localEntriesRequest ??= Promise.all([
    import("../solar-system.ts"),
    import("../solar-regions.ts"),
    import("../black-holes.ts"),
  ]).then(([solar, regions, blackHoles]) => [
    ...solar.SOLAR_SYSTEM_CATALOG.map((entry): PaletteEntry => {
      if (entry.type === "star") {
        return {
          detail: "Our home star · NASA/JPL",
          group: "Solar System",
          id: `solar-${entry.profile.id}`,
          keywords: entry.profile.aliases ?? [],
          name: entry.profile.name,
          target: { cached: true, star: entry.profile, type: "star" },
        };
      }
      const identity = entry.profile.solarSystem;
      return {
        detail:
          identity?.bodyType === "moon"
            ? `Moon of ${identity.parent ?? "its planet"}`
            : identity?.bodyType === "dwarf-planet"
              ? "Dwarf planet"
              : "Planet",
        group: "Solar System",
        id: `solar-${entry.profile.id}`,
        keywords: identity?.parent ? [identity.parent] : [],
        name: entry.profile.name,
        target: { cached: true, planet: entry.profile, type: "planet" },
      };
    }),
    ...regions.SOLAR_SYSTEM_REGIONS.map((region): PaletteEntry => ({
      detail: `Region · ${region.distanceAu.note}`,
      group: "Solar System",
      id: `region-${region.id}`,
      keywords: region.aliases,
      name: region.name,
      target: { region, type: "region" },
    })),
    ...blackHoles.BLACK_HOLES.map((blackHole): PaletteEntry => ({
      detail: `${blackHoles.blackHoleKindLabel(blackHole)} · ${blackHole.host}`,
      group: "Black holes",
      id: `black-hole-${blackHole.id}`,
      keywords: [...blackHole.aliases, blackHole.host],
      name: blackHole.name,
      target: { blackHole, type: "black-hole" },
    })),
    ...TOURS.map((tour): PaletteEntry => ({
      detail: `Guided tour · ${String(tour.steps.length)} stops · ${tour.summary}`,
      group: "Tours",
      id: `tour-${tour.id}`,
      keywords: ["tour", "guided", ...tour.steps.map((step) => step.name)],
      name: tour.title,
      target: { tourId: tour.id, type: "tour" },
    })),
    ...ACTIONS,
  ]);
  return localEntriesRequest;
};

interface CommandPaletteProps {
  onClose: () => void;
  onSelect: (target: PaletteTarget) => void;
}

/*
 * The palette is a modal dialog holding a combobox and its listbox. Focus stays in the input;
 * the arrow keys move the active option and Enter takes it, so the whole thing is usable without
 * a pointer, and screen readers hear the active option through aria-activedescendant.
 */
export const CommandPalette = ({ onClose, onSelect }: CommandPaletteProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [local, setLocal] = useState<PaletteEntry[]>(ACTIONS.slice());
  const [remote, setRemote] = useState<{ entries: PaletteEntry[]; query: string }>({
    entries: [],
    query: "",
  });
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    inputRef.current?.focus();
    void localEntries().then(setLocal);
    return () => {
      dialog?.close();
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      void Promise.allSettled([
        searchPlanets(trimmed, { signal: controller.signal }),
        searchStars(trimmed, { signal: controller.signal }),
      ]).then(([planets, stars]) => {
        if (controller.signal.aborted) return;
        const planetResults = planets.status === "fulfilled" ? planets.value.planets : [];
        const hosts = [...new Set(planetResults.map((planet) => planet.hostStar))];
        setRemote({
          entries: [
            ...planetResults.map((planet): PaletteEntry => ({
              detail: `${planetKindLabel(planet)} · ${planet.hostStar} · ${planet.observation.discoveryMethod}`,
              group: "Exoplanets",
              id: `planet-${planet.id}`,
              keywords: [planet.hostStar],
              name: planet.name,
              target: {
                cached: planets.status === "fulfilled" && planets.value.cached,
                planet,
                type: "planet",
              },
            })),
            ...hosts.map((hostStar): PaletteEntry => ({
              detail: "Every confirmed world on its measured orbit",
              group: "Systems",
              id: `system-${hostStar}`,
              keywords: [hostStar],
              name: `${hostStar} system`,
              target: { hostStar, type: "system" },
            })),
            ...(stars.status === "fulfilled" ? stars.value.stars : []).map(
              (star): PaletteEntry => ({
                detail: [star.objectType, star.observation.spectralType]
                  .filter(Boolean)
                  .join(" · "),
                group: "Stars",
                id: `star-${star.id}`,
                keywords: [...(star.aliases ?? []), star.catalogName],
                name: star.name,
                target: {
                  cached: stars.status === "fulfilled" && stars.value.cached,
                  star,
                  type: "star",
                },
              }),
            ),
          ],
          query: trimmed,
        });
        setSearching(false);
      });
    }, REMOTE_DELAY_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const groups = useMemo(() => {
    const trimmed = query.trim();
    const remoteEntries = trimmed.length >= 2 && remote.query === trimmed ? remote.entries : [];
    const ranked = trimmed
      ? rankPaletteEntries([...local, ...remoteEntries], trimmed, 16)
      : [...local.filter((entry) => entry.group === "Solar System").slice(0, 6), ...ACTIONS];
    return groupEntries(ranked);
  }, [local, query, remote]);

  const flat = groups.flatMap(({ entries }) => entries);
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));
  const activeEntry = flat[activeIndex];

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!activeEntry) return;
    document.getElementById(`${listId}-${activeEntry.id}`)?.scrollIntoView({ block: "nearest" });
  }, [activeEntry, listId]);

  const choose = (entry: PaletteEntry | undefined): void => {
    if (!entry) return;
    onSelect(entry.target);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (flat.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + flat.length) % flat.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(activeEntry);
    } else if (event.key === "Home" && flat.length > 0) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && flat.length > 0) {
      event.preventDefault();
      setActive(flat.length - 1);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={cx("palette")}
      aria-label="Go anywhere"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={cx("palette-card")}>
        <div className={cx("palette-field")}>
          {searching ? <Spinner size={18} /> : <Icon name="search" size={18} />}
          <input
            ref={inputRef}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={flat.length > 0}
            aria-activedescendant={activeEntry ? `${listId}-${activeEntry.id}` : undefined}
            aria-label="Go anywhere: a planet, moon, star, system, region or black hole"
            placeholder="Go anywhere — a planet, moon, star, system or black hole"
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <Kbd label="Escape closes">Esc</Kbd>
        </div>

        <div className={cx("palette-results")} id={listId} role="listbox" aria-label="Destinations">
          {groups.map(({ entries, group }) => (
            <div key={group} role="group" aria-label={group}>
              <p className={cx("palette-group")} aria-hidden="true">
                {group}
              </p>
              {entries.map((entry) => {
                const index = flat.indexOf(entry);
                return (
                  <div
                    key={entry.id}
                    id={`${listId}-${entry.id}`}
                    className={cx("palette-option")}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseMove={() => setActive(index)}
                    onClick={() => choose(entry)}
                  >
                    <span className={cx("palette-glyph")} aria-hidden="true">
                      <Icon name={iconFor(entry.target)} size={18} />
                    </span>
                    <span className={cx("palette-copy")}>
                      <strong>{entry.name}</strong>
                      <small>{entry.detail}</small>
                    </span>
                    {index === activeIndex ? (
                      <span className={cx("palette-enter")} aria-hidden="true">
                        <Kbd>↵</Kbd>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
          {flat.length === 0 ? (
            <p className={cx("palette-empty")} role="status">
              {searching
                ? "Asking the archives…"
                : "Nothing by that name. Try a catalog ID, like Kepler-22 b or HD 209458."}
            </p>
          ) : null}
        </div>

        <p className={cx("palette-footer")} role="status">
          {searching ? (
            "Searching the NASA Exoplanet Archive and SIMBAD…"
          ) : (
            <>
              <span>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> move
              </span>
              <span>
                <Kbd>↵</Kbd> travel
              </span>
              <span>
                <Kbd>{`${MODIFIER_KEY} K`}</Kbd> or <Kbd>/</Kbd> opens this anywhere
              </span>
            </>
          )}
        </p>
      </div>
    </dialog>
  );
};
