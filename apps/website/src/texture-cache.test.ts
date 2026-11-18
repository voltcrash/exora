import { afterEach, expect, test, vi } from "vite-plus/test";
import { RepeatWrapping, Texture, TextureLoader } from "three";
import { loadPlanetFields } from "./three/planet-fields.ts";

afterEach(() => vi.restoreAllMocks());
test("each destination owns two longitude-wrapped Blender fields", async () => {
  vi.spyOn(TextureLoader.prototype, "loadAsync").mockImplementation(
    async () => new Texture<HTMLImageElement>(),
  );
  const first = await loadPlanetFields(),
    second = await loadPlanetFields();
  expect(first.flow).not.toBe(second.flow);
  expect(first.strata.wrapS).toBe(RepeatWrapping);
  const release = vi.spyOn(first.flow, "dispose");
  first.dispose();
  expect(release).toHaveBeenCalledOnce();
  second.dispose();
});
test("a partially loaded pair releases the successful field and can be requested again", async () => {
  const good = new Texture<HTMLImageElement>(),
    release = vi.spyOn(good, "dispose");
  const load = vi
    .spyOn(TextureLoader.prototype, "loadAsync")
    .mockResolvedValueOnce(good)
    .mockRejectedValueOnce(Error("offline"));
  await expect(loadPlanetFields()).rejects.toThrow();
  expect(release).toHaveBeenCalledOnce();
  load.mockImplementation(async () => new Texture<HTMLImageElement>());
  const retry = await loadPlanetFields();
  retry.dispose();
});
