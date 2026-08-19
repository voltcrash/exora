/**
 * In-headset control panel.
 *
 * An immersive session paints only the Babylon scene, so every DOM control disappears the
 * moment the headset takes over. Without an in-world panel a visitor who enters VR can look
 * around and walk, but cannot change view, travel, or leave the session. This module draws a
 * small holographic panel from core primitives (no `@babylonjs/gui` dependency) that the
 * controller ray can point at, and lazily follows the wearer so it is always within reach
 * without swimming in front of their eyes.
 */

import { ActionManager } from "@babylonjs/core/Actions/actionManager.js";
import { ExecuteCodeAction } from "@babylonjs/core/Actions/directActions.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";

export interface XrMenuItem {
  /** Stable identifier, only used to keep React-free diffing simple. */
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
  onSelect: () => void;
}

/** Anything with a world position and a yaw is enough to anchor the panel. */
export interface XrMenuAnchor {
  globalPosition: Vector3;
  rotationQuaternion: { w: number; x: number; y: number; z: number } | null;
}

export interface XrMenu {
  dispose: () => void;
  setItems: (items: readonly XrMenuItem[]) => void;
  setTitle: (title: string) => void;
  setVisible: (visible: boolean) => void;
  /** Re-anchors the panel in front of the wearer. Call once per frame while in session. */
  update: (anchor: XrMenuAnchor, deltaSeconds: number) => void;
}

const PANEL_WIDTH = 1.16;
const BUTTON_WIDTH = 1.02;
const BUTTON_HEIGHT = 0.15;
const BUTTON_GAP = 0.028;
const TITLE_HEIGHT = 0.1;
const FOLLOW_DISTANCE = 1.15;
const FOLLOW_DROP = 0.44;
const YAW_DEADZONE = 0.44;
const YAW_SETTLED = 0.05;
const MENU_RENDERING_GROUP = 2;

const yawOf = (anchor: XrMenuAnchor): number => {
  const quaternion = anchor.rotationQuaternion;
  if (!quaternion) return 0;
  const { w, x, y, z } = quaternion;
  return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + x * x));
};

const wrapAngle = (angle: number): number => {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
};

const drawButtonTexture = (texture: DynamicTexture, item: XrMenuItem, hovered: boolean): void => {
  // Babylon narrows the context to its own portable interface; in a browser it is the real 2D
  // context, and text alignment is needed to keep labels centred inside each button.
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  const { width, height } = texture.getSize();
  context.clearRect(0, 0, width, height);
  context.fillStyle = item.disabled
    ? "rgba(8, 16, 26, 0.72)"
    : hovered
      ? "rgba(24, 132, 168, 0.94)"
      : "rgba(9, 26, 40, 0.86)";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = item.disabled
    ? "rgba(90, 120, 140, 0.35)"
    : hovered
      ? "rgba(180, 244, 255, 0.95)"
      : "rgba(96, 214, 255, 0.6)";
  context.lineWidth = 4;
  context.strokeRect(2, 2, width - 4, height - 4);

  const hasDetail = Boolean(item.detail);
  context.fillStyle = item.disabled ? "rgba(150, 175, 190, 0.6)" : "#eafbff";
  context.font = "600 34px 'Inter', 'Segoe UI', system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = hasDetail ? "alphabetic" : "middle";
  context.fillText(item.label.toUpperCase(), 28, hasDetail ? height * 0.44 : height / 2);

  if (item.detail) {
    context.fillStyle = "rgba(150, 208, 232, 0.85)";
    context.font = "400 22px 'Inter', 'Segoe UI', system-ui, sans-serif";
    context.fillText(item.detail.toUpperCase(), 28, height * 0.78);
  }
  texture.update();
};

/**
 * The wearer looks at the panel from behind its plane, which samples the texture reversed, so
 * the horizontal mapping is flipped to make labels read the right way round.
 */
const mirrorHorizontally = (texture: DynamicTexture): void => {
  texture.uScale = -1;
  texture.uOffset = 1;
};

