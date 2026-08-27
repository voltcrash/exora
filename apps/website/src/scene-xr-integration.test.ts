import { expect, test, vi } from "vite-plus/test";
import { createXrIntegration } from "./scene-xr-integration.ts";

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

test("prefers native VR and keeps session status stable during capability refresh", async () => {
  let launchReady = (): void => undefined;
  const integration = createXrIntegration({
    getLaunchUrl: () => "https://example.test/ar",
    onLaunchReady: (listener) => {
      launchReady = listener;
      return vi.fn();
    },
    xrSystem: () => ({ isSessionSupported: (mode) => Promise.resolve(mode === "immersive-vr") }),
  });
  const statuses: string[] = [];
  integration.onStatus((status) => statuses.push(status));
  await settle();

  expect(integration.destination?.mode).toBe("vr");
  expect(statuses.at(-1)).toBe("ready-vr");
  integration.markInXr();
  launchReady();
  await settle();
  expect(statuses.at(-1)).toBe("in-xr");
});

test("uses the AR launch handoff and releases its readiness listener", async () => {
  const stopWatching = vi.fn();
  const integration = createXrIntegration({
    getLaunchUrl: () => "https://example.test/ar",
    onLaunchReady: () => stopWatching,
    xrSystem: () => undefined,
  });
  await settle();

  expect(integration.destination).toEqual({
    launchUrl: "https://example.test/ar",
    mode: "ar",
  });
  integration.dispose();
  expect(stopWatching).toHaveBeenCalledOnce();
});
