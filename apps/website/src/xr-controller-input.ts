export type XrControllerAction = "immersive" | "primary" | null;

export interface XrButtonPressGate {
  activate: boolean;
  armed: boolean;
}

export const advanceXrButtonPressGate = (armed: boolean, pressed: boolean): XrButtonPressGate => {
  if (!pressed) return { activate: false, armed: true };
  return { activate: armed, armed: false };
};

export const xrControllerAction = (componentId: string): XrControllerAction => {
  switch (componentId) {
    case "a-button":
    case "x-button":
      return "primary";
    case "xr-standard-trigger":
      return "immersive";
    default:
      return null;
  }
};
