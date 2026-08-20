import { expect, test } from "vite-plus/test";
import { nextTabIndex, tabId, tabPanelId } from "./tab-list.ts";

test("arrow keys step through the list", () => {
  expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
  expect(nextTabIndex("ArrowLeft", 2, 3)).toBe(1);
});

test("arrow keys wrap at both ends so a short list feels continuous", () => {
  expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
  expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
});

test("home and end jump to the ends", () => {
  expect(nextTabIndex("Home", 2, 3)).toBe(0);
  expect(nextTabIndex("End", 0, 3)).toBe(2);
});

test("keys the page owns are left alone", () => {
  for (const key of ["Tab", "Enter", " ", "Escape", "ArrowUp", "ArrowDown", "a"]) {
    expect(nextTabIndex(key, 1, 3)).toBeNull();
  }
});

test("an empty list never moves", () => {
  expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  expect(nextTabIndex("Home", 0, 0)).toBeNull();
});

test("a selection outside the list still traverses from the first tab", () => {
  expect(nextTabIndex("ArrowRight", -1, 3)).toBe(1);
  expect(nextTabIndex("ArrowLeft", 9, 3)).toBe(2);
});

test("a single tab stays put rather than dividing by zero", () => {
  expect(nextTabIndex("ArrowRight", 0, 1)).toBe(0);
  expect(nextTabIndex("ArrowLeft", 0, 1)).toBe(0);
});

test("ids pair a tab with its panel without colliding across lists", () => {
  expect(tabId("planet-discovery", "filters")).toBe("planet-discovery-tab-filters");
  expect(tabPanelId("planet-discovery", "filters")).toBe("planet-discovery-panel-filters");
  expect(tabId("star-discovery", "collections")).not.toBe(tabId("planet-discovery", "collections"));
});
