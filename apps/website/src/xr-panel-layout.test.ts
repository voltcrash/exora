import { expect, test } from "vite-plus/test";
import {
  CONTENT_LEFT,
  hitTestPanel,
  homeActionCapacity,
  layoutPanel,
  PANEL_METRICS,
  rowCapacity,
  wrapText,
  type XrCell,
} from "./xr-panel-layout.ts";

const cell = (id: string, extra: Partial<XrCell> = {}): XrCell => ({
  id,
  label: id.toUpperCase(),
  onSelect: () => undefined,
  ...extra,
});

test("stacks blocks down the panel without overlapping", () => {
  const placements = layoutPanel({
    blocks: [
      { cells: [cell("one"), cell("two")], kind: "tabs" },
      { cells: [cell("alpha"), cell("beta")], kind: "rows" },
    ],
    title: "Kepler-22 b",
  });

  const [firstTab, secondTab, firstRow, secondRow] = placements;
  expect(firstTab?.rect.y).toBe(PANEL_METRICS.contentTop);
  expect(secondTab?.rect.x).toBeGreaterThan(firstTab?.rect.x ?? 0);
  expect(firstRow?.rect.y).toBe(
    PANEL_METRICS.contentTop + PANEL_METRICS.tabHeight + PANEL_METRICS.blockGap,
  );
  expect(secondRow?.rect.y).toBe(
    (firstRow?.rect.y ?? 0) + PANEL_METRICS.rowHeight + PANEL_METRICS.rowGap,
  );
});

test("keeps rows from spilling over the hint line", () => {
  const placements = layoutPanel({
    blocks: [
      { cells: Array.from({ length: 40 }, (_, index) => cell(`row-${index}`)), kind: "rows" },
    ],
    title: "Overflow",
  });

  expect(placements.length).toBeLessThan(40);
  for (const placement of placements) {
    expect(placement.rect.y + placement.rect.height).toBeLessThanOrEqual(PANEL_METRICS.footerTop);
  }
});

test("wraps a grid across its columns", () => {
  const placements = layoutPanel({
    blocks: [
      {
        cells: [cell("a"), cell("b"), cell("c"), cell("d")],
        columns: 2,
        height: 100,
        kind: "grid",
      },
    ],
    title: "Grid",
  });

  expect(placements).toHaveLength(4);
  expect(placements[0]?.rect.y).toBe(placements[1]?.rect.y);
  expect(placements[2]?.rect.y).toBe(PANEL_METRICS.contentTop + 100 + PANEL_METRICS.gridGap);
});

test("gives a stepper a track and two buttons", () => {
  const placements = layoutPanel({
    blocks: [
      {
        kind: "steppers",
        rows: [{ decrease: cell("down"), increase: cell("up"), label: "Scale", value: "50%" }],
      },
    ],
    title: "Forge",
  });

  expect(placements.map((placement) => placement.kind)).toEqual([
    "stepperTrack",
    "gridCell",
    "gridCell",
  ]);
  const [, decrease, increase] = placements;
  expect(increase?.rect.x).toBeGreaterThan(decrease?.rect.x ?? 0);
  expect((increase?.rect.x ?? 0) + (increase?.rect.width ?? 0)).toBe(
    PANEL_METRICS.width - PANEL_METRICS.padding,
  );
});

test("finds the cell under a canvas point and ignores inert regions", () => {
  const target = cell("alpha");
  const disabled = cell("beta", { disabled: true });
  const placements = layoutPanel({
    blocks: [{ cells: [target, disabled], kind: "rows" }],
    title: "Hit test",
  });

  const first = placements[0]?.rect;
  const second = placements[1]?.rect;
  expect(hitTestPanel(placements, (first?.x ?? 0) + 10, (first?.y ?? 0) + 10)?.cell).toBe(target);
  expect(hitTestPanel(placements, (second?.x ?? 0) + 10, (second?.y ?? 0) + 10)).toBeNull();
  expect(hitTestPanel(placements, 5, 5)).toBeNull();
});

