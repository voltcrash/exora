import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Observable } from "@babylonjs/core/Misc/observable.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { IWebXRHitResult, WebXRHitTest } from "@babylonjs/core/XR/features/WebXRHitTest.js";
import type { WebXRSessionManager } from "@babylonjs/core/XR/webXRSessionManager.js";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { createArPresentation } from "./ar-presentation.ts";
import type { WorldPresentation } from "./world-presentation.ts";
import "./style.css";

afterEach(() => {
  delete document.documentElement.dataset.presentationMode;
  delete document.body.dataset.presentationMode;
  document.querySelector("#ar-test-app")?.remove();
});

test("AR makes the page transparent and places from the XR select event", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.clearColor.a = 1;
  const presentation = createArPresentation(scene);
  const hitResults = new Observable<IWebXRHitResult[]>();
  const sessionInitialized = new Observable<XRSession>();
  const session = new EventTarget() as XRSession;
  const place = vi.fn();
  let placed = false;
  place.mockImplementation(() => {
    placed = true;
  });
  const world = {
    beginAr: vi.fn(),
    endAr: vi.fn(),
    isPlaced: () => placed,
    place,
  } as unknown as WorldPresentation;

  const app = document.createElement("div");
  app.id = "ar-test-app";
  app.className = "experience-shell";
  document.body.append(app);

  presentation.begin(
    { onHitTestResultObservable: hitResults } as WebXRHitTest,
    { onXRSessionInit: sessionInitialized } as WebXRSessionManager,
    world,
  );
  sessionInitialized.notifyObservers(session);

  expect(scene.clearColor.a).toBe(0);
  expect(getComputedStyle(document.documentElement).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(app).backgroundColor).toBe("rgba(0, 0, 0, 0)");

  const stablePosition = new Vector3(1, 2, 3);
  hitResults.notifyObservers([
    {
      isTransient: false,
      position: stablePosition,
      rotationQuaternion: Quaternion.Identity(),
    } as IWebXRHitResult,
  ]);
  // A touchscreen transient ray must not pull the reticle/placement pose towards the finger.
  hitResults.notifyObservers([
    {
      isTransient: true,
      position: new Vector3(9, 9, 9),
      rotationQuaternion: Quaternion.Identity(),
    } as IWebXRHitResult,
  ]);
  session.dispatchEvent(new Event("select"));

  expect(place).toHaveBeenCalledOnce();
  expect(place).toHaveBeenCalledWith(stablePosition);

  presentation.end();
  expect(scene.clearColor.a).toBe(1);
  expect(document.documentElement.dataset.presentationMode).toBeUndefined();

  presentation.dispose();
  scene.dispose();
  engine.dispose();
});
