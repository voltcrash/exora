/**
 * Layout arithmetic for the in-headset Discover screen.
 *
 * The console is drawn into a single canvas and pointed at with a controller ray, so every
 * interactive region has to exist twice: once as pixels the painter fills, and once as a
 * rectangle the ray can be tested against. Keeping the geometry in one pure pass means the two
 * can never drift apart, and it makes the whole layout testable without a GPU.
 *
 * All numbers here are canvas pixels. `xr-panel.ts` maps them onto the physical panel.
 */

export interface XrRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export type XrTone = "danger" | "default" | "ghost" | "primary";

/** An interactive region. Cells without `onSelect` are inert, which is how a disabled row reads. */
export interface XrCell {
  /** Draws the cell as the current choice, used for tabs and filter chips. */
  active?: boolean;
  badge?: string;
  detail?: string;
  disabled?: boolean;
  id: string;
  label: string;
  onSelect?: () => void;
  tone?: XrTone;
}

export interface XrFact {
  label: string;
  value: string;
}

/**
 * One entry in the left rail, mirroring the flat Discover screen's numbered destination list.
 *
 * The rail is part of the view rather than a block, because it is the one region that never
 * scrolls with the page: whichever section is open, the same six destinations stay reachable in
 * the same place, exactly as the browser screen's `aside` does.
 */
export interface XrRailItem {
  /** Section tint, mirroring the accent each destination wears on the browser screen. */
  accent?: string;
  cell: XrCell;
  glyph: string;
  index: string;
  source: string;
}

export interface XrStepperRow {
  decrease: XrCell;
  increase: XrCell;
  label: string;
  value: string;
}

export type XrBlock =
  | { cells: readonly XrCell[]; columns: number; height: number; kind: "grid" }
  | { cells: readonly XrCell[]; columns?: number; kind: "rows" }
  | { cells: readonly XrCell[]; kind: "tabs" }
  | { facts: readonly XrFact[]; kind: "facts" }
  | { kind: "field"; label: string; value: string }
  | { kind: "note"; text: string }
  | { kind: "status"; text: string; tone?: XrTone }
  | { kind: "steppers"; rows: readonly XrStepperRow[] };

export interface XrPanelView {
  /** Optional header control, drawn top right, used to climb back out of a sub-page. */
  back?: XrCell;
  blocks: readonly XrBlock[];
  footer?: string;
  /** Destination list down the left edge, plus the controls that close the screen. */
  rail?: readonly XrRailItem[];
  /** Rail-footer controls: leaving the screen, and leaving the session. */
  railActions?: readonly XrCell[];
  subtitle?: string;
  /** The one-line summary under the section title, matching the browser screen's header. */
  summary?: string;
  title: string;
}

export type XrPlacement =
  | { cell: XrCell; kind: "back" | "gridCell" | "railAction" | "row" | "tab"; rect: XrRect }
  | { item: XrRailItem; kind: "rail"; rect: XrRect }
  | { kind: "fact"; label: string; rect: XrRect; value: string }
  | { kind: "field"; label: string; rect: XrRect; value: string }
  | { kind: "note"; lines: readonly string[]; rect: XrRect }
  | { kind: "status"; rect: XrRect; text: string; tone: XrTone }
  | { kind: "stepperTrack"; label: string; rect: XrRect; value: string };

export const PANEL_METRICS = {
  backHeight: 62,
  backWidth: 300,
  blockGap: 18,
  contentTop: 268,
  factHeight: 50,
  fieldHeight: 100,
  footerTop: 1_146,
  gridGap: 12,
  headerRule: 242,
  height: 1_200,
  noteLine: 34,
  padding: 44,
  /** Height of one rail destination, sized for a glyph, a name and its archive line. */
  railItemHeight: 108,
  railGap: 12,
  /** Width of the destination rail down the left edge. */
  railWidth: 372,
  rowGap: 12,
  rowHeight: 92,
  statusHeight: 44,
  stepperButton: 78,
  stepperHeight: 82,
  tabGap: 10,
  tabHeight: 64,
  width: 1_920,
} as const;

/** Left edge of everything that is not the rail: header, blocks, footer. */
export const CONTENT_LEFT = PANEL_METRICS.padding * 2 + PANEL_METRICS.railWidth;

const CONTENT_WIDTH = PANEL_METRICS.width - CONTENT_LEFT - PANEL_METRICS.padding;
const CONTENT_BOTTOM = PANEL_METRICS.footerTop - 14;
/** Where the rail's destination list starts, below the Exora brand mark. */
export const RAIL_TOP = 232;
/** How far the destination list may run before the rail's own controls claim the space. */
const RAIL_BOTTOM = PANEL_METRICS.height - PANEL_METRICS.padding - 180;

/**
 * Greedy word wrap against an estimated character width.
 *
 * Measuring through the canvas would be exact but would drag the whole layout into the browser;
 * the console only wraps short summaries, where an estimate that errs narrow is indistinguishable
 * from a measured fit.
 */
