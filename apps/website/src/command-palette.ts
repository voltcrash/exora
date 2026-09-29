import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { BlackHoleProfile } from "./black-holes.ts";
import { isTextEntryTarget, type ShortcutTarget } from "./discover-shortcut.ts";
import type { SolarRegionProfile } from "./solar-regions.ts";

/*
 * GO ANYWHERE
 *
 * One box that reaches every destination Exora knows, wherever it lives: the Solar System's worlds,
 * moons and regions and the curated black holes are bundled and ranked instantly as each key is
 * typed; confirmed planets and stars come from the archives a moment later. Ranking prefers a name
 * that starts with what was typed, then a word inside it, then any substring, then the letters in
 * order — so "tr1e" still finds TRAPPIST-1 e.
 */

export type PaletteAction = "clear-view" | "discover" | "home";

export type PaletteTarget =
  | { action: PaletteAction; type: "action" }
  | { blackHole: BlackHoleProfile; type: "black-hole" }
  | { cached: boolean; planet: ExoplanetProfile; type: "planet" }
  | { cached: boolean; star: StarProfile; type: "star" }
  | { hostStar: string; type: "system" }
  | { region: SolarRegionProfile; type: "region" }
  | { tourId: string; type: "tour" };

export type PaletteGroup =
  | "Actions"
  | "Black holes"
  | "Exoplanets"
  | "Solar System"
  | "Stars"
  | "Systems"
  | "Tours";

export const PALETTE_GROUP_ORDER: readonly PaletteGroup[] = [
  "Solar System",
  "Exoplanets",
  "Systems",
  "Stars",
  "Black holes",
  "Tours",
  "Actions",
];

export interface PaletteEntry {
  detail: string;
  group: PaletteGroup;
  id: string;
  keywords: readonly string[];
  name: string;
  target: PaletteTarget;
}

export const normalizeQuery = (value: string): string =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9 ]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();

const compact = (value: string): string => normalizeQuery(value).replaceAll(" ", "");

const subsequenceScore = (needle: string, haystack: string): number | null => {
  let position = -1;
  let gaps = 0;
  for (const character of needle) {
    const next = haystack.indexOf(character, position + 1);
    if (next < 0) return null;
    gaps += next - position - 1;
    position = next;
  }
  return Math.max(1, 40 - gaps);
};

/** How well `query` names `candidate`; null when it does not match at all. */
export const matchScore = (query: string, candidate: string): number | null => {
  const needle = compact(query);
  if (needle.length === 0) return 0;
  const haystack = compact(candidate);
  if (haystack === needle) return 120;
  if (haystack.startsWith(needle)) return 100 - Math.min(haystack.length - needle.length, 20);
  const words = normalizeQuery(candidate).split(" ");
  if (words.some((word) => word.startsWith(needle))) return 80;
  if (haystack.includes(needle)) return 60;
  return needle.length >= 3 ? subsequenceScore(needle, haystack) : null;
};

export const rankPaletteEntries = (
  entries: readonly PaletteEntry[],
  query: string,
  limit = 12,
): PaletteEntry[] => {
  if (normalizeQuery(query).length === 0) return entries.slice(0, limit);
  return entries
    .flatMap((entry, index) => {
      const scores = [entry.name, ...entry.keywords]
        .map((candidate) => matchScore(query, candidate))
        .filter((score): score is number => score !== null);
      if (scores.length === 0) return [];
      // Names outrank aliases, and ties keep the order the entries were given in.
      const nameScore = matchScore(query, entry.name) ?? 0;
      return [{ entry, index, score: Math.max(nameScore, Math.max(...scores) - 5) }];
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ entry }) => entry);
};

/** Groups ranked entries in the fixed group order, keeping each group's ranking. */
export const groupEntries = (
  entries: readonly PaletteEntry[],
): { entries: PaletteEntry[]; group: PaletteGroup }[] =>
  PALETTE_GROUP_ORDER.flatMap((group) => {
    const members = entries.filter((entry) => entry.group === group);
    return members.length > 0 ? [{ entries: members, group }] : [];
  });

export interface PaletteShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  target: ShortcutTarget | null;
}

/** ⌘K or Ctrl+K anywhere, or a bare "/" when the reader is not typing into a field. */
export const opensCommandPalette = (event: PaletteShortcutEvent): boolean => {
  if (event.altKey || event.shiftKey) return false;
  if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) return true;
  return event.key === "/" && !event.metaKey && !event.ctrlKey && !isTextEntryTarget(event.target);
};
