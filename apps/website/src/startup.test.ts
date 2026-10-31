import { afterEach, expect, test, vi } from "vite-plus/test";

vi.mock("./main.tsx", () => {
  throw new Error("Application download failed");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("a failed application import marks startup as failed", async () => {
  const root = { dataset: {} as Record<string, string> };
  vi.stubGlobal("document", { documentElement: root });
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

  await import("./startup.ts");

  await expect.poll(() => root.dataset.startupFailed).toBe("");
  expect(log).toHaveBeenCalledWith(
    "Exora could not start its interactive explorer.",
    expect.any(Error),
  );
});
