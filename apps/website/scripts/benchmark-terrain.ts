import { performance } from "node:perf_hooks";
import { deriveWorldRecipe } from "@exora/worldgen";
import { MARS, tuneSolarWorldRecipe } from "../src/solar-system.ts";
import { deriveSurfaceGeology } from "../src/surface-geology.ts";
import { createTerrainField } from "../src/surface-terrain.ts";
const recipe = tuneSolarWorldRecipe(MARS, deriveWorldRecipe(MARS));
const geology = deriveSurfaceGeology(recipe, { naifId: MARS.solarSystem!.naifId });
if (!geology) throw Error("No geology");
const field = createTerrainField(geology);
for (let run = 0; run < 6; run++) {
  let sum = 0;
  const start = performance.now();
  for (let i = 0; i < 100000; i++)
    sum += field.height((i % 317) * 0.73 - 110, Math.floor(i / 317) * 0.71 - 110);
  console.log(`${run}: ${(performance.now() - start).toFixed(2)} ms checksum ${sum}`);
}
