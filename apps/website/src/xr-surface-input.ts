export interface SurfaceRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export type XrControllerAction = "back" | "menu" | "primary" | "selection" | null;

/**
 * Normalizes WebXR Input Profile component ids into Exora's Quest control scheme.
 *
 * `menu` variants cover controllers that expose their application button. Quest Browser reserves
 * the Meta universal-menu button, but the left application button is still handled whenever the
 * runtime includes it in the motion-controller profile.
 */
export const xrControllerAction = (componentId: string): XrControllerAction => {
  switch (componentId) {
    case "a-button":
    case "x-button":
      return "primary";
    case "b-button":
    case "y-button":
      return "back";
    case "xr-standard-trigger":
    case "menu":
    case "menu-button":
    case "xr-standard-menu":
      return "menu";
    case "xr-standard-squeeze":
    case "squeeze":
      return "selection";
    default:
      return null;
  }
};

/** Maps Babylon's bottom-left texture coordinates into the browser's top-left client space. */
export const texturePointToClient = (
  u: number,
  v: number,
  rect: SurfaceRect,
): { x: number; y: number } => ({
  x: rect.left + Math.min(1, Math.max(0, u)) * rect.width,
  y: rect.top + (1 - Math.min(1, Math.max(0, v))) * rect.height,
});

/** Converts a controller hit on a range input into the value the desktop control would choose. */
export const rangeValueAtClientX = (
  clientX: number,
  rect: Pick<SurfaceRect, "left" | "width">,
  minimum: number,
  maximum: number,
  step: number,
): number => {
  if (maximum <= minimum || rect.width <= 0) return minimum;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const raw = minimum + ratio * (maximum - minimum);
  if (!Number.isFinite(step) || step <= 0) return raw;
  const stepped = minimum + Math.round((raw - minimum) / step) * step;
  return Math.min(maximum, Math.max(minimum, stepped));
};
