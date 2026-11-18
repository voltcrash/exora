import { RepeatWrapping, TextureLoader } from "three";

export async function loadPlanetFields(needsStrata = true) {
  const loader = new TextureLoader();
  const [strata, flow] = await Promise.allSettled([
    needsStrata ? loader.loadAsync("/textures/fields/lithosphere.png") : null,
    loader.loadAsync("/textures/fields/convection.png"),
  ]);
  if (strata.status === "rejected" || flow.status === "rejected") {
    for (const result of [strata, flow]) if (result.status === "fulfilled") result.value?.dispose();
    throw Error("Could not load the Blender surface fields");
  }
  flow.value.wrapS = RepeatWrapping;
  if (strata.value) strata.value.wrapS = RepeatWrapping;
  return {
    surface: strata.value ?? flow.value,
    flow: flow.value,
    dispose() {
      strata.value?.dispose();
      flow.value.dispose();
    },
  };
}
