/**
 * Babylon's immersive runtime, kept behind the visitor's Enter XR action.
 *
 * None of these modules are needed to draw the WebGL2 desktop scene or determine whether the
 * browser advertises an immersive session. Keeping registration here prevents controller,
 * teleportation, hand-tracking, and AR hit-test from extending the
 * first-world JavaScript path on every non-XR visit.
 */
export { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import "@babylonjs/core/XR/features/WebXRControllerMovement.js";
import "@babylonjs/core/XR/features/WebXRControllerTeleportation.js";
import "@babylonjs/core/XR/features/WebXRHandTracking.js";
import "@babylonjs/core/XR/features/WebXRDOMOverlay.js";
import "@babylonjs/core/XR/features/WebXRHitTest.js";
export { WebXRFeatureName } from "@babylonjs/core/XR/webXRFeaturesManager.js";
export { WebXRState } from "@babylonjs/core/XR/webXRTypes.js";
