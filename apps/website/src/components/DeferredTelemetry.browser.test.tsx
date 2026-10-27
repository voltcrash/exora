import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { DeferredTelemetry } from "./DeferredTelemetry.tsx";

vi.mock("@vercel/analytics/react", () => ({ Analytics: () => <span>Analytics ready</span> }));
vi.mock("@vercel/speed-insights/react", () => ({
  SpeedInsights: () => <span>Speed insights ready</span>,
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  root?.unmount();
  container?.remove();
  vi.restoreAllMocks();
});

test("the page renders before telemetry waits for a paint and idle time", async () => {
  let paint: FrameRequestCallback | undefined;
  let idle: IdleRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    paint = callback;
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  vi.spyOn(window, "requestIdleCallback").mockImplementation((callback) => {
    idle = callback;
    return 2;
  });
  const cancelIdle = vi.spyOn(window, "cancelIdleCallback").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  root.render(
    <>
      <p>Scene startup</p>
      <DeferredTelemetry />
    </>,
  );

  await expect.poll(() => paint).toEqual(expect.any(Function));
  expect(container.textContent).toBe("Scene startup");
  expect(idle).toBeUndefined();
  paint!(0);
  expect(container.textContent).toBe("Scene startup");
  idle!({ didTimeout: false, timeRemaining: () => 10 });
  await expect
    .poll(() => container?.textContent)
    .toBe("Scene startupAnalytics readySpeed insights ready");

  root.unmount();
  root = undefined;
  expect(cancelIdle).toHaveBeenCalledWith(2);
});
