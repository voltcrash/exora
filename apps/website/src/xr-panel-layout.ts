/**
 * Layout arithmetic for the in-headset console.
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

export interface XrStepperRow {
  decrease: XrCell;
  increase: XrCell;
  label: string;
  value: string;
}

export type XrBlock =
  | { cells: readonly XrCell[]; columns: number; height: number; kind: "grid" }
  | { cells: readonly XrCell[]; kind: "rows" }
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
  subtitle?: string;
  title: string;
}

export type XrPlacement =
  | { cell: XrCell; kind: "back" | "gridCell" | "row" | "tab"; rect: XrRect }
  | { kind: "fact"; label: string; rect: XrRect; value: string }
  | { kind: "field"; label: string; rect: XrRect; value: string }
  | { kind: "note"; lines: readonly string[]; rect: XrRect }
  | { kind: "status"; rect: XrRect; text: string; tone: XrTone }
  | { kind: "stepperTrack"; label: string; rect: XrRect; value: string };

export const PANEL_METRICS = {
  backHeight: 58,
  backWidth: 138,
  blockGap: 18,
  contentTop: 182,
  factHeight: 50,
  fieldHeight: 100,
  footerTop: 1_212,
  gridGap: 10,
  headerRule: 156,
  height: 1_280,
  noteLine: 34,
  padding: 44,
  rowGap: 12,
  rowHeight: 92,
  statusHeight: 44,
  stepperButton: 78,
  stepperHeight: 82,
  tabGap: 10,
  tabHeight: 64,
  width: 1_024,
} as const;

const CONTENT_WIDTH = PANEL_METRICS.width - PANEL_METRICS.padding * 2;
const CONTENT_BOTTOM = PANEL_METRICS.footerTop - 14;

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

/** Rows a list block can show before it would run past the footer. */
export const rowCapacity = (topOffset: number): number =>
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
    case "rows":
      return (
        block.cells.length * PANEL_METRICS.rowHeight +
        Math.max(0, block.cells.length - 1) * PANEL_METRICS.rowGap
      );
    case "grid": {
      const rows = Math.ceil(block.cells.length / Math.max(1, block.columns));
      return rows * block.height + Math.max(0, rows - 1) * PANEL_METRICS.gridGap;
    }
    case "facts":
      return block.facts.length * PANEL_METRICS.factHeight;
    case "note":
      return wrapText(block.text, 62, 4).length * PANEL_METRICS.noteLine;
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
              x: padding + index * (width + PANEL_METRICS.tabGap),
              y: cursor,
            },
          });
        });
        break;
      }
      case "rows": {
        let rowY = cursor;
        for (const cell of block.cells) {
          if (rowY + PANEL_METRICS.rowHeight > CONTENT_BOTTOM) break;
          placements.push({
            cell,
            kind: "row",
            rect: { height: PANEL_METRICS.rowHeight, width: CONTENT_WIDTH, x: padding, y: rowY },
          });
          rowY += PANEL_METRICS.rowHeight + PANEL_METRICS.rowGap;
        }
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
              x: padding + column * (width + PANEL_METRICS.gridGap),
              y,
            },
          });
        });
        break;
      }
      case "facts": {
        block.facts.forEach((fact, index) => {
          placements.push({
            kind: "fact",
            label: fact.label,
            rect: {
              height: PANEL_METRICS.factHeight,
              width: CONTENT_WIDTH,
              x: padding,
              y: cursor + index * PANEL_METRICS.factHeight,
            },
            value: fact.value,
          });
        });
        break;
      }
      case "note": {
        const lines = wrapText(block.text, 62, 4);
        placements.push({
          kind: "note",
          lines,
          rect: {
            height: lines.length * PANEL_METRICS.noteLine,
            width: CONTENT_WIDTH,
            x: padding,
            y: cursor,
          },
        });
        break;
      }
      case "status": {
        placements.push({
          kind: "status",
          rect: {
            height: PANEL_METRICS.statusHeight,
            width: CONTENT_WIDTH,
            x: padding,
            y: cursor,
          },
          text: block.text,
          tone: block.tone ?? "default",
        });
        break;
      }
      case "field": {
        placements.push({
          kind: "field",
          label: block.label,
          rect: {
            height: PANEL_METRICS.fieldHeight,
            width: CONTENT_WIDTH,
            x: padding,
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
          const increaseX = padding + CONTENT_WIDTH - PANEL_METRICS.stepperButton;
          const decreaseX = increaseX - PANEL_METRICS.stepperButton - PANEL_METRICS.gridGap;
          placements.push(
            {
              kind: "stepperTrack",
              label: row.label,
              rect: {
                height: PANEL_METRICS.stepperHeight,
                width: decreaseX - padding - PANEL_METRICS.gridGap,
                x: padding,
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