export const wrapText = (text: string, maxCharacters: number, maxLines: number): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (lines.length === maxLines) {
      const last = lines[maxLines - 1] ?? "";
      lines[maxLines - 1] = `${last.slice(0, Math.max(0, maxCharacters - 1)).trimEnd()}…`;
      return lines;
    }
    current = word.length > maxCharacters ? `${word.slice(0, maxCharacters - 1)}…` : word;
  }

  if (current && lines.length < maxLines) lines.push(current);
  return lines;
};

/**
 * Scene entries a console home page can carry and still leave room for the exit row.
 *
 * The layout below drops whatever will not fit, last row first, and the way out of the session is
 * the last row — so a destination generous enough with its own actions would quietly take the
 * exit off the panel. One row is reserved for it here rather than trusted to each scene's count.
 */
export const homeActionCapacity = (): number =>
  rowCapacity(PANEL_METRICS.tabHeight + PANEL_METRICS.blockGap) - 1;

/** Rows a list block can show before it would run past the footer, across `columns` columns. */
export const rowCapacity = (topOffset: number, columns = 1): number =>
  Math.max(1, Math.max(1, columns)) *
  Math.max(
    1,
    Math.floor(
      (CONTENT_BOTTOM - (PANEL_METRICS.contentTop + topOffset) + PANEL_METRICS.rowGap) /
        (PANEL_METRICS.rowHeight + PANEL_METRICS.rowGap),
    ),
  );

const blockHeight = (block: XrBlock): number => {
  switch (block.kind) {
    case "tabs":
      return PANEL_METRICS.tabHeight;
    case "rows": {
      const rows = Math.ceil(block.cells.length / Math.max(1, block.columns ?? 1));
      return rows * PANEL_METRICS.rowHeight + Math.max(0, rows - 1) * PANEL_METRICS.rowGap;
    }
    case "grid": {
      const rows = Math.ceil(block.cells.length / Math.max(1, block.columns));
      return rows * block.height + Math.max(0, rows - 1) * PANEL_METRICS.gridGap;
    }
    case "facts":
      return block.facts.length * PANEL_METRICS.factHeight;
    case "note":
      return wrapText(block.text, 96, 4).length * PANEL_METRICS.noteLine;
    case "status":
      return PANEL_METRICS.statusHeight;
    case "field":
      return PANEL_METRICS.fieldHeight;
    case "steppers":
      return (
        block.rows.length * PANEL_METRICS.stepperHeight +
        Math.max(0, block.rows.length - 1) * PANEL_METRICS.rowGap
      );
  }
};

/**
 * Places every block top to bottom, dropping whatever would spill past the footer.
 *
 * Pages paginate their own content, so clipping is a backstop rather than the mechanism: it
 * keeps an unexpectedly long list from painting over the hint line instead of silently
 * producing regions the ray can hit but the wearer cannot see.
 */
