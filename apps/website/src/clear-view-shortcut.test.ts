import { expect, test } from "vite-plus/test";
import { togglesClearView, type ClearViewShortcutEvent } from "./clear-view-shortcut.ts";
import type { ShortcutTarget } from "./discover-shortcut.ts";

const element = (tagName: string, type?: string): ShortcutTarget => ({
  isContentEditable: false,
  tagName,
  ...(type === undefined ? {} : { type }),
});

const press = (overrides: Partial<ClearViewShortcutEvent> = {}): ClearViewShortcutEvent => ({
  altKey: false,
  ctrlKey: false,
  key: "h",
  metaKey: false,
  onMainScreen: true,
  shiftKey: false,
  target: null,
  ...overrides,
});

test("toggles clear view only for an unmodified H on the main screen", () => {
  expect(togglesClearView(press())).toBe(true);
  expect(togglesClearView(press({ target: element("BODY") }))).toBe(true);
  expect(togglesClearView(press({ target: element("CANVAS") }))).toBe(true);
  expect(togglesClearView(press({ target: element("BUTTON") }))).toBe(true);
  expect(togglesClearView(press({ key: "H" }))).toBe(true);
  for (const key of ["Escape", "Enter", " ", "a", "/", "ArrowRight", "Tab"]) {
    expect(togglesClearView(press({ key }))).toBe(false);
  }
  expect(togglesClearView(press({ onMainScreen: false }))).toBe(false);
  expect(togglesClearView(press({ shiftKey: true }))).toBe(false);
  expect(togglesClearView(press({ ctrlKey: true }))).toBe(false);
  expect(togglesClearView(press({ metaKey: true }))).toBe(false);
  expect(togglesClearView(press({ altKey: true }))).toBe(false);
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
    expect(togglesClearView(press({ target }))).toBe(false);
  }
  for (const target of [element("INPUT", "range"), element("INPUT", "checkbox")]) {
    expect(togglesClearView(press({ target }))).toBe(true);
  }
});
