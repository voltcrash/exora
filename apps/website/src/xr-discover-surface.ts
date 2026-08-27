/**
 * A windowed WebXR projection of the real desktop Discover dialog.
 *
 * The React dialog remains the single owner of the catalog, state and event handlers. While a VR
 * session is active this surface snapshots that same DOM tree into a Babylon texture and maps
 * controller hits back to the original elements. There is no second headset-only implementation
 * to drift away from the desktop UI or its behaviour.
 */

import { PointerEventTypes, type PointerInfo } from "@babylonjs/core/Events/pointerEvents.js";
import type { PickingInfo } from "@babylonjs/core/Collisions/pickingInfo.js";
import { Ray } from "@babylonjs/core/Culling/ray.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Axis } from "@babylonjs/core/Maths/math.axis.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import type { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource.js";
import type { WebXRAbstractMotionController } from "@babylonjs/core/XR/motionController/webXRAbstractMotionController.js";
import type { WebXRControllerComponent } from "@babylonjs/core/XR/motionController/webXRControllerComponent.js";
import type { WebXRCamera } from "@babylonjs/core/XR/webXRCamera.js";
import { HUD_DISTANCE, hudPose } from "./xr-hud-pose.ts";
import {
  rangeValueAtClientX,
  texturePointToClient,
  xrControllerAction,
} from "./xr-surface-input.ts";

const PANEL_MAXIMUM = { height: 1.7, width: 2.72 };
const INITIAL_TEXTURE = { height: 900, width: 1440 };
const MAXIMUM_CAPTURE_PIXELS = 1_600_000;
/** Coalesce React/hover mutations without turning DOM capture into part of the render loop. */
const CAPTURE_DEBOUNCE_MS = 100;
const OPEN_SECONDS = 0.16;
export interface XrDiscoverSurface {
  attach: (xr: WebXRDefaultExperience) => void;
  dispose: () => void;
  isVisible: () => boolean;
  onVisibility: (listener: (open: boolean) => void) => () => void;
  recall: () => void;
  setElement: (element: HTMLDialogElement | null) => void;
  setVisible: (visible: boolean) => void;
  update: (deltaSeconds: number) => void;
}

const interactiveTarget = (element: Element | null): HTMLElement | null => {
  if (!(element instanceof HTMLElement)) return null;
  return element.closest<HTMLElement>(
    "button, a[href], input, select, textarea, [role='button'], [tabindex]",
  );
};

const scrollContainer = (element: Element | null, boundary: HTMLElement): HTMLElement => {
  let candidate = element instanceof HTMLElement ? element : null;
  while (candidate && candidate !== boundary) {
    const style = getComputedStyle(candidate);
    if (
      candidate.scrollHeight > candidate.clientHeight &&
      (style.overflowY === "auto" || style.overflowY === "scroll")
    ) {
      return candidate;
    }
    candidate = candidate.parentElement;
  }
  return boundary;
};

export const createXrDiscoverSurface = (
  scene: Scene,
  anisotropy: number,
  onBack: () => void,
): XrDiscoverSurface => {
  const root = new TransformNode("xrDiscoverSurfaceRoot", scene);
  root.rotationQuaternion = Quaternion.Identity();

  const texture = new DynamicTexture(
    "xrDiscoverSurfaceTexture",
    INITIAL_TEXTURE,
    scene,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.anisotropicFilteringLevel = anisotropy;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;

  const material = new StandardMaterial("xrDiscoverSurfaceMaterial", scene);
  material.disableLighting = true;
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.emissiveColor = Color3.White();
  material.specularColor = Color3.Black();
  material.backFaceCulling = false;

  const screen = MeshBuilder.CreatePlane("xrDiscoverSurface", { height: 1, width: 1 }, scene);
  screen.parent = root;
  screen.material = material;
  screen.isPickable = true;
  screen.renderingGroupId = 2;
  screen.alphaIndex = 1;
  screen.applyFog = false;
  screen.scaling.set(PANEL_MAXIMUM.width, PANEL_MAXIMUM.height, 1);
  root.setEnabled(false);

  let camera: WebXRCamera | null = null;
  let dialog: HTMLDialogElement | null = null;
  let mutationObserver: MutationObserver | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let captureTimer = 0;
  let captureInFlight = false;
  let captureQueued = false;
  let visible = false;
  let openProgress = 0;
  let hovered: Element | null = null;
  let scrollStick: WebXRControllerComponent | null = null;
  let lastPointerController: WebXRAbstractMotionController | null = null;
  let nextPointerId = 10_000;
  const pointerIds = new WeakMap<WebXRInputSource, number>();
  const boundMotionControllers = new WeakSet<WebXRAbstractMotionController>();
  const visibilityListeners = new Set<(open: boolean) => void>();

  const notifyVisibility = (): void => {
    for (const listener of visibilityListeners) listener(visible);
  };

  const scheduleCapture = (delay = 0): void => {
    if (!visible || !dialog) return;
    captureQueued = true;
    if (captureTimer !== 0 || captureInFlight) return;
    captureTimer = window.setTimeout(() => {
      captureTimer = 0;
      void capture();
    }, delay);
  };

  const resizeSurface = (pixelWidth: number, pixelHeight: number): void => {
    const aspect = pixelWidth / pixelHeight;
    let width = PANEL_MAXIMUM.width;
    let height = width / aspect;
    if (height > PANEL_MAXIMUM.height) {
      height = PANEL_MAXIMUM.height;
      width = height * aspect;
    }
    screen.scaling.set(width, height, 1);
  };

  const capture = async (): Promise<void> => {
    const element = dialog;
    if (!visible || !element || captureInFlight) return;
    const bounds = element.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return;

    captureInFlight = true;
    captureQueued = false;
    try {
      const ratio = Math.min(1, Math.sqrt(MAXIMUM_CAPTURE_PIXELS / (bounds.width * bounds.height)));
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      const { domToCanvas } = await import("modern-screenshot");
      const canvas = await domToCanvas(element, {
        backgroundColor: "#040708",
        // Discover catalogs contain hundreds of cards below the scrollport. Serializing and
        // styling every one of those invisible descendants blocked the XR frame callback for
        // seconds even though the snapshot is clipped to the dialog. Keep ancestors and
        // zero-sized structural nodes, but omit painted elements wholly outside the capture.
        filter: (node) => {
          if (!(node instanceof Element) || node === element) return true;
          const rect = node.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return true;
          return !(
            rect.right < bounds.left ||
            rect.left > bounds.right ||
            rect.bottom < bounds.top ||
            rect.top > bounds.bottom
          );
        },
        height: bounds.height,
        maximumCanvasSize: MAXIMUM_CAPTURE_PIXELS,
        scale: ratio,
        style: { animation: "none", opacity: "1", transform: "none" },
        width: bounds.width,
      });
      if (!visible || dialog !== element) return;
      const size = texture.getSize();
      if (size.width !== width || size.height !== height) texture.scaleTo(width, height);
      const context = texture.getContext() as unknown as CanvasRenderingContext2D;
      context.clearRect(0, 0, width, height);
      context.drawImage(canvas, 0, 0, width, height);
      texture.update();
      resizeSurface(bounds.width, bounds.height);
    } catch (error) {
      console.warn("Could not mirror Discover into the VR window", error);
    } finally {
      captureInFlight = false;
      // A mutation that landed during the asynchronous snapshot still needs one fresh capture.
      // Coalesce it with any immediately following React work instead of starting back-to-back.
      if (captureQueued) scheduleCapture(CAPTURE_DEBOUNCE_MS);
    }
  };

  const observeDialog = (element: HTMLDialogElement | null): void => {
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    mutationObserver = null;
    resizeObserver = null;
    dialog = element;
    if (!element) return;

    mutationObserver = new MutationObserver(() => scheduleCapture());
    mutationObserver.observe(element, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    resizeObserver = new ResizeObserver(() => scheduleCapture());
    resizeObserver.observe(element);
    scheduleCapture();
  };

  const pulse = (intensity: number, duration: number): void => {
    void lastPointerController?.pulse(intensity, duration).catch(() => undefined);
  };

  const resolvePick = (
    pick: PickingInfo | null | undefined,
  ): { clientX: number; clientY: number; element: Element | null } | null => {
    const element = dialog;
    if (!element || !pick?.hit || pick.pickedMesh !== screen) return null;
    const coordinates = pick.getTextureCoordinates();
    if (!coordinates) return null;
    const point = texturePointToClient(
      coordinates.x,
      coordinates.y,
      element.getBoundingClientRect(),
    );
    return {
      clientX: point.x,
      clientY: point.y,
      element: document.elementFromPoint(point.x, point.y),
    };
  };

  const resolve = (info: PointerInfo) => resolvePick(info.pickInfo);

  const activate = (target: HTMLElement, clientX: number): void => {
    if (target instanceof HTMLInputElement && target.type === "range") {
      const bounds = target.getBoundingClientRect();
      const minimum = Number(target.min || 0);
      const maximum = Number(target.max || 100);
      const step = target.step === "any" ? 0 : Number(target.step || 1);
      target.valueAsNumber = rangeValueAtClientX(clientX, bounds, minimum, maximum, step);
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.focus();
    }
    target.click();
  };

  const pointerObserver: Observer<PointerInfo> | null = scene.onPointerObservable.add((info) => {
    if (!visible) return;
    const hit = resolve(info);
    if (info.type === PointerEventTypes.POINTERMOVE) {
      // A tracked controller never holds perfectly still. The raw hit therefore jitters between
      // a button and its nested label/icon on adjacent frames. Treat the complete control as one
      // stable target and keep hover read-only: recapturing the DOM (and pulsing haptics) for
      // every few pixels of ray motion turned normal hand tremor into a render/vibration loop.
      hovered = interactiveTarget(hit?.element ?? null);
      return;
    }
    if (info.type !== PointerEventTypes.POINTERDOWN || !hit) return;
    const target = interactiveTarget(hit.element);
    if (!target || target.matches(":disabled, [aria-disabled='true']")) return;
    pulse(0.35, 26);
    activate(target, hit.clientX);
    scheduleCapture();
  });

  const eyePosition = new Vector3();
  const headForward = new Vector3();
  const headUp = new Vector3();
  const lookDirection = new Vector3();
  const panelUp = new Vector3();
  const orientation = Quaternion.Identity();

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
    const pose = hudPose(eyePosition, headForward, headUp, HUD_DISTANCE);
    lookDirection.set(pose.look.x, pose.look.y, pose.look.z);
    panelUp.set(pose.up.x, pose.up.y, pose.up.z);
    Quaternion.FromLookDirectionLHToRef(lookDirection, panelUp, orientation);
    root.position.set(pose.position.x, pose.position.y, pose.position.z);
    root.rotationQuaternion = orientation;
  };

  const setVisible = (next: boolean): void => {
    if (visible === next) return;
    visible = next;
    hovered = null;
    if (next) {
      placeHud();
      openProgress = 0.35;
      root.scaling.setAll(0.92);
      root.setEnabled(true);
      scheduleCapture();
    } else {
      root.setEnabled(false);
      if (captureTimer !== 0) window.clearTimeout(captureTimer);
      captureTimer = 0;
      captureQueued = false;
    }
    notifyVisibility();
  };

  const onConsoleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "KeyC" && !event.repeat && scene.activeCamera === camera) setVisible(true);
  };
  window.addEventListener("keydown", onConsoleKeyDown);

  const activateControllerTarget = (controller: WebXRInputSource): void => {
    const ray = new Ray(Vector3.Zero(), Vector3.Forward(), 100);
    controller.getWorldPointerRayToRef(ray);
    const pick = scene.pickWithRay(ray);
    if (!pick?.hit) return;

    const panelHit = resolvePick(pick);
    if (visible && panelHit) {
      const target = interactiveTarget(panelHit.element);
      if (!target || target.matches(":disabled, [aria-disabled='true']")) return;
      pulse(0.35, 26);
      activate(target, panelHit.clientX);
      scheduleCapture();
      return;
    }

    const metadata = pick.pickedMesh?.metadata as
      | { exoraXrPrimaryAction?: () => void }
      | null
      | undefined;
    if (metadata?.exoraXrPrimaryAction) {
      pulse(0.35, 26);
      metadata.exoraXrPrimaryAction();
      return;
    }

    const pointerId = pointerIds.get(controller) ?? nextPointerId++;
    pointerIds.set(controller, pointerId);
    const event = { pointerId, pointerType: "xr" };
    scene.simulatePointerDown(pick, event);
    scene.simulatePointerUp(pick, event);
  };

  const bindMotionController = (
    controller: WebXRInputSource,
    motionController: WebXRAbstractMotionController,
  ): void => {
    if (boundMotionControllers.has(motionController)) return;
    boundMotionControllers.add(motionController);
    for (const id of motionController.getComponentIds()) {
      const component = motionController.getComponent(id);
      const action = xrControllerAction(id);
      if (action) {
        component.onButtonStateChangedObservable.add(() => {
          if (component.changes.pressed?.current !== true) return;
          lastPointerController = motionController;
          if (action === "menu") {
            setVisible(!visible);
          } else if (action === "back") {
            if (visible) setVisible(false);
            else onBack();
          } else if (action === "primary") {
            activateControllerTarget(controller);
          }
        });
      }
      if (id === "xr-standard-thumbstick" && !scrollStick) scrollStick = component;
    }
  };

  const bindController = (controller: WebXRInputSource): void => {
    if (controller.motionController) bindMotionController(controller, controller.motionController);
    controller.onMotionControllerInitObservable.add((motionController) =>
      bindMotionController(controller, motionController),
    );
  };

  const attach = (xr: WebXRDefaultExperience): void => {
    camera = xr.baseExperience.camera;
    for (const controller of xr.input.controllers) bindController(controller);
    xr.input.onControllerAddedObservable.add(bindController);
    xr.input.onControllerRemovedObservable.add((controller) => {
      if (lastPointerController === controller.motionController) lastPointerController = null;
      if (scrollStick && controller.motionController?.getComponentIds().includes(scrollStick.id)) {
        scrollStick = null;
      }
    });
  };

  return {
    attach,
    dispose: () => {
      window.removeEventListener("keydown", onConsoleKeyDown);
      if (captureTimer !== 0) window.clearTimeout(captureTimer);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      if (pointerObserver) scene.onPointerObservable.remove(pointerObserver);
      visibilityListeners.clear();
      screen.dispose();
      material.dispose();
      texture.dispose();
      root.dispose();
    },
    isVisible: () => visible,
    onVisibility: (listener) => {
      visibilityListeners.add(listener);
      listener(visible);
      return () => visibilityListeners.delete(listener);
    },
    recall: placeHud,
    setElement: observeDialog,
    setVisible,
    update: (deltaSeconds) => {
      if (!visible) return;
      placeHud();
      if (openProgress < 1) {
        openProgress = Math.min(1, openProgress + deltaSeconds / OPEN_SECONDS);
        const eased = openProgress * openProgress * (3 - 2 * openProgress);
        root.scaling.setAll(0.88 + eased * 0.12);
      }
      const axis = scrollStick?.axes.y ?? 0;
      if (Math.abs(axis) > 0.18 && dialog) {
        scrollContainer(hovered, dialog).scrollBy({ top: axis * 32 });
        scheduleCapture(CAPTURE_DEBOUNCE_MS);
      }
    },
  };
};
