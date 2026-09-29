import { expect, test } from "vite-plus/test";
import {
  groupEntries,
  matchScore,
  opensCommandPalette,
  rankPaletteEntries,
  type PaletteEntry,
} from "./command-palette.ts";

const entry = (
  name: string,
  group: PaletteEntry["group"],
  keywords: string[] = [],
): PaletteEntry => ({
  detail: "",
  group,
  id: name,
  keywords,
  name,
  target: { action: "home", type: "action" },
});

const entries = [
  entry("Mars", "Solar System", ["Red Planet"]),
  entry("Marsh 12 b", "Exoplanets"),
  entry("TRAPPIST-1 e", "Exoplanets"),
  entry("Sagittarius A*", "Black holes", ["Sgr A*"]),
  entry("Io", "Solar System"),
  entry("Open Discover", "Actions", ["browse", "catalog"]),
];

test("an exact name beats a longer one that merely starts the same way", () => {
  expect(
    rankPaletteEntries(entries, "mars")
      .map(({ name }) => name)
      .slice(0, 2),
  ).toEqual(["Mars", "Marsh 12 b"]);
});

test("letters typed in order still find a world", () => {
  expect(matchScore("tr1e", "TRAPPIST-1 e")).not.toBeNull();
  expect(rankPaletteEntries(entries, "tr1e")[0]?.name).toBe("TRAPPIST-1 e");
});

test("aliases and keywords are searched but rank just below names", () => {
  expect(rankPaletteEntries(entries, "sgr")[0]?.name).toBe("Sagittarius A*");
  expect(rankPaletteEntries(entries, "red planet")[0]?.name).toBe("Mars");
  expect(rankPaletteEntries(entries, "catalog")[0]?.name).toBe("Open Discover");
});

test("two-letter queries do not fall back to scattered letters", () => {
  expect(matchScore("io", "Io")).toBe(120);
  expect(matchScore("xq", "Sagittarius A*")).toBeNull();
});

test("groups come out in a fixed order", () => {
  expect(groupEntries(entries).map(({ group }) => group)).toEqual([
    "Solar System",
    "Exoplanets",
    "Black holes",
    "Actions",
  ]);
});

const key = (overrides: Partial<Parameters<typeof opensCommandPalette>[0]>) =>
  opensCommandPalette({
    altKey: false,
    ctrlKey: false,
    key: "k",
    metaKey: false,
    shiftKey: false,
    target: null,
    ...overrides,
  });

test("⌘K and Ctrl+K open the palette anywhere; a slash only outside text fields", () => {
  expect(key({ metaKey: true })).toBe(true);
  expect(key({ ctrlKey: true, key: "K" })).toBe(true);
  expect(key({})).toBe(false);
  expect(key({ key: "/" })).toBe(true);
  expect(
    key({ key: "/", target: { isContentEditable: false, tagName: "INPUT", type: "search" } }),
  ).toBe(false);
  expect(key({ metaKey: true, shiftKey: true })).toBe(false);
});
