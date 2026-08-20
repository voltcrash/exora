/**
 * The holographic panel the in-headset console is drawn on.
 *
 * An immersive session paints only the Babylon scene, so every DOM control disappears the moment
 * the headset takes over and the panel becomes the whole interface. Two things matter for it to
 * feel like part of the world rather than a sticker on the visor:
 *
 * - it is **world-locked**. Summoning it drops it in front of the wearer once; after that it stays
 *   where it was left, so looking at the planet means looking away from the panel instead of
 *   dragging it across the view.
 * - it is **summoned**, not permanent. A face button (or the pad on the wearer's wrist) recalls it
 *   to arm's length and dismisses it again, which is what keeps a viewing session unobstructed.
 *
 * Everything is drawn from core primitives — one canvas texture on one plane — so no
 * `@babylonjs/gui` dependency is pulled into the bundle, and a controller ray picks entries by
 * turning the hit's texture coordinates back into canvas pixels.
 */

import { ActionManager } from "@babylonjs/core/Actions/actionManager.js";
import { ExecuteCodeAction } from "@babylonjs/core/Actions/directActions.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Axis } from "@babylonjs/core/Maths/math.axis.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
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
import {
  hitTestPanel,
  layoutPanel,
  PANEL_METRICS,
  type XrCell,
  type XrPanelView,
  type XrPlacement,
  type XrRect,
} from "./xr-panel-layout.ts";

/** Physical size of the panel, chosen so a full page reads without eye movement at arm's length. */
const PANEL_SIZE = { height: 1.15, width: 0.92 };
/** Supersampling keeps text and fine rules crisp once the panel is angled in the headset. */
const PANEL_TEXTURE_SCALE = 2;
/** How far from the wearer a summoned panel lands. */
const SUMMON_DISTANCE = 1.55;
/** How far below eye level it lands, which keeps it comfortably inside a controller ray. */
const SUMMON_DROP = 0.52;
/**
 * The console opens to the wearer's left instead of on the optical axis. It remains world-locked
 * after that one placement, so the planet or star stays unobstructed without putting the panel
 * outside the headset's forward field of view.
 */
const SUMMON_YAW = -Math.PI * 0.16;
/** Past this the panel has been walked away from and is recalled within reach. */
const ABANDON_DISTANCE = 5;
/** The panel stays world-locked until it leaves the useful horizontal field of view. */
const RECALL_ANGLE = Math.PI * 0.25;
const OPEN_SECONDS = 0.16;
/** Drawn after the world so the console always reads, whatever it happens to be floating over. */
const PANEL_RENDERING_GROUP = 2;

const INK = "#eaf9ff";
const DIM = "rgba(154, 206, 232, 0.82)";
const FAINT = "rgba(126, 176, 204, 0.55)";
const ACCENT = "#6fe3ff";

/** A/X and a stick click are unambiguous "bring it here" inputs, even if it is already open. */
const SUMMON_BUTTONS = new Set(["a-button", "x-button", "xr-standard-thumbstick"]);
/** B/Y dismiss the panel, so opening it never depends on remembering its previous state. */
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

