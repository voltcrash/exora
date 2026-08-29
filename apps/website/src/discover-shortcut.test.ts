import { expect, test } from "vite-plus/test";
import {
  isTextEntryTarget,
  togglesDiscoverShortcut,
  type DiscoverShortcutEvent,
  type ShortcutTarget,
} from "./discover-shortcut.ts";

const element = (tagName: string, type?: string): ShortcutTarget => ({
  isContentEditable: false,
  tagName,
  ...(type === undefined ? {} : { type }),
});

const backspace = (overrides: Partial<DiscoverShortcutEvent> = {}): DiscoverShortcutEvent => ({
  altKey: false,
  ctrlKey: false,
  key: "Backspace",
  metaKey: false,
  repeat: false,
  shiftKey: false,
  target: null,
  ...overrides,
});

test("toggles Discover only for unmodified deletion outside text entry", () => {
  for (const key of ["Backspace", "Delete"]) {
    expect(togglesDiscoverShortcut(backspace({ key }))).toBe(true);
    expect(togglesDiscoverShortcut(backspace({ key, target: element("CANVAS") }))).toBe(true);
  }
  for (const key of ["/", "Escape", "Enter", "Tab", " ", "a"]) {
    expect(togglesDiscoverShortcut(backspace({ key }))).toBe(false);
  }
  for (const target of [
    element("INPUT"),
    element("INPUT", "text"),
    element("INPUT", "search"),
    element("INPUT", "email"),
    element("INPUT", "url"),
    element("INPUT", "number"),
    element("INPUT", "password"),
    element("TEXTAREA"),
    element("SELECT"),
    { isContentEditable: true, tagName: "DIV" },
  ]) {
    expect(togglesDiscoverShortcut(backspace({ target }))).toBe(false);
  }
  for (const target of [
    element("INPUT", "range"),
    element("INPUT", "checkbox"),
    element("INPUT", "radio"),
    element("BUTTON"),
  ]) {
    expect(togglesDiscoverShortcut(backspace({ target }))).toBe(true);
  }
  expect(togglesDiscoverShortcut(backspace({ repeat: true }))).toBe(false);
  expect(togglesDiscoverShortcut(backspace({ ctrlKey: true }))).toBe(false);
  expect(togglesDiscoverShortcut(backspace({ metaKey: true }))).toBe(false);
  expect(togglesDiscoverShortcut(backspace({ altKey: true }))).toBe(false);
  expect(togglesDiscoverShortcut(backspace({ shiftKey: true }))).toBe(false);
});

test("classifies shortcut targets conservatively and case-insensitively", () => {
  expect(isTextEntryTarget(element("INPUT", "some-future-type"))).toBe(true);
  expect(isTextEntryTarget(element("input", "RANGE"))).toBe(false);
  expect(isTextEntryTarget(element("Input", "Range"))).toBe(false);
  expect(isTextEntryTarget(element("TextArea"))).toBe(true);
  expect(isTextEntryTarget(null)).toBe(false);
});
