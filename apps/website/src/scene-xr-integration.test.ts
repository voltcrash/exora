import { expect, test, vi } from "vite-plus/test";
import { createXrIntegration } from "./scene-xr-integration.ts";

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

test("prefers native AR and keeps session status stable during capability refresh", async () => {
  let launchReady = (): void => undefined;
  const integration = createXrIntegration({
    getLaunchUrl: () => "https://example.test/ar",
    onLaunchReady: (listener) => {
      launchReady = listener;
      return vi.fn();
    },
    xrSystem: () => ({ isSessionSupported: (mode) => Promise.resolve(mode === "immersive-ar") }),
  });
  const statuses: string[] = [];
  integration.onStatus((status) => statuses.push(status));
  await settle();

  expect(integration.destination).toEqual({ launchUrl: null });
  expect(statuses.at(-1)).toBe("ready-ar");
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

  expect(integration.destination).toEqual({ launchUrl: "https://example.test/ar" });
  integration.dispose();
  expect(stopWatching).toHaveBeenCalledOnce();
});

test("handoff URLs follow navigation and disposed integration cannot enter", async () => {
  let launchUrl = "https://example.test/first";
  const integration = createXrIntegration({
    getLaunchUrl: () => launchUrl,
    onLaunchReady: () => () => undefined,
    xrSystem: () => undefined,
  });
  await settle();
  launchUrl = "https://example.test/second";
  expect(integration.destination).toEqual({ launchUrl });
  integration.markFailed();
  const listener = vi.fn();
  integration.onStatus(listener);
  expect(listener).toHaveBeenLastCalledWith("error");
  integration.dispose();
  expect(integration.destination).toBeNull();
});
