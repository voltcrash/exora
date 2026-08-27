export type XrControllerAction = "back" | "discover" | "immersive" | "primary" | null;

export interface XrButtonPressGate {
  activate: boolean;
  armed: boolean;
}

/**
 * Requires a release before a controller shortcut may activate.
 *
 * Quest can connect its motion controller while the trigger used to click the flat page's Enter
 * VR button is still held. Treating that inherited press as a fresh shortcut immediately exits
 * the session that is opening. Once a release has been observed, each later press activates once.
 */
export const advanceXrButtonPressGate = (armed: boolean, pressed: boolean): XrButtonPressGate => {
  if (!pressed) return { activate: false, armed: true };
  return { activate: armed, armed: false };
};

/** Normalizes WebXR Input Profile component ids into Exora's Quest control scheme. */
export const xrControllerAction = (
  componentId: string,
  handedness: XRHandedness = "none",
): XrControllerAction => {
  switch (componentId) {
    case "a-button":
    case "x-button":
      return "primary";
    case "b-button":
    case "y-button":
      return "back";
    case "xr-standard-trigger":
      return "immersive";
    case "xr-standard-squeeze":
    case "squeeze":
      return "discover";
    case "menu":
    case "menu-button":
    case "xr-standard-menu":
      // Quest Browser reserves the Meta universal-menu button. The left application button is
      // handled whenever the runtime includes it in the motion-controller profile.
      return handedness === "left" ? "discover" : null;
    default:
      return null;
  }
};
