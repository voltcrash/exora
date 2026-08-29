import { expect, test } from "vite-plus/test";
import { nextTabIndex, tabId, tabPanelId } from "./tab-list.ts";

test("implements keyboard traversal for tab lists", () => {
  const cases: [string, number, number, number | null][] = [
    ["ArrowRight", 0, 3, 1],
    ["ArrowLeft", 2, 3, 1],
    ["ArrowRight", 2, 3, 0],
    ["ArrowLeft", 0, 3, 2],
    ["Home", 2, 3, 0],
    ["End", 0, 3, 2],
    ["ArrowRight", 0, 0, null],
    ["Home", 0, 0, null],
    ["ArrowRight", -1, 3, 1],
    ["ArrowLeft", 9, 3, 2],
    ["ArrowRight", 0, 1, 0],
    ["ArrowLeft", 0, 1, 0],
  ];

  for (const [key, current, count, expected] of cases) {
    expect(nextTabIndex(key, current, count), `${key} at ${current} of ${count}`).toBe(expected);
  }
  for (const key of ["Tab", "Enter", " ", "Escape", "ArrowUp", "ArrowDown", "a"]) {
    expect(nextTabIndex(key, 1, 3), key).toBeNull();
  }
});

test("ids pair a tab with its panel without colliding across lists", () => {
  expect(tabId("planet-discovery", "filters")).toBe("planet-discovery-tab-filters");
  expect(tabPanelId("planet-discovery", "filters")).toBe("planet-discovery-panel-filters");
  expect(tabId("star-discovery", "collections")).not.toBe(tabId("planet-discovery", "collections"));
});