test("places the back control inside the header", () => {
  const back = cell("back");
  const placements = layoutPanel({ back, blocks: [], title: "Header" });
  const rect = placements[0]?.rect;
  expect(placements[0]?.kind).toBe("back");
  expect((rect?.y ?? 0) + (rect?.height ?? 0)).toBeLessThan(PANEL_METRICS.headerRule);
});

test("wraps prose and ellipsizes past the line budget", () => {
  expect(wrapText("a short line", 40, 3)).toEqual(["a short line"]);
  expect(wrapText("one two three four five", 9, 3)).toEqual(["one two", "three", "four five"]);
  expect(wrapText("one two three four five six", 9, 3)).toEqual(["one two", "three", "four fiv…"]);
  const clipped = wrapText("one two three four five six seven eight", 9, 2);
  expect(clipped).toHaveLength(2);
  expect(clipped[1]?.endsWith("…")).toBe(true);
});

test("reports how many rows are left below a block", () => {
  expect(rowCapacity(0)).toBeGreaterThan(rowCapacity(400));
  expect(rowCapacity(10_000)).toBe(1);
});

test("a home page filled to capacity still places the way out of the session", () => {
  const actions = Array.from({ length: homeActionCapacity() }, (_, index) =>
    cell(`action-${index}`),
  );
  const exit = cell("exit");
  const placements = layoutPanel({
    blocks: [
      { cells: [cell("home"), cell("worlds")], kind: "tabs" },
      { cells: [...actions, exit], kind: "rows" },
    ],
    title: "Crowded destination",
  });

  const placed = placements.flatMap((placement) =>
    "cell" in placement ? [placement.cell.id] : [],
  );
  expect(placed).toContain("exit");
});

test("keeps the rail clear of the workspace", () => {
  const placements = layoutPanel({
    blocks: [{ cells: [cell("alpha"), cell("beta")], kind: "rows" }],
    rail: [
      { cell: cell("solar", { active: true }), glyph: "☉", index: "01", source: "NASA / JPL" },
      { cell: cell("worlds"), glyph: "◎", index: "02", source: "NASA ARCHIVE" },
    ],
    railActions: [cell("close"), cell("exit")],
    title: "Start close to home.",
  });

  const rail = placements.filter((placement) => placement.kind === "rail");
  const actions = placements.filter((placement) => placement.kind === "railAction");
  const rows = placements.filter((placement) => placement.kind === "row");

  expect(rail).toHaveLength(2);
  expect(actions).toHaveLength(2);
  for (const placement of [...rail, ...actions]) {
    expect(placement.rect.x + placement.rect.width).toBeLessThanOrEqual(CONTENT_LEFT);
  }
  for (const row of rows) expect(row.rect.x).toBeGreaterThanOrEqual(CONTENT_LEFT);

  // The rail's own controls own the foot of the column, below every destination.
  const lastRail = rail.at(-1);
  expect(actions[0]?.rect.y).toBeGreaterThan(
    (lastRail?.rect.y ?? 0) + (lastRail?.rect.height ?? 0),
  );
  expect((actions.at(-1)?.rect.y ?? 0) + (actions.at(-1)?.rect.height ?? 0)).toBeLessThanOrEqual(
    PANEL_METRICS.height,
  );
});

test("lays a row block across its columns and keeps each cell pickable", () => {
  const left = cell("left");
  const right = cell("right");
  const placements = layoutPanel({
    blocks: [{ cells: [left, right, cell("wrapped")], columns: 2, kind: "rows" }],
    title: "Two up",
  });

  const [first, second, third] = placements;
  expect(first?.rect.y).toBe(second?.rect.y);
  expect(second?.rect.x).toBeGreaterThan(first?.rect.x ?? 0);
  expect(third?.rect.y).toBe((first?.rect.y ?? 0) + PANEL_METRICS.rowHeight + PANEL_METRICS.rowGap);
  expect(third?.rect.x).toBe(first?.rect.x);
  expect(
    hitTestPanel(placements, (second?.rect.x ?? 0) + 10, (second?.rect.y ?? 0) + 10)?.cell,
  ).toBe(right);
});

test("counts a column's worth of rows per column", () => {
  expect(rowCapacity(0, 2)).toBe(rowCapacity(0) * 2);
});
