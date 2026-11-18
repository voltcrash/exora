import {
  Group,
  Mesh,
  RingGeometry,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type WebGLRenderer,
  type Scene,
} from "three";
import { createXrIntegration } from "../scene-xr-integration.ts";
import { getVariantLaunchUrl, onVariantLaunchReady } from "../variant-launch.ts";

export function createImmersive(
  renderer: WebGLRenderer,
  scene: Scene,
  world: Group,
  extent: () => number,
  change: (active: boolean) => void,
) {
  const support = createXrIntegration({
    getLaunchUrl: getVariantLaunchUrl,
    onLaunchReady: onVariantLaunchReady,
    xrSystem: () => navigator.xr,
  });
  let session: XRSession | null = null,
    hits: XRHitTestSource | null = null,
    entering = false,
    disposed = false,
    placed = false;
  const overlay = document.createElement("div");
  overlay.id = "ar-overlay";
  overlay.hidden = true;
  const hint = document.createElement("p");
  const exit = document.createElement("button");
  const backdrop = document.createElement("button");
  exit.type = backdrop.type = "button";
  exit.className = "ar-back-button";
  exit.textContent = "Exit AR";
  backdrop.className = "ar-background-toggle";
  overlay.append(hint, exit, backdrop);
  const marker = new Mesh(
    new RingGeometry(0.055, 0.062, 48).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: 0x99ffee }),
  );
  marker.matrixAutoUpdate = false;
  marker.visible = false;
  scene.add(marker);
  let space = false;
  const background = () => {
    renderer.setClearAlpha(space ? 1 : 0);
    backdrop.textContent = space ? "Show camera" : "Hide camera";
    backdrop.setAttribute("aria-pressed", String(space));
  };
  backdrop.onclick = () => {
    space = !space;
    background();
  };
  exit.onclick = () => {
    void session?.end();
  };
  overlay.addEventListener("beforexrselect", (event) => {
    if (event.target instanceof Element && event.target.closest("button")) event.preventDefault();
  });
  const scale = new Vector3(),
    rotation = new Quaternion();
  const place = () => {
    if (!marker.visible) return;
    marker.matrix.decompose(world.position, rotation, scale);
    world.position.y += 0.16;
    world.visible = true;
    placed = true;
    hint.textContent = "Tap a surface to move · Pinch to scale";
  };
  let span = 0;
  overlay.addEventListener("touchmove", (event) => {
    const a = event.touches[0],
      b = event.touches[1];
    if (!a || !b || !placed) return;
    const next = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (span && next) {
      const base = 0.6 / Math.max(1, extent());
      world.scale.setScalar(
        Math.min(base * 5, Math.max(base * 0.2, (world.scale.x * next) / span)),
      );
    }
    span = next;
  });
  overlay.addEventListener("touchend", () => {
    span = 0;
  });
  const end = () => {
    hits?.cancel();
    hits = null;
    session?.removeEventListener("select", place);
    session = null;
    marker.visible = false;
    overlay.hidden = true;
    overlay.remove();
    delete document.body.dataset.presentationMode;
    world.visible = true;
    world.scale.setScalar(1);
    world.position.set(0, 0, 0);
    renderer.setClearAlpha(1);
    if (!disposed) {
      change(false);
      support.markReady();
    }
  };
  return {
    isInXr: () => Boolean(session) || entering,
    onXrStatus: support.onStatus,
    async enterImmersive() {
      const target = support.destination;
      if (!target || disposed || session || entering) return;
      if (target.launchUrl) {
        window.location.assign(target.launchUrl);
        return;
      }
      entering = true;
      support.markEntering();
      document.body.append(overlay);
      try {
        const current = await navigator.xr!.requestSession("immersive-ar", {
          requiredFeatures: ["hit-test"],
          optionalFeatures: ["dom-overlay"],
          domOverlay: { root: overlay },
        });
        if (disposed) {
          await current.end();
          return;
        }
        session = current;
        current.addEventListener("end", end, { once: true });
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType("local");
        await renderer.xr.setSession(current);
        if (session !== current || disposed) return;
        const viewer = await current.requestReferenceSpace("viewer");
        const source = await current.requestHitTestSource?.({ space: viewer });
        if (session !== current || disposed) {
          source?.cancel();
          return;
        }
        if (!source) throw Error("Surface placement is unavailable");
        hits = source;
        current.addEventListener("select", place);
        world.scale.setScalar(0.6 / Math.max(1, extent()));
        world.visible = false;
        space = false;
        placed = false;
        background();
        hint.textContent = "Move to find a surface · Tap to place";
        overlay.hidden = false;
        document.body.dataset.presentationMode = "ar";
        change(true);
        support.markInXr();
      } catch (error) {
        await session?.end();
        overlay.remove();
        if (!disposed) support.markFailed();
        throw error;
      } finally {
        entering = false;
      }
    },
    frame(frame?: XRFrame) {
      const ref = renderer.xr.getReferenceSpace();
      if (!frame || !ref || !hits) return;
      const hit = frame.getHitTestResults(hits)[0]?.getPose(ref);
      marker.visible = Boolean(hit);
      if (hit) {
        marker.matrix.fromArray(hit.transform.matrix);
        marker.matrixWorldNeedsUpdate = true;
      }
    },
    dispose() {
      disposed = true;
      support.dispose();
      const current = session;
      if (current) {
        current.removeEventListener("end", end);
        end();
        void current.end().catch(() => undefined);
      }
      marker.removeFromParent();
      marker.material.dispose();
      marker.geometry.dispose();
      overlay.remove();
    },
  };
}
