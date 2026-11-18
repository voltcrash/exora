import { RepeatWrapping, TextureLoader } from "three";

export async function loadPlanetFields() {
  const loader = new TextureLoader();
  const [strata, flow] = await Promise.allSettled([
    loader.loadAsync("/textures/fields/lithosphere.png"),
    loader.loadAsync("/textures/fields/convection.png"),
  ]);
  if (strata.status === "rejected" || flow.status === "rejected") {
    for (const result of [strata, flow]) if (result.status === "fulfilled") result.value.dispose();
    throw Error("Could not load the Blender surface fields");
  }
  strata.value.wrapS = flow.value.wrapS = RepeatWrapping;
  return {
    strata: strata.value,
    flow: flow.value,
    dispose() {
      strata.value.dispose();
      flow.value.dispose();
    },
  };
}
