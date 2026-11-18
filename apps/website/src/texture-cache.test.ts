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
  expect(first.surface.wrapS).toBe(RepeatWrapping);
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

test("gas giants request only convection and dispose the shared surface field once", async () => {
  const texture = new Texture<HTMLImageElement>();
  const load = vi.spyOn(TextureLoader.prototype, "loadAsync").mockResolvedValue(texture);
  const dispose = vi.spyOn(texture, "dispose");
  const fields = await loadPlanetFields(false);
  expect(load.mock.calls).toEqual([["/textures/fields/convection.png"]]);
  expect(fields.surface).toBe(fields.flow);
  expect(fields.flow.wrapS).toBe(RepeatWrapping);
  fields.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});
