import { RepeatWrapping, TextureLoader } from "three";
import type { SurfaceGeology } from "../surface-geology.ts";

export async function loadTerrainScans(geology: SurfaceGeology, anisotropy: number) {
  const sediment =
    geology.detail.primary === "ice" ? "frost" : geology.windStreaks > 0.5 ? "sand" : "scree";
  const loader = new TextureLoader();
  const results = await Promise.allSettled(
    [sediment, "cliff"].map((name) => loader.loadAsync(`/textures/terrain/${name}.webp`)),
  );
  const [ground, cliff] = results;
  if (ground?.status !== "fulfilled" || cliff?.status !== "fulfilled") {
    for (const result of results) if (result.status === "fulfilled") result.value.dispose();
    return null;
  }
  for (const texture of [ground.value, cliff.value]) {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.anisotropy = anisotropy;
  }
  return {
    ground: ground.value,
    cliff: cliff.value,
    dispose() {
      ground.value.dispose();
      cliff.value.dispose();
    },
  };
}