const paintPlacement = (context: CanvasRenderingContext2D, placement: XrPlacement): void => {
  switch (placement.kind) {
    case "row":
      paintRow(context, placement.rect, placement.cell);
      return;
    case "gridCell":
      paintGridCell(context, placement.rect, placement.cell);
      return;
    case "tab":
    case "back":
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

  const header = context.createLinearGradient(0, 0, 0, PANEL_METRICS.headerRule);
  header.addColorStop(0, "rgba(28, 116, 156, 0.42)");
  header.addColorStop(1, "rgba(28, 116, 156, 0)");
  roundedRectPath(
    context,
    { height: PANEL_METRICS.headerRule, width: body.width, x: body.x, y: body.y },
    30,
  );
  context.fillStyle = header;
  context.fill();

  const rule = context.createLinearGradient(padding, 0, width - padding, 0);
  rule.addColorStop(0, "rgba(111, 227, 255, 0.85)");
  rule.addColorStop(1, "rgba(111, 227, 255, 0.05)");
  context.beginPath();
  context.moveTo(padding, PANEL_METRICS.headerRule);
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

  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = INK;
  context.font = font(700, 46);
  setTracking(context, 0.5);
  context.fillText(truncate(context, view.title, width - padding * 2 - 160), padding, 88);
  setTracking(context, 0);

  if (view.subtitle) {
    context.font = font(500, 22);
    context.fillStyle = ACCENT;
    setTracking(context, 3);
    context.fillText(
      truncate(context, view.subtitle.toUpperCase(), width - padding * 2 - 160),
      padding,
      126,
    );
    setTracking(context, 0);
  }

  context.font = font(500, 20);
  context.fillStyle = FAINT;
  context.textAlign = "center";
  setTracking(context, 2.6);
  context.fillText(
    truncate(context, (view.footer ?? "").toUpperCase(), width - padding * 2),
    width / 2,
    PANEL_METRICS.footerTop + 34,
  );
  setTracking(context, 0);
};

export interface XrPanel {
  /** Wires controller buttons, the wrist pad, and the head pose the panel anchors against. */
  attach: (xr: WebXRDefaultExperience) => void;
  dispose: () => void;
  hide: () => void;
  isVisible: () => boolean;
  /** Moves an open panel back within reach without changing what it shows. */
  recall: () => void;
  setView: (view: XrPanelView) => void;
  /** Shows the panel and re-anchors it at arm's length in front of the wearer. */
  summon: () => void;
  toggle: () => void;
  /** Runs the open animation and drops the panel if it has been walked away from. */
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
  /**
   * Frames to wait before reading the head pose. Teleporting the rig (entering a session,
   * recentring, swapping view) only reaches the camera's world matrix on a later frame, so
   * anchoring immediately would leave the panel behind at the wearer's previous position.
   */
  let pendingFrames = 0;

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
    if (info.type !== PointerEventTypes.POINTERPICK) return;
    const hit = resolve(info);
    if (!hit) return;
    pulse(0.35, 26);
    hit.cell.onSelect?.();
  });

  let camera: WebXRCamera | null = null;
  const anchorPosition = new Vector3();
  const eyePosition = new Vector3();
  const eyeForward = new Vector3();

  /**
   * Reads where the wearer's eyes actually are.
   *
   * The rig camera is the one the frame is rendered from. Its parent — the `WebXRCamera` — is
   * the rig's own idea of where it stands, and the two only agree while the reference space
   * offset a teleport asks for is honoured. Anchoring against the eyes keeps the panel in front
   * of the wearer either way.
   */
  const readEye = (): boolean => {
    if (!camera) return false;
    const eyes = camera.rigCameras;
    if (eyes.length === 0) {
      eyePosition.copyFrom(camera.globalPosition);
      eyeForward.copyFrom(camera.getDirection(Axis.Z));
      return true;
    }
    eyePosition.setAll(0);
    for (const eye of eyes) eyePosition.addInPlace(eye.globalPosition);
    eyePosition.scaleInPlace(1 / eyes.length);
    eyeForward.copyFrom((eyes[0] ?? camera).getDirection(Axis.Z));
    return true;
  };

  const anchor = (): void => {
    if (!readEye()) return;
    const flat = new Vector3(eyeForward.x, 0, eyeForward.z);
    if (flat.lengthSquared() < 1e-4) flat.set(0, 0, 1);
    flat.normalize();

    const right = new Vector3(flat.z, 0, -flat.x);
    const summonDirection = flat
      .scale(Math.cos(SUMMON_YAW))
      .addInPlace(right.scale(Math.sin(SUMMON_YAW)))
      .normalize();

    anchorPosition.set(
      eyePosition.x + summonDirection.x * SUMMON_DISTANCE,
      eyePosition.y - SUMMON_DROP,
      eyePosition.z + summonDirection.z * SUMMON_DISTANCE,
    );
    root.position.copyFrom(anchorPosition);

    // A Babylon plane faces its own -Z, and `FromLookDirectionLH` puts +Z opposite the direction
    // it is given, so handing it the direction back towards the wearer turns the front face —
    // and the texture, unmirrored — squarely towards the eyes. The up vector has to be made
    // orthogonal to that direction or the basis comes out skewed, which is what tilts the panel
    // back to meet a gaze aimed below eye level.
    const toViewer = eyePosition.subtract(anchorPosition).normalize();
    const upright = Vector3.UpReadOnly.subtract(
      toViewer.scale(Vector3.Dot(Vector3.UpReadOnly, toViewer)),
    );
    if (upright.lengthSquared() < 1e-4) upright.copyFrom(Vector3.UpReadOnly);
    upright.normalize();
    Quaternion.FromLookDirectionLHToRef(toViewer, upright, orientation);
    root.rotationQuaternion = orientation;
  };

  const summon = (): void => {
    visible = true;
    // Put the panel somewhere useful immediately. In a real headset the first stable eye pose
    // arrives over the next couple of frames, but waiting for that pose while the material is
    // transparent made the console disappear forever whenever a browser briefly withheld its XR
    // rig camera (notably Quest Browser and IWER). Keep the material fully opaque throughout the
    // scale-in animation; the delayed anchors below still refine the world-locked placement once
    // tracking has settled.
    anchor();
    openProgress = 0.35;
    pendingFrames = 2;
    hovered = null;
    highlight.setEnabled(false);
    material.alpha = 1;
    highlightMaterial.alpha = 0.26;
    root.setEnabled(true);
    root.scaling.setAll(0.92);
    for (const pad of wristPads) pad.setEnabled(false);
    pulse(0.25, 20);
  };

  /** Re-anchors an open panel, used when the scene teleports the wearer somewhere else. */
  const recall = (): void => {
    if (visible) pendingFrames = 2;
  };

  const hide = (): void => {
    visible = false;
    hovered = null;
    highlight.setEnabled(false);
    root.setEnabled(false);
    for (const pad of wristPads) pad.setEnabled(true);
  };

  const toggle = (): void => (visible ? hide() : summon());

  // The emulated Quest maps controller buttons differently across browsers. C is an explicit
  // desktop-only escape hatch that exercises the exact same summon path as A/X on a headset.
  const onConsoleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "KeyC" && !event.repeat && scene.activeCamera === camera) summon();
  };
  window.addEventListener("keydown", onConsoleKeyDown);

  const wristPads: Mesh[] = [];

  /**
   * A pad on the back of each hand, so the panel can be recalled without knowing which face
   * button does it — and so hand tracking, which has no buttons at all, can still summon it.
   */
  const createWristPad = (controller: WebXRInputSource): void => {
    const parent = controller.grip ?? controller.pointer;
    const padTexture = new DynamicTexture(
      "xrWristPadTexture",
      { height: 128, width: 256 },
      scene,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    padTexture.hasAlpha = true;
    const padContext = padTexture.getContext() as unknown as CanvasRenderingContext2D;
    roundedRectPath(padContext, { height: 116, width: 244, x: 6, y: 6 }, 26);
    padContext.fillStyle = "rgba(7, 24, 38, 0.9)";
    padContext.fill();
    padContext.strokeStyle = "rgba(111, 227, 255, 0.75)";
    padContext.lineWidth = 4;
    padContext.stroke();
    padContext.fillStyle = INK;
    padContext.font = font(600, 40);
    padContext.textAlign = "center";
    padContext.textBaseline = "middle";
    padContext.fillText("CONSOLE", 128, 64);
    padTexture.update();

    const padMaterial = new StandardMaterial("xrWristPadMaterial", scene);
    padMaterial.disableLighting = true;
    padMaterial.emissiveColor = Color3.White();
    padMaterial.diffuseTexture = padTexture;
    padMaterial.emissiveTexture = padTexture;
    padMaterial.useAlphaFromDiffuseTexture = true;
    padMaterial.disableDepthWrite = true;
    padMaterial.backFaceCulling = false;

    const pad = MeshBuilder.CreatePlane("xrWristPad", { height: 0.036, width: 0.072 }, scene);
    pad.parent = parent;
    pad.material = padMaterial;
    pad.position.set(0, 0.052, 0.028);
    pad.rotation.x = Math.PI / 2 - 0.5;
    pad.isPickable = true;
    pad.applyFog = false;
    pad.renderingGroupId = PANEL_RENDERING_GROUP;
    pad.setEnabled(!visible);
    // ActionManager uses Babylon's XR pointer-selection path directly. This is more reliable on
    // Quest and in IWER than waiting for a browser-style POINTERPICK notification on the scene.
    pad.actionManager = new ActionManager(scene);
    pad.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        pulse(0.35, 26);
        toggle();
      }),
    );
    wristPads.push(pad);
  };

  const bindController = (controller: WebXRInputSource): void => {
    controller.onMotionControllerInitObservable.add((motionController) => {
      motionControllers.push(motionController);
      createWristPad(controller);
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
    if (pendingFrames > 0) {
      pendingFrames -= 1;
      if (pendingFrames === 0) anchor();
      return;
    }
    if (openProgress < 1) {
      openProgress = Math.min(1, openProgress + deltaSeconds / OPEN_SECONDS);
      const eased = openProgress * openProgress * (3 - 2 * openProgress);
      root.scaling.setAll(0.88 + eased * 0.12);
    }
    if (!readEye()) return;

    const toPanel = anchorPosition.subtract(eyePosition);
    const distance = toPanel.length();
    toPanel.y = 0;
    const flatForward = new Vector3(eyeForward.x, 0, eyeForward.z);
    if (toPanel.lengthSquared() > 1e-4 && flatForward.lengthSquared() > 1e-4) {
      toPanel.normalize();
      flatForward.normalize();
      const outsideView = Vector3.Dot(flatForward, toPanel) < Math.cos(RECALL_ANGLE);
      if (outsideView || distance > ABANDON_DISTANCE) anchor();
    }
  };

  return {
    attach,
    dispose: () => {
      window.removeEventListener("keydown", onConsoleKeyDown);
      if (pointerObserver) scene.onPointerObservable.remove(pointerObserver);
      for (const pad of wristPads) {
        pad.material?.dispose(true, true);
        pad.dispose();
      }
      wristPads.length = 0;
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