export const createXrMenu = (scene: Scene, title: string): XrMenu => {
  const root = new TransformNode("xrMenuRoot", scene);
  root.setEnabled(false);

  const backdrop = MeshBuilder.CreatePlane(
    "xrMenuBackdrop",
    { width: PANEL_WIDTH, height: 1 },
    scene,
  );
  backdrop.parent = root;
  backdrop.isPickable = false;
  backdrop.applyFog = false;
  backdrop.renderingGroupId = MENU_RENDERING_GROUP;
  const backdropMaterial = new StandardMaterial("xrMenuBackdropMaterial", scene);
  backdropMaterial.disableLighting = true;
  backdropMaterial.emissiveColor = new Color3(0.02, 0.07, 0.11);
  backdropMaterial.alpha = 0.72;
  backdropMaterial.backFaceCulling = false;
  backdrop.material = backdropMaterial;

  const titleTexture = new DynamicTexture(
    "xrMenuTitleTexture",
    { width: 512, height: 56 },
    scene,
    false,
  );
  titleTexture.hasAlpha = true;
  mirrorHorizontally(titleTexture);
  const titleMaterial = new StandardMaterial("xrMenuTitleMaterial", scene);
  titleMaterial.disableLighting = true;
  titleMaterial.emissiveColor = Color3.White();
  titleMaterial.diffuseTexture = titleTexture;
  titleMaterial.emissiveTexture = titleTexture;
  titleMaterial.useAlphaFromDiffuseTexture = true;
  titleMaterial.backFaceCulling = false;
  const titlePlane = MeshBuilder.CreatePlane(
    "xrMenuTitle",
    { width: BUTTON_WIDTH, height: TITLE_HEIGHT },
    scene,
  );
  titlePlane.parent = root;
  titlePlane.material = titleMaterial;
  titlePlane.isPickable = false;
  titlePlane.applyFog = false;
  titlePlane.renderingGroupId = MENU_RENDERING_GROUP;

  const paintTitle = (text: string): void => {
    const context = titleTexture.getContext() as unknown as CanvasRenderingContext2D;
    const { width, height } = titleTexture.getSize();
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(120, 226, 255, 0.92)";
    context.font = "600 28px 'Inter', 'Segoe UI', system-ui, sans-serif";
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText(text.toUpperCase(), 24, height / 2);
    titleTexture.update();
  };
  paintTitle(title);

  interface Button {
    mesh: Mesh;
    texture: DynamicTexture;
  }
  let buttons: Button[] = [];

  const clearButtons = (): void => {
    for (const button of buttons) {
      button.mesh.material?.dispose();
      button.texture.dispose();
      button.mesh.dispose();
    }
    buttons = [];
  };

  const layout = (): void => {
    const contentHeight =
      TITLE_HEIGHT +
      BUTTON_GAP +
      buttons.length * BUTTON_HEIGHT +
      Math.max(0, buttons.length - 1) * BUTTON_GAP;
    backdrop.scaling.y = contentHeight + 0.12;
    backdrop.position.z = 0.008;

    let cursor = contentHeight / 2 - TITLE_HEIGHT / 2;
    titlePlane.position.set(0, cursor, 0);
    cursor -= TITLE_HEIGHT / 2 + BUTTON_GAP + BUTTON_HEIGHT / 2;
    for (const button of buttons) {
      button.mesh.position.set(0, cursor, 0);
      cursor -= BUTTON_HEIGHT + BUTTON_GAP;
    }
  };

  const setItems = (items: readonly XrMenuItem[]): void => {
    clearButtons();
    buttons = items.map((item, index) => {
      const texture = new DynamicTexture(
        `xrMenuButtonTexture-${index}`,
        { width: 512, height: 74 },
        scene,
        false,
      );
      texture.hasAlpha = true;
      mirrorHorizontally(texture);
      drawButtonTexture(texture, item, false);

      const material = new StandardMaterial(`xrMenuButtonMaterial-${index}`, scene);
      material.disableLighting = true;
      material.emissiveColor = Color3.White();
      material.diffuseTexture = texture;
      material.emissiveTexture = texture;
      material.useAlphaFromDiffuseTexture = true;
      material.backFaceCulling = false;

      const mesh = MeshBuilder.CreatePlane(
        `xrMenuButton-${index}`,
        { width: BUTTON_WIDTH, height: BUTTON_HEIGHT },
        scene,
      );
      mesh.parent = root;
      mesh.material = material;
      mesh.applyFog = false;
      mesh.renderingGroupId = MENU_RENDERING_GROUP;
      mesh.isPickable = true;

      mesh.actionManager = new ActionManager(scene);
      mesh.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () =>
          drawButtonTexture(texture, item, !item.disabled),
        ),
      );
      mesh.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () =>
          drawButtonTexture(texture, item, false),
        ),
      );
      mesh.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
          if (!item.disabled) item.onSelect();
        }),
      );

      return { mesh, texture };
    });
    layout();
  };

  let menuYaw = 0;
  let recentring = true;
  const desired = new Vector3();

  const update = (anchor: XrMenuAnchor, deltaSeconds: number): void => {
    if (!root.isEnabled()) return;
    const headYaw = yawOf(anchor);
    const yawDelta = wrapAngle(headYaw - menuYaw);
    if (Math.abs(yawDelta) > YAW_DEADZONE) recentring = true;
    if (recentring) {
      menuYaw = wrapAngle(menuYaw + yawDelta * Math.min(1, deltaSeconds * 3.4));
      if (Math.abs(wrapAngle(headYaw - menuYaw)) < YAW_SETTLED) recentring = false;
    }

    desired.set(
      anchor.globalPosition.x + Math.sin(menuYaw) * FOLLOW_DISTANCE,
      anchor.globalPosition.y - FOLLOW_DROP,
      anchor.globalPosition.z + Math.cos(menuYaw) * FOLLOW_DISTANCE,
    );
    const catchUp = Math.min(1, deltaSeconds * 4.2);
    root.position.x += (desired.x - root.position.x) * catchUp;
    root.position.y += (desired.y - root.position.y) * catchUp;
    root.position.z += (desired.z - root.position.z) * catchUp;
    // Planes face their local -Z, so the panel is turned to present its back to the wearer:
    // that is the side where the texture reads the right way round.
    root.rotation.set(-0.3, menuYaw + Math.PI, 0);
  };

  return {
    setItems,
    setTitle: paintTitle,
    setVisible: (visible: boolean) => {
      root.setEnabled(visible);
      if (visible) recentring = true;
    },
    update,
    dispose: () => {
      clearButtons();
      titleTexture.dispose();
      titleMaterial.dispose();
      titlePlane.dispose();
      backdropMaterial.dispose();
      backdrop.dispose();
      root.dispose();
    },
  };
};
