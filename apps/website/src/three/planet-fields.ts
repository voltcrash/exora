import type { ExoplanetProfile } from "@exora/contracts";
import { RepeatWrapping, TextureLoader } from "three";
import { loadSolarModels } from "./solar-planet-models.ts";

export async function loadPlanetFields(
  needsStrata = true,
  profiles: readonly ExoplanetProfile[] = [],
  overview = false,
) {
  const loader = new TextureLoader();
  const [strata, flow, solar] = await Promise.allSettled([
    needsStrata ? loader.loadAsync("/textures/fields/lithosphere.png") : null,
    loader.loadAsync("/textures/fields/convection.png"),
    loadSolarModels(profiles, overview),
  ]);
  if (strata.status === "rejected" || flow.status === "rejected" || solar.status === "rejected") {
    for (const result of [strata, flow]) if (result.status === "fulfilled") result.value?.dispose();
    if (solar.status === "fulfilled") solar.value.dispose();
    throw Error("Could not load the Blender planet assets", {
      cause: [strata, flow, solar].find((result) => result.status === "rejected")?.reason,
    });
  }
  flow.value.wrapS = RepeatWrapping;
  if (strata.value) strata.value.wrapS = RepeatWrapping;
  return {
    surface: strata.value ?? flow.value,
    flow: flow.value,
    models: solar.value.models,
    dispose() {
      solar.value.dispose();
      strata.value?.dispose();
      flow.value.dispose();
    },
  };
}
