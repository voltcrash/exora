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

test("toggles clear view only for an unmodified Tab on the main screen", () => {
  expect(togglesClearView(tab())).toBe(true);
  expect(togglesClearView(tab({ target: element("BODY") }))).toBe(true);
  expect(togglesClearView(tab({ target: element("CANVAS") }))).toBe(true);
  expect(togglesClearView(tab({ target: element("BUTTON") }))).toBe(true);
  for (const key of ["Escape", "Enter", " ", "a", "/", "ArrowRight", "tab"]) {
    expect(togglesClearView(tab({ key }))).toBe(false);
  }
  expect(togglesClearView(tab({ onMainScreen: false }))).toBe(false);
  expect(togglesClearView(tab({ shiftKey: true }))).toBe(false);
  expect(togglesClearView(tab({ ctrlKey: true }))).toBe(false);
  expect(togglesClearView(tab({ metaKey: true }))).toBe(false);
  expect(togglesClearView(tab({ altKey: true }))).toBe(false);
});

test("leaves text entry to the browser while allowing non-text controls", () => {
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
  for (const target of [element("INPUT", "range"), element("INPUT", "checkbox")]) {
    expect(togglesClearView(tab({ target }))).toBe(true);
  }
});
