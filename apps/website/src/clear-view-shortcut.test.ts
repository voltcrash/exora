import { expect, test } from "vite-plus/test";
import { togglesClearView, type ClearViewShortcutEvent } from "./clear-view-shortcut.ts";
import type { ShortcutTarget } from "./discover-shortcut.ts";

const element = (tagName: string, type?: string): ShortcutTarget => ({
  isContentEditable: false,
  tagName,
  ...(type === undefined ? {} : { type }),
});

const tab = (overrides: Partial<ClearViewShortcutEvent> = {}): ClearViewShortcutEvent => ({
  altKey: false,
  ctrlKey: false,
  key: "Tab",
  metaKey: false,
  onMainScreen: true,
  shiftKey: false,
  target: null,
  ...overrides,
});

test("a tab on the main screen toggles the interface", () => {
  expect(togglesClearView(tab())).toBe(true);
  expect(togglesClearView(tab({ target: element("BODY") }))).toBe(true);
  expect(togglesClearView(tab({ target: element("CANVAS") }))).toBe(true);
  expect(togglesClearView(tab({ target: element("BUTTON") }))).toBe(true);
});

test("no other key toggles the interface", () => {
  for (const key of ["Escape", "Enter", " ", "a", "/", "ArrowRight", "tab"]) {
    expect(togglesClearView(tab({ key }))).toBe(false);
  }
});

test("a tab anywhere but the main screen is left to the browser", () => {
  expect(togglesClearView(tab({ onMainScreen: false }))).toBe(false);
});

test("shift+tab keeps traversing, which is what keeps the page keyboard-reachable", () => {
  expect(togglesClearView(tab({ shiftKey: true }))).toBe(false);
});

test("browser and system chords are left to the browser and the system", () => {
  expect(togglesClearView(tab({ ctrlKey: true }))).toBe(false);
  expect(togglesClearView(tab({ metaKey: true }))).toBe(false);
  expect(togglesClearView(tab({ altKey: true }))).toBe(false);
});

test("a tab out of a text field moves out of the text field", () => {
  for (const target of [
    element("INPUT"),
    element("INPUT", "text"),
    element("INPUT", "number"),
    element("TEXTAREA"),
    element("SELECT"),
    { isContentEditable: true, tagName: "DIV" },
  ]) {
    expect(togglesClearView(tab({ target }))).toBe(false);
  }
});

test("controls that hold no typed text still answer the shortcut", () => {
  for (const target of [element("INPUT", "range"), element("INPUT", "checkbox")]) {
    expect(togglesClearView(tab({ target }))).toBe(true);
  }
});
