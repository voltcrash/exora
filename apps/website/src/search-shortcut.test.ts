import { expect, test } from "vite-plus/test";
import {
  isTextEntryTarget,
  opensSearchShortcut,
  type SearchShortcutEvent,
  type ShortcutTarget,
} from "./search-shortcut.ts";

const element = (tagName: string, type?: string): ShortcutTarget => ({
  isContentEditable: false,
  tagName,
  ...(type === undefined ? {} : { type }),
});

const slash = (overrides: Partial<SearchShortcutEvent> = {}): SearchShortcutEvent => ({
  altKey: false,
  ctrlKey: false,
  key: "/",
  metaKey: false,
  target: null,
  ...overrides,
});

test("a slash on the page opens the catalog", () => {
  expect(opensSearchShortcut(slash(), { dialogOpen: false })).toBe(true);
  expect(opensSearchShortcut(slash({ target: element("BODY") }), { dialogOpen: false })).toBe(true);
  expect(opensSearchShortcut(slash({ target: element("CANVAS") }), { dialogOpen: false })).toBe(
    true,
  );
});

test("no other key opens the catalog", () => {
  for (const key of ["a", "?", "Enter", "Escape", "ArrowRight", "Slash", " "]) {
    expect(opensSearchShortcut(slash({ key }), { dialogOpen: false })).toBe(false);
  }
});

test("a slash typed into a text field stays in the text field", () => {
  for (const target of [
    element("INPUT"),
    element("INPUT", "text"),
    element("INPUT", "search"),
    element("INPUT", "email"),
    element("INPUT", "url"),
    element("INPUT", "number"),
    element("INPUT", "password"),
    element("TEXTAREA"),
  ]) {
    expect(opensSearchShortcut(slash({ target }), { dialogOpen: false })).toBe(false);
  }
});

test("controls that cannot hold typed text still answer the shortcut", () => {
  for (const target of [
    element("INPUT", "range"),
    element("INPUT", "checkbox"),
    element("INPUT", "radio"),
    element("INPUT", "color"),
    element("BUTTON"),
  ]) {
    expect(opensSearchShortcut(slash({ target }), { dialogOpen: false })).toBe(true);
  }
});

test("an input type this build has never heard of is treated as a text field", () => {
  // Guessing "shortcut" would swallow a keystroke; guessing "text field" only costs the shortcut.
  expect(isTextEntryTarget(element("INPUT", "some-future-type"))).toBe(true);
});

test("input types are matched however they are cased", () => {
  expect(isTextEntryTarget(element("input", "RANGE"))).toBe(false);
  expect(isTextEntryTarget(element("Input", "Range"))).toBe(false);
  expect(isTextEntryTarget(element("TextArea"))).toBe(true);
});

test("a select keeps the character for its own type-ahead", () => {
  expect(isTextEntryTarget(element("SELECT"))).toBe(true);
});

test("a contenteditable host keeps the character whatever it is built from", () => {
  expect(isTextEntryTarget({ isContentEditable: true, tagName: "DIV" })).toBe(true);
  expect(isTextEntryTarget({ isContentEditable: true, tagName: "SPAN" })).toBe(true);
});

test("a key press with no target belongs to the page", () => {
  expect(isTextEntryTarget(null)).toBe(false);
});

test("shift is allowed, because some layouts need it to produce a slash at all", () => {
  // `shiftKey` is not part of the event the rule reads, so a shifted slash is still a slash.
  expect(opensSearchShortcut(slash(), { dialogOpen: false })).toBe(true);
});

test("browser and system chords are left to the browser and the system", () => {
  expect(opensSearchShortcut(slash({ ctrlKey: true }), { dialogOpen: false })).toBe(false);
  expect(opensSearchShortcut(slash({ metaKey: true }), { dialogOpen: false })).toBe(false);
  expect(opensSearchShortcut(slash({ altKey: true }), { dialogOpen: false })).toBe(false);
});

test("an open modal keeps the page-level shortcut off the page", () => {
  expect(opensSearchShortcut(slash(), { dialogOpen: true })).toBe(false);
  expect(opensSearchShortcut(slash({ target: element("BUTTON") }), { dialogOpen: true })).toBe(
    false,
  );
});
