import { expect, test } from "vite-plus/test";
import { transitionRendererStatus } from "./renderer-recovery.ts";

test("moves a restored context through recovery before declaring it ready", () => {
  expect(transitionRendererStatus("ready", "context-lost")).toBe("context-lost");
  expect(transitionRendererStatus("context-lost", "context-restored")).toBe("recovering");
  expect(transitionRendererStatus("recovering", "frame-rendered")).toBe("ready");
});

test("does not hide a failed renderer after an unrelated frame event", () => {
  expect(transitionRendererStatus("ready", "render-failed")).toBe("failed");
  expect(transitionRendererStatus("failed", "frame-rendered")).toBe("failed");
});
