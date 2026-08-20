export type RendererStatus = "ready" | "context-lost" | "recovering" | "failed";

export type RendererEvent =
  | "context-lost"
  | "context-restored"
  | "frame-rendered"
  | "render-failed";

/** Keeps the context lifecycle deterministic and independently testable from WebGL. */
export const transitionRendererStatus = (
  current: RendererStatus,
  event: RendererEvent,
): RendererStatus => {
  switch (event) {
    case "context-lost":
      return "context-lost";
    case "context-restored":
      return "recovering";
    case "frame-rendered":
      return current === "recovering" ? "ready" : current;
    case "render-failed":
      return "failed";
  }
};
