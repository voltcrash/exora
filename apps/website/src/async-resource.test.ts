import { expect, test, vi } from "vite-plus/test";
import { createAsyncResource } from "./async-resource.ts";

test("resources coalesce, cool down after failure, and refresh expired success", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(0);
  try {
    const resource = createAsyncResource<number>({ retryMs: 10, ttlMs: 20 });
    const failed = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(resource.get(failed)).rejects.toThrow("offline");
    await expect(resource.get(failed)).rejects.toThrow("offline");
    expect(failed).toHaveBeenCalledOnce();
    now.mockReturnValue(11);
    const load = vi.fn(async () => 42);
    const first = resource.get(load);
    expect(resource.get(load)).toBe(first);
    expect(await first).toBe(42);
    now.mockReturnValue(32);
    await resource.get(load);
    expect(load).toHaveBeenCalledTimes(2);
  } finally {
    now.mockRestore();
  }
});