export const layoutPanel = (view: XrPanelView): XrPlacement[] => {
  const placements: XrPlacement[] = [];
  const { padding } = PANEL_METRICS;

  if (view.back) {
    placements.push({
      cell: view.back,
      kind: "back",
      rect: {
        height: PANEL_METRICS.backHeight,
        width: PANEL_METRICS.backWidth,
        x: PANEL_METRICS.width - padding - PANEL_METRICS.backWidth,
        y: 40,
      },
    });
  }

  if (view.rail) {
    view.rail.forEach((item, index) => {
      const y = RAIL_TOP + index * (PANEL_METRICS.railItemHeight + PANEL_METRICS.railGap);
      if (y + PANEL_METRICS.railItemHeight > RAIL_BOTTOM) return;
      placements.push({
        item,
        kind: "rail",
        rect: {
          height: PANEL_METRICS.railItemHeight,
          width: PANEL_METRICS.railWidth,
          x: padding,
          y,
        },
      });
    });
  }

  if (view.railActions) {
    const count = view.railActions.length;
    view.railActions.forEach((cell, index) => {
      const y =
        PANEL_METRICS.height -
        padding -
        (count - index) * (PANEL_METRICS.tabHeight + PANEL_METRICS.railGap) +
        PANEL_METRICS.railGap;
      placements.push({
        cell,
        kind: "railAction",
        rect: { height: PANEL_METRICS.tabHeight, width: PANEL_METRICS.railWidth, x: padding, y },
      });
    });
  }

  let cursor = PANEL_METRICS.contentTop;
  for (const block of view.blocks) {
    if (cursor >= CONTENT_BOTTOM) break;

    switch (block.kind) {
      case "tabs": {
        const count = Math.max(1, block.cells.length);
        const width = (CONTENT_WIDTH - PANEL_METRICS.tabGap * (count - 1)) / count;
        block.cells.forEach((cell, index) => {
          placements.push({
            cell,
            kind: "tab",
            rect: {
              height: PANEL_METRICS.tabHeight,
              width,
              x: CONTENT_LEFT + index * (width + PANEL_METRICS.tabGap),
              y: cursor,
            },
          });
        });
        break;
      }
      case "rows": {
        const columns = Math.max(1, block.columns ?? 1);
        const width = (CONTENT_WIDTH - PANEL_METRICS.gridGap * (columns - 1)) / columns;
        block.cells.forEach((cell, index) => {
          const rowY =
            cursor + Math.floor(index / columns) * (PANEL_METRICS.rowHeight + PANEL_METRICS.rowGap);
          if (rowY + PANEL_METRICS.rowHeight > CONTENT_BOTTOM) return;
          placements.push({
            cell,
            kind: "row",
            rect: {
              height: PANEL_METRICS.rowHeight,
              width,
              x: CONTENT_LEFT + (index % columns) * (width + PANEL_METRICS.gridGap),
              y: rowY,
            },
          });
        });
        break;
      }
      case "grid": {
        const columns = Math.max(1, block.columns);
        const width = (CONTENT_WIDTH - PANEL_METRICS.gridGap * (columns - 1)) / columns;
        block.cells.forEach((cell, index) => {
          const column = index % columns;
          const row = Math.floor(index / columns);
          const y = cursor + row * (block.height + PANEL_METRICS.gridGap);
          if (y + block.height > CONTENT_BOTTOM) return;
          placements.push({
            cell,
            kind: "gridCell",
            rect: {
              height: block.height,
              width,
              x: CONTENT_LEFT + column * (width + PANEL_METRICS.gridGap),
              y,
            },
          });
        });
        break;
      }
      case "facts": {
        block.facts.forEach((fact, index) => {
          if (cursor + (index + 1) * PANEL_METRICS.factHeight > CONTENT_BOTTOM) return;
          placements.push({
            kind: "fact",
            label: fact.label,
            rect: {
              height: PANEL_METRICS.factHeight,
              width: CONTENT_WIDTH,
              x: CONTENT_LEFT,
              y: cursor + index * PANEL_METRICS.factHeight,
            },
            value: fact.value,
          });
        });
        break;
      }
      case "note": {
        const room = Math.floor((CONTENT_BOTTOM - cursor) / PANEL_METRICS.noteLine);
        if (room <= 0) break;
        const lines = wrapText(block.text, 96, Math.min(4, room));
        placements.push({
          kind: "note",
          lines,
          rect: {
            height: lines.length * PANEL_METRICS.noteLine,
            width: CONTENT_WIDTH,
            x: CONTENT_LEFT,
            y: cursor,
          },
        });
        break;
      }
      case "status": {
        if (cursor + PANEL_METRICS.statusHeight > CONTENT_BOTTOM) break;
        placements.push({
          kind: "status",
          rect: {
            height: PANEL_METRICS.statusHeight,
            width: CONTENT_WIDTH,
            x: CONTENT_LEFT,
            y: cursor,
          },
          text: block.text,
          tone: block.tone ?? "default",
        });
        break;
      }
      case "field": {
        if (cursor + PANEL_METRICS.fieldHeight > CONTENT_BOTTOM) break;
        placements.push({
          kind: "field",
          label: block.label,
          rect: {
            height: PANEL_METRICS.fieldHeight,
            width: CONTENT_WIDTH,
            x: CONTENT_LEFT,
            y: cursor,
          },
          value: block.value,
        });
        break;
      }
      case "steppers": {
        let rowY = cursor;
        for (const row of block.rows) {
          if (rowY + PANEL_METRICS.stepperHeight > CONTENT_BOTTOM) break;
          const buttonY = rowY + (PANEL_METRICS.stepperHeight - PANEL_METRICS.stepperButton) / 2;
          const increaseX = CONTENT_LEFT + CONTENT_WIDTH - PANEL_METRICS.stepperButton;
          const decreaseX = increaseX - PANEL_METRICS.stepperButton - PANEL_METRICS.gridGap;
          placements.push(
            {
              kind: "stepperTrack",
              label: row.label,
              rect: {
                height: PANEL_METRICS.stepperHeight,
                width: decreaseX - CONTENT_LEFT - PANEL_METRICS.gridGap,
                x: CONTENT_LEFT,
                y: rowY,
              },
              value: row.value,
            },
            {
              cell: row.decrease,
              kind: "gridCell",
              rect: {
                height: PANEL_METRICS.stepperButton,
                width: PANEL_METRICS.stepperButton,
                x: decreaseX,
                y: buttonY,
              },
            },
            {
              cell: row.increase,
              kind: "gridCell",
              rect: {
                height: PANEL_METRICS.stepperButton,
                width: PANEL_METRICS.stepperButton,
                x: increaseX,
                y: buttonY,
              },
            },
          );
          rowY += PANEL_METRICS.stepperHeight + PANEL_METRICS.rowGap;
        }
        break;
      }
    }

    cursor += blockHeight(block) + PANEL_METRICS.blockGap;
  }

  return placements;
};

const contains = (rect: XrRect, x: number, y: number): boolean =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

/** The cell under a canvas-space point, or null where the wearer is pointing at bare panel. */
export const hitTestPanel = (
  placements: readonly XrPlacement[],
  x: number,
  y: number,
): { cell: XrCell; rect: XrRect } | null => {
  for (const placement of placements) {
    if (!("cell" in placement) || !contains(placement.rect, x, y)) continue;
    if (placement.cell.disabled || !placement.cell.onSelect) return null;
    return { cell: placement.cell, rect: placement.rect };
  }
  return null;
};
