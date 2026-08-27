export type XrControllerAction = "back" | "discover" | "immersive" | "primary" | null;

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
