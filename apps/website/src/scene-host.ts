import type { Observatory } from "./three/observatory.ts";
export type { XrStatus } from "./scene-xr-integration.ts";
export type ViewerControls = Pick<
  Observatory,
  "getFps" | "onXrStatus" | "enterImmersive" | "qualityTier" | "suspendRendering"
>;
