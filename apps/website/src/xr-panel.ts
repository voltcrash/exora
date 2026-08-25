/**
 * The holographic screen the in-headset Discover surface is drawn on.
 *
 * An immersive session paints only the Babylon scene, so every DOM control disappears the moment
 * the headset takes over and this plane becomes the whole interface. Two things matter for it to
 * feel like part of the world rather than a sticker on the visor:
 *
 * - it **fills the view when it is open**. Discover covers the canvas completely in the browser,
 *   and it does the same here: a wide plane squarely in front of the wearer, dropped only a few
 *   degrees below a level gaze so its centre sits where the eyes rest. It follows the head's
 *   position and yaw but not its pitch, so walking, turning and teleporting never leave it
 *   behind. `xr-hud-pose.ts` works out the pose.
 * - it is **summoned**, not permanent. A face button opens Discover and dismisses it again, and
 *   while it is dismissed the session carries no floating chrome of any kind — no pads, no pills,
 *   nothing between the wearer and the world.
 *
 * Everything is drawn from core primitives — one canvas texture on one plane — so no
 * `@babylonjs/gui` dependency is pulled into the bundle, and a controller ray picks entries by
 * turning the hit's texture coordinates back into canvas pixels.
 */

import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Axis } from "@babylonjs/core/Maths/math.axis.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents.js";
import type { WebXRCamera } from "@babylonjs/core/XR/webXRCamera.js";
import type { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import type { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource.js";
import type { WebXRAbstractMotionController } from "@babylonjs/core/XR/motionController/webXRAbstractMotionController.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { HUD_DISTANCE, HUD_PITCH_RADIANS, hudPose } from "./xr-hud-pose.ts";
import {
  CONTENT_LEFT,
  hitTestPanel,
  layoutPanel,
  PANEL_METRICS,
  RAIL_TOP,
  type XrCell,
  type XrPanelView,
  type XrPlacement,
  type XrRect,
} from "./xr-panel-layout.ts";

/**
 * Physical size of the screen: wide enough at `HUD_DISTANCE` to subtend roughly 73° by 49°, which
 * is as close to full-screen as a headset can be given without the corners falling outside the
 * display's own field of view.
 */
const PANEL_SIZE = { height: 1.7, width: 2.72 };
/** Supersampling keeps text and fine rules crisp once the screen is angled in the headset. */
const PANEL_TEXTURE_SCALE = 1.25;
const OPEN_SECONDS = 0.16;
/** Drawn after the world so the console always reads, whatever it happens to be floating over. */
const PANEL_RENDERING_GROUP = 2;

const INK = "#eaf9ff";
const DIM = "rgba(154, 206, 232, 0.82)";
const FAINT = "rgba(126, 176, 204, 0.55)";
const ACCENT = "#6fe3ff";

/**
 * A/X and a stick click open Discover, B/Y dismiss it.
 *
 * Two dedicated buttons rather than one toggle, so opening the screen never depends on the wearer
 * remembering whether it is already open — and so nothing has to be left floating in the session
 * as a thing to aim at. When Discover is dismissed the wearer's hands carry no chrome at all.
 */
const SUMMON_BUTTONS = new Set(["a-button", "x-button", "xr-standard-thumbstick"]);
const HIDE_BUTTONS = new Set(["b-button", "y-button"]);

const toneAccent = (cell: XrCell): string => {
  if (cell.disabled) return "rgba(120, 150, 170, 0.35)";
  switch (cell.tone) {
    case "danger":
      return "rgba(255, 138, 118, 0.92)";
    case "primary":
      return "rgba(140, 255, 214, 0.95)";
    case "ghost":
      return "rgba(120, 170, 200, 0.5)";
    default:
      return ACCENT;
  }
};

const roundedRectPath = (context: CanvasRenderingContext2D, rect: XrRect, radius: number): void => {
  const limit = Math.min(radius, rect.width / 2, rect.height / 2);
  const { height, width, x, y } = rect;
  context.beginPath();
  context.moveTo(x + limit, y);
  context.lineTo(x + width - limit, y);
  context.quadraticCurveTo(x + width, y, x + width, y + limit);
  context.lineTo(x + width, y + height - limit);
  context.quadraticCurveTo(x + width, y + height, x + width - limit, y + height);
  context.lineTo(x + limit, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - limit);
  context.lineTo(x, y + limit);
  context.quadraticCurveTo(x, y, x + limit, y);
  context.closePath();
};

/** `letterSpacing` is Chromium-only; the layout is designed to survive it being ignored. */
const setTracking = (context: CanvasRenderingContext2D, pixels: number): void => {
  const tracked = context as CanvasRenderingContext2D & { letterSpacing?: string };
  if (typeof tracked.letterSpacing === "string") tracked.letterSpacing = `${pixels}px`;
};

const font = (weight: number, size: number): string =>
  `${weight} ${size}px 'Inter', 'Segoe UI', system-ui, sans-serif`;

const truncate = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
  if (context.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && context.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
};

const paintCellBody = (
  context: CanvasRenderingContext2D,
  rect: XrRect,
  cell: XrCell,
  radius: number,
): void => {
  const accent = toneAccent(cell);
  const fill = context.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
  if (cell.active) {
    fill.addColorStop(0, "rgba(30, 128, 168, 0.72)");
    fill.addColorStop(1, "rgba(16, 78, 110, 0.6)");
  } else if (cell.disabled) {
    fill.addColorStop(0, "rgba(9, 18, 27, 0.5)");
    fill.addColorStop(1, "rgba(6, 13, 20, 0.5)");
  } else {
    fill.addColorStop(0, "rgba(13, 34, 51, 0.88)");
    fill.addColorStop(1, "rgba(8, 22, 35, 0.82)");
  }
  roundedRectPath(context, rect, radius);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = cell.active ? accent : "rgba(96, 200, 240, 0.26)";
  context.lineWidth = cell.active ? 2.5 : 1.6;
  context.stroke();
};

const paintRow = (context: CanvasRenderingContext2D, rect: XrRect, cell: XrCell): void => {
  paintCellBody(context, rect, cell, 16);

  const accent = toneAccent(cell);
  roundedRectPath(
    context,
    { height: rect.height - 22, width: 6, x: rect.x + 10, y: rect.y + 11 },
    3,
  );
  context.fillStyle = accent;
  context.globalAlpha = cell.disabled ? 0.35 : 0.9;
  context.fill();
  context.globalAlpha = 1;

  let textLimit = rect.width - 66;
  if (cell.badge) {
    context.font = font(600, 20);
    setTracking(context, 1.5);
    const badgeWidth = context.measureText(cell.badge.toUpperCase()).width + 30;
    const badgeRect = {
      height: 38,
      width: badgeWidth,
      x: rect.x + rect.width - badgeWidth - 18,
      y: rect.y + (rect.height - 38) / 2,
    };
    roundedRectPath(context, badgeRect, 19);
    context.fillStyle = "rgba(111, 227, 255, 0.14)";
    context.fill();
    context.strokeStyle = "rgba(111, 227, 255, 0.4)";
    context.lineWidth = 1.4;
    context.stroke();
    context.fillStyle = ACCENT;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(cell.badge.toUpperCase(), badgeRect.x + badgeWidth / 2, badgeRect.y + 20);
    setTracking(context, 0);
    textLimit -= badgeWidth + 16;
  }

  context.textAlign = "left";
  context.fillStyle = cell.disabled ? "rgba(150, 178, 195, 0.6)" : INK;
  context.font = font(600, 30);
  context.textBaseline = cell.detail ? "alphabetic" : "middle";
  const labelX = rect.x + 34;
  context.fillText(
    truncate(context, cell.label, textLimit),
    labelX,
    cell.detail ? rect.y + 42 : rect.y + rect.height / 2,
  );

  if (cell.detail) {
    context.font = font(400, 21);
    context.fillStyle = cell.disabled ? FAINT : DIM;
    setTracking(context, 1.2);
    context.fillText(truncate(context, cell.detail.toUpperCase(), textLimit), labelX, rect.y + 72);
    setTracking(context, 0);
  }
};

const paintGridCell = (context: CanvasRenderingContext2D, rect: XrRect, cell: XrCell): void => {
  paintCellBody(context, rect, cell, 13);
  context.textAlign = "center";
  const centreX = rect.x + rect.width / 2;
  const compact = rect.height < 88 || !cell.detail;
  context.fillStyle = cell.disabled ? "rgba(150, 178, 195, 0.6)" : INK;
  context.font = font(600, compact ? 27 : 26);
  context.textBaseline = "middle";
  if (compact) {
    context.fillText(
      truncate(context, cell.label, rect.width - 20),
      centreX,
      rect.y + rect.height / 2 + 1,
    );
    return;
  }
  context.fillText(truncate(context, cell.label, rect.width - 22), centreX, rect.y + 38);
  context.font = font(400, 19);
  context.fillStyle = DIM;
  setTracking(context, 1);
  context.fillText(
    truncate(context, (cell.detail ?? "").toUpperCase(), rect.width - 22),
    centreX,
    rect.y + rect.height - 30,
  );
  setTracking(context, 0);
};

const paintTab = (context: CanvasRenderingContext2D, rect: XrRect, cell: XrCell): void => {
  paintCellBody(context, rect, cell, rect.height / 2);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = cell.active ? "#f2fdff" : DIM;
  context.font = font(600, 24);
  setTracking(context, 2);
  context.fillText(
    truncate(context, cell.label.toUpperCase(), rect.width - 24),
    rect.x + rect.width / 2,
    rect.y + rect.height / 2 + 1,
  );
  setTracking(context, 0);
};

const paintRailItem = (
  context: CanvasRenderingContext2D,
  rect: XrRect,
  item: { accent?: string; cell: XrCell; glyph: string; index: string; source: string },
): void => {
  const accent = item.accent ?? ACCENT;
  const { cell } = item;
  const fill = context.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y);
  if (cell.active) {
    fill.addColorStop(0, "rgba(24, 104, 140, 0.7)");
    fill.addColorStop(1, "rgba(10, 44, 66, 0.42)");
  } else {
    fill.addColorStop(0, "rgba(10, 26, 40, 0.72)");
    fill.addColorStop(1, "rgba(7, 18, 29, 0.5)");
  }
  roundedRectPath(context, rect, 18);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = cell.active ? accent : "rgba(96, 200, 240, 0.2)";
  context.lineWidth = cell.active ? 2.5 : 1.4;
  context.stroke();

  // The lit spine is how the browser rail marks the open section; it reads at a glance from the
  // far side of a room, where a border weight change does not.
  roundedRectPath(
    context,
    { height: rect.height - 26, width: 6, x: rect.x + 12, y: rect.y + 13 },
    3,
  );
  context.fillStyle = accent;
  context.globalAlpha = cell.active ? 1 : 0.4;
  context.fill();
  context.globalAlpha = 1;

  context.textAlign = "left";
  context.textBaseline = "middle";
  context.font = font(500, 19);
  context.fillStyle = FAINT;
  setTracking(context, 2);
  context.fillText(item.index, rect.x + 34, rect.y + 30);
  setTracking(context, 0);

  context.textAlign = "center";
  context.font = font(500, 40);
  context.fillStyle = accent;
  context.fillText(item.glyph, rect.x + 82, rect.y + rect.height / 2 + 14);

  context.textAlign = "left";
  context.font = font(600, 30);
  context.fillStyle = cell.active ? "#f2fdff" : INK;
  context.fillText(truncate(context, cell.label, rect.width - 150), rect.x + 122, rect.y + 46);
  context.font = font(400, 19);
  context.fillStyle = DIM;
  setTracking(context, 1.6);
  context.fillText(
    truncate(context, item.source.toUpperCase(), rect.width - 150),
    rect.x + 122,
    rect.y + 76,
  );
  setTracking(context, 0);
};

const paintPlacement = (context: CanvasRenderingContext2D, placement: XrPlacement): void => {
  switch (placement.kind) {
    case "rail":
      paintRailItem(context, placement.rect, placement.item);
      return;
    case "row":
      paintRow(context, placement.rect, placement.cell);
      return;
    case "gridCell":
      paintGridCell(context, placement.rect, placement.cell);
      return;
    case "back":
    case "railAction":
    case "tab":
      paintTab(context, placement.rect, placement.cell);
      return;
    case "fact": {
      const { rect } = placement;
      const middle = rect.y + rect.height / 2;
      context.textBaseline = "middle";
      context.textAlign = "left";
      context.font = font(500, 22);
      context.fillStyle = DIM;
      setTracking(context, 1.6);
      context.fillText(placement.label.toUpperCase(), rect.x + 4, middle);
      setTracking(context, 0);
      context.textAlign = "right";
      context.font = font(600, 26);
      context.fillStyle = INK;
      context.fillText(
        truncate(context, placement.value, rect.width * 0.6),
        rect.x + rect.width - 4,
        middle,
      );
      context.beginPath();
      context.moveTo(rect.x, rect.y + rect.height - 1);
      context.lineTo(rect.x + rect.width, rect.y + rect.height - 1);
      context.strokeStyle = "rgba(96, 200, 240, 0.14)";
      context.lineWidth = 1;
      context.stroke();
      return;
    }
    case "note": {
      const { rect } = placement;
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.font = font(400, 23);
      context.fillStyle = DIM;
      placement.lines.forEach((line, index) => {
        context.fillText(line, rect.x + 4, rect.y + 17 + index * PANEL_METRICS.noteLine);
      });
      return;
    }
    case "field": {
      const { rect } = placement;
      roundedRectPath(context, rect, 14);
      context.fillStyle = "rgba(5, 16, 26, 0.9)";
      context.fill();
      context.strokeStyle = "rgba(111, 227, 255, 0.45)";
      context.lineWidth = 2;
      context.stroke();
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.font = font(500, 20);
      context.fillStyle = ACCENT;
      setTracking(context, 2.4);
      context.fillText(placement.label.toUpperCase(), rect.x + 26, rect.y + 30);
      setTracking(context, 0);
      context.font = font(600, 34);
      context.fillStyle = INK;
      context.fillText(
        truncate(context, `${placement.value}▌`, rect.width - 52),
        rect.x + 26,
        rect.y + 70,
      );
      return;
    }
    case "status": {
      const { rect } = placement;
      const colour =
        placement.tone === "danger"
          ? "rgba(255, 150, 128, 0.95)"
          : placement.tone === "primary"
            ? "rgba(140, 255, 214, 0.95)"
            : DIM;
      context.beginPath();
      context.arc(rect.x + 8, rect.y + rect.height / 2, 5, 0, Math.PI * 2);
      context.fillStyle = colour;
      context.fill();
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.font = font(500, 21);
      context.fillStyle = colour;
      setTracking(context, 2);
      context.fillText(
        truncate(context, placement.text.toUpperCase(), rect.width - 40),
        rect.x + 28,
        rect.y + rect.height / 2,
      );
      setTracking(context, 0);
      return;
    }
    case "stepperTrack": {
      const { rect } = placement;
      roundedRectPath(context, rect, 14);
      context.fillStyle = "rgba(9, 24, 38, 0.72)";
      context.fill();
      context.strokeStyle = "rgba(96, 200, 240, 0.2)";
      context.lineWidth = 1.4;
      context.stroke();
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.font = font(500, 24);
      context.fillStyle = DIM;
      setTracking(context, 1.4);
      context.fillText(
        truncate(context, placement.label.toUpperCase(), rect.width * 0.6),
        rect.x + 24,
        rect.y + rect.height / 2,
      );
      setTracking(context, 0);
      context.textAlign = "right";
      context.font = font(600, 28);
      context.fillStyle = INK;
      context.fillText(
        truncate(context, placement.value, rect.width * 0.42),
        rect.x + rect.width - 24,
        rect.y + rect.height / 2,
      );
    }
  }
};

const paintChrome = (context: CanvasRenderingContext2D, view: XrPanelView): void => {
  const { height, padding, width } = PANEL_METRICS;
  context.clearRect(0, 0, width, height);

  const body = { height: height - 8, width: width - 8, x: 4, y: 4 };
  const backdrop = context.createLinearGradient(0, 0, 0, height);
  backdrop.addColorStop(0, "rgb(9, 26, 41)");
  backdrop.addColorStop(0.55, "rgb(5, 16, 27)");
  backdrop.addColorStop(1, "rgb(4, 11, 19)");
  roundedRectPath(context, body, 30);
  context.fillStyle = backdrop;
  context.fill();
  context.strokeStyle = "rgba(111, 227, 255, 0.38)";
  context.lineWidth = 3;
  context.stroke();

  // The rail sits on its own slightly darker ground, the way the browser screen's `aside` does.
  const railPanel = {
    height: height - padding * 2,
    width: PANEL_METRICS.railWidth + padding,
    x: 4,
    y: padding,
  };
  roundedRectPath(context, railPanel, 24);
  context.fillStyle = "rgba(3, 12, 21, 0.55)";
  context.fill();
  context.beginPath();
  context.moveTo(CONTENT_LEFT - padding, padding);
  context.lineTo(CONTENT_LEFT - padding, height - padding);
  context.strokeStyle = "rgba(111, 227, 255, 0.16)";
  context.lineWidth = 2;
  context.stroke();

  const header = context.createLinearGradient(0, 0, 0, PANEL_METRICS.headerRule);
  header.addColorStop(0, "rgba(28, 116, 156, 0.42)");
  header.addColorStop(1, "rgba(28, 116, 156, 0)");
  roundedRectPath(
    context,
    {
      height: PANEL_METRICS.headerRule,
      width: width - CONTENT_LEFT - padding,
      x: CONTENT_LEFT,
      y: body.y,
    },
    30,
  );
  context.fillStyle = header;
  context.fill();

  const rule = context.createLinearGradient(CONTENT_LEFT, 0, width - padding, 0);
  rule.addColorStop(0, "rgba(111, 227, 255, 0.85)");
  rule.addColorStop(1, "rgba(111, 227, 255, 0.05)");
  context.beginPath();
  context.moveTo(CONTENT_LEFT, PANEL_METRICS.headerRule);
  context.lineTo(width - padding, PANEL_METRICS.headerRule);
  context.strokeStyle = rule;
  context.lineWidth = 2;
  context.stroke();

  // Corner brackets, the one piece of pure decoration: they give the plane a physical frame so
  // it reads as a device in the world rather than a floating rectangle of text.
  context.strokeStyle = "rgba(111, 227, 255, 0.75)";
  context.lineWidth = 4;
  const bracket = 44;
  for (const [cornerX, cornerY, stepX, stepY] of [
    [26, 26, 1, 1],
    [width - 26, 26, -1, 1],
    [26, height - 26, 1, -1],
    [width - 26, height - 26, -1, -1],
  ] as const) {
    context.beginPath();
    context.moveTo(cornerX + stepX * bracket, cornerY);
    context.lineTo(cornerX, cornerY);
    context.lineTo(cornerX, cornerY + stepY * bracket);
    context.stroke();
  }

  // Brand mark above the rail: the same EXORA / DISCOVER lockup the browser screen wears.
  const markX = padding + 46;
  const markY = RAIL_TOP - 96;
  context.beginPath();
  context.arc(markX, markY, 26, 0, Math.PI * 2);
  context.strokeStyle = "rgba(111, 227, 255, 0.7)";
  context.lineWidth = 3;
  context.stroke();
  context.beginPath();
  context.arc(markX, markY, 9, 0, Math.PI * 2);
  context.fillStyle = ACCENT;
  context.fill();

  context.textAlign = "left";
  context.textBaseline = "middle";
  context.font = font(700, 34);
  context.fillStyle = INK;
  setTracking(context, 6);
  context.fillText("EXORA", markX + 46, markY - 12);
  setTracking(context, 0);
  context.font = font(500, 20);
  context.fillStyle = ACCENT;
  setTracking(context, 5);
  context.fillText("DISCOVER", markX + 46, markY + 18);
  setTracking(context, 0);

  context.textAlign = "left";
  context.textBaseline = "alphabetic";

  if (view.subtitle) {
    context.font = font(500, 22);
    context.fillStyle = ACCENT;
    setTracking(context, 3.4);
    context.fillText(
      truncate(context, view.subtitle.toUpperCase(), width - CONTENT_LEFT - padding * 2 - 320),
      CONTENT_LEFT,
      86,
    );
    setTracking(context, 0);
  }

  context.fillStyle = INK;
  context.font = font(700, 56);
  setTracking(context, 0.5);
  context.fillText(
    truncate(context, view.title, width - CONTENT_LEFT - padding - 340),
    CONTENT_LEFT,
    150,
  );
  setTracking(context, 0);

  if (view.summary) {
    context.font = font(400, 24);
    context.fillStyle = DIM;
    context.fillText(
      truncate(context, view.summary, width - CONTENT_LEFT - padding * 2),
      CONTENT_LEFT,
      198,
    );
  }

  context.font = font(500, 20);
  context.fillStyle = FAINT;
  context.textAlign = "center";
  setTracking(context, 2.6);
  context.fillText(
    truncate(context, (view.footer ?? "").toUpperCase(), width - CONTENT_LEFT - padding),
    CONTENT_LEFT + (width - CONTENT_LEFT - padding) / 2,
    PANEL_METRICS.footerTop + 34,
  );
  setTracking(context, 0);
};

export interface XrPanel {
  /** Wires the controller buttons and the headset camera the screen is placed relative to. */
  attach: (xr: WebXRDefaultExperience) => void;
  dispose: () => void;
  hide: () => void;
  isVisible: () => boolean;
  /** Restores the panel's fixed placement below the gaze without changing what it shows. */
  recall: () => void;
  setView: (view: XrPanelView) => void;
  /** Shows the panel below the wearer's gaze, centred on where they are facing. */
  summon: () => void;
  toggle: () => void;
  /** Maintains the placement below the gaze and runs the open animation. */
  update: (deltaSeconds: number) => void;
}

export const createXrPanel = (scene: Scene, anisotropy = 4): XrPanel => {
  const root = new TransformNode("xrPanelRoot", scene);
  const orientation = Quaternion.Identity();
  root.rotationQuaternion = orientation;
  root.setEnabled(false);

  const texture = new DynamicTexture(
    "xrPanelTexture",
    {
      height: PANEL_METRICS.height * PANEL_TEXTURE_SCALE,
      width: PANEL_METRICS.width * PANEL_TEXTURE_SCALE,
    },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.hasAlpha = true;
  texture.anisotropicFilteringLevel = anisotropy;

  const material = new StandardMaterial("xrPanelMaterial", scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.White();
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.disableDepthWrite = true;
  material.backFaceCulling = false;

  const screen = MeshBuilder.CreatePlane(
    "xrPanelScreen",
    { height: PANEL_SIZE.height, width: PANEL_SIZE.width },
    scene,
  );
  screen.parent = root;
  screen.material = material;
  screen.applyFog = false;
  screen.isPickable = true;
  screen.renderingGroupId = PANEL_RENDERING_GROUP;
  screen.alphaIndex = 0;

  const highlightMaterial = new StandardMaterial("xrPanelHighlightMaterial", scene);
  highlightMaterial.disableLighting = true;
  highlightMaterial.emissiveColor = new Color3(0.42, 0.86, 1);
  highlightMaterial.alpha = 0.26;
  highlightMaterial.disableDepthWrite = true;
  highlightMaterial.backFaceCulling = false;

  // Hover is a separate quad rather than a repaint: sliding one plane costs nothing, where
  // redrawing a megapixel canvas every time the ray crosses a row would hitch on a headset.
  const highlight = MeshBuilder.CreatePlane("xrPanelHighlight", { height: 1, width: 1 }, scene);
  highlight.parent = root;
  highlight.material = highlightMaterial;
  highlight.applyFog = false;
  highlight.isPickable = false;
  highlight.renderingGroupId = PANEL_RENDERING_GROUP;
  highlight.alphaIndex = 1;
  highlight.setEnabled(false);

  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  context.setTransform(PANEL_TEXTURE_SCALE, 0, 0, PANEL_TEXTURE_SCALE, 0, 0);
  let placements: XrPlacement[] = [];
  let currentView: XrPanelView | null = null;
  let hovered: XrCell | null = null;
  let openProgress = 0;
  let visible = false;

  const paint = (view: XrPanelView): void => {
    paintChrome(context, view);
    for (const placement of placements) paintPlacement(context, placement);
    texture.update();
  };

  const setView = (view: XrPanelView): void => {
    currentView = view;
    placements = layoutPanel(view);
    hovered = null;
    highlight.setEnabled(false);
    paint(view);
  };

  const placeHighlight = (rect: XrRect): void => {
    const scaleX = PANEL_SIZE.width / PANEL_METRICS.width;
    const scaleY = PANEL_SIZE.height / PANEL_METRICS.height;
    highlight.scaling.set(rect.width * scaleX, rect.height * scaleY, 1);
    highlight.position.set(
      (rect.x + rect.width / 2 - PANEL_METRICS.width / 2) * scaleX,
      (PANEL_METRICS.height / 2 - (rect.y + rect.height / 2)) * scaleY,
      -0.004,
    );
    highlight.setEnabled(true);
  };

  let motionControllers: WebXRAbstractMotionController[] = [];
  let lastPointerController: WebXRAbstractMotionController | null = null;

  const pulse = (intensity: number, duration: number): void => {
    void lastPointerController?.pulse(intensity, duration).catch(() => {
      // Haptics are a courtesy; a controller without an actuator simply stays quiet.
    });
  };

  const resolve = (info: PointerInfo): { cell: XrCell; rect: XrRect } | null => {
    const pick = info.pickInfo;
    if (!pick?.hit || pick.pickedMesh !== screen) return null;
    const coordinates = pick.getTextureCoordinates();
    if (!coordinates) return null;
    return hitTestPanel(
      placements,
      coordinates.x * PANEL_METRICS.width,
      (1 - coordinates.y) * PANEL_METRICS.height,
    );
  };

  const pointerObserver: Observer<PointerInfo> | null = scene.onPointerObservable.add((info) => {
    if (!visible) return;
    if (info.type === PointerEventTypes.POINTERMOVE) {
      const hit = resolve(info);
      if (hit?.cell === hovered) return;
      hovered = hit?.cell ?? null;
      if (hit) {
        placeHighlight(hit.rect);
        pulse(0.08, 12);
      } else {
        highlight.setEnabled(false);
      }
      return;
    }
    // Babylon's WebXR controller selection simulates POINTERDOWN on trigger press. POINTERPICK is
    // a browser-style click event and is not consistently emitted by Quest Browser.
    if (info.type !== PointerEventTypes.POINTERDOWN) return;
    const hit = resolve(info);
    if (!hit) return;
    pulse(0.35, 26);
    hit.cell.onSelect?.();
  });

  let camera: WebXRCamera | null = null;
  const eyePosition = new Vector3();
  const headForward = new Vector3();
  const headUp = new Vector3();
  const lookDirection = new Vector3();
  const panelUp = new Vector3();

  const placeHud = (): void => {
    if (!camera) return;
    const eyes = camera.rigCameras;
    const poseCamera = eyes[0] ?? camera;
    if (eyes.length === 0) {
      eyePosition.copyFrom(camera.globalPosition);
    } else {
      eyePosition.setAll(0);
      for (const eye of eyes) eyePosition.addInPlace(eye.globalPosition);
      eyePosition.scaleInPlace(1 / eyes.length);
    }

    headForward.copyFrom(poseCamera.getDirection(Axis.Z)).normalize();
    headUp.copyFrom(poseCamera.getDirection(Axis.Y)).normalize();

    const pose = hudPose(eyePosition, headForward, headUp, HUD_DISTANCE, HUD_PITCH_RADIANS);
    root.position.set(pose.position.x, pose.position.y, pose.position.z);
    lookDirection.set(pose.look.x, pose.look.y, pose.look.z);
    panelUp.set(pose.up.x, pose.up.y, pose.up.z);
    Quaternion.FromLookDirectionLHToRef(lookDirection, panelUp, orientation);
    root.rotationQuaternion = orientation;
  };

  const summon = (): void => {
    visible = true;
    placeHud();
    openProgress = 0.35;
    hovered = null;
    highlight.setEnabled(false);
    material.alpha = 1;
    highlightMaterial.alpha = 0.26;
    root.setEnabled(true);
    root.scaling.setAll(0.92);
    pulse(0.25, 20);
  };

  /** Restores the fixed HUD transform, used after scene-level view changes. */
  const recall = (): void => {
    if (visible) placeHud();
  };

  const hide = (): void => {
    visible = false;
    hovered = null;
    highlight.setEnabled(false);
    root.setEnabled(false);
  };

  const toggle = (): void => (visible ? hide() : summon());

  // The emulated Quest maps controller buttons differently across browsers. C is an explicit
  // desktop-only escape hatch that exercises the exact same summon path as A/X on a headset.
  const onConsoleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "KeyC" && !event.repeat && scene.activeCamera === camera) summon();
  };
  window.addEventListener("keydown", onConsoleKeyDown);

  const bindController = (controller: WebXRInputSource): void => {
    controller.onMotionControllerInitObservable.add((motionController) => {
      motionControllers.push(motionController);
      for (const id of motionController.getComponentIds()) {
        const component = motionController.getComponent(id);
        if (SUMMON_BUTTONS.has(id) || HIDE_BUTTONS.has(id)) {
          component.onButtonStateChangedObservable.add(() => {
            if (component.changes.pressed?.current !== true) return;
            if (SUMMON_BUTTONS.has(id)) summon();
            else hide();
          });
        }
        if (id === "xr-standard-trigger") {
          component.onButtonStateChangedObservable.add(() => {
            if (component.changes.pressed?.current === true) {
              lastPointerController = motionController;
            }
          });
        }
      }
    });
  };

  const attach = (xr: WebXRDefaultExperience): void => {
    camera = xr.baseExperience.camera;
    for (const controller of xr.input.controllers) bindController(controller);
    xr.input.onControllerAddedObservable.add(bindController);
    xr.input.onControllerRemovedObservable.add((controller) => {
      motionControllers = motionControllers.filter(
        (candidate) => candidate !== controller.motionController,
      );
      if (lastPointerController === controller.motionController) lastPointerController = null;
    });
  };

  const update = (deltaSeconds: number): void => {
    if (!visible) return;
    placeHud();
    if (openProgress < 1) {
      openProgress = Math.min(1, openProgress + deltaSeconds / OPEN_SECONDS);
      const eased = openProgress * openProgress * (3 - 2 * openProgress);
      root.scaling.setAll(0.88 + eased * 0.12);
    }
  };

  return {
    attach,
    dispose: () => {
      window.removeEventListener("keydown", onConsoleKeyDown);
      if (pointerObserver) scene.onPointerObservable.remove(pointerObserver);
      motionControllers = [];
      lastPointerController = null;
      highlight.dispose();
      highlightMaterial.dispose();
      screen.dispose();
      material.dispose();
      texture.dispose();
      root.dispose();
    },
    hide,
    isVisible: () => visible,
    recall,
    setView: (view) => {
      setView(view);
      if (visible) root.setEnabled(true);
    },
    summon: () => {
      if (currentView) summon();
    },
    toggle,
    update,
  };
};
