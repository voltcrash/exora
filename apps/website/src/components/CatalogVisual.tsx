import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { deriveStarRecipe, deriveWorldRecipe, type Rgb, type WorldRecipe } from "@exora/worldgen";
import { useMemo, type CSSProperties } from "react";
import type { BlackHoleProfile } from "../black-holes.ts";
import styles from "./CatalogVisual.module.css";

const names =
  "Sun Mercury Venus Earth Mars Jupiter Saturn Uranus Neptune Ceres Pluto Eris Haumea Makemake Moon Phobos Deimos Io Europa Ganymede Callisto Mimas Enceladus Tethys Dione Rhea Titan Iapetus Miranda Ariel Umbriel Titania Oberon Triton Charon Rocky Giant IceGiant Stellar Horizon".split(
    " ",
  );
type CustomStyle = CSSProperties & Record<`--${string}`, string>;
function hue([r, g, b]: Rgb) {
  const max = Math.max(r, g, b),
    span = max - Math.min(r, g, b);
  if (span < 0.001) return 0;
  const sector = max === r ? (g - b) / span : max === g ? 2 + (b - r) / span : 4 + (r - g) / span;
  return (((sector * 60) % 360) + 360) % 360;
}
function tint(color: Rgb, sourceHue: number) {
  const chroma = Math.max(...color) - Math.min(...color);
  return `hue-rotate(${hue(color) - sourceHue}deg) saturate(${Math.min(2, 0.3 + 2 * chroma)})`;
}

function planetPortrait(world: WorldRecipe): [string, string] {
  if (world.renderer === "gas-giant") return ["Giant", tint(world.cloudBands.midColor, 32)];
  if (world.renderer === "ice-giant")
    return ["IceGiant", tint(world.atmosphereBands.hazeColor, 194)];
  const surface = world.surface;
  if (surface.lavaStrength >= 0.25) return ["Io", tint(surface.highColor, 40)];
  if (surface.iceCapStrength >= 0.45) return ["Europa", tint(surface.highColor, 36)];
  if (surface.waterLevel >= 0.3) return ["Earth", tint(surface.waterColor, 208)];
  if (surface.cloudCover >= 0.65) return ["Venus", tint(surface.cloudColor, 38)];
  if (surface.craterDensity >= 0.65) return ["Mercury", tint(surface.midColor, 25)];
  return ["Rocky", tint(surface.midColor, 30)];
}

export function CatalogPortrait({
  name,
  filter,
  rotation = 0,
  scale = 1,
}: {
  name: string;
  filter?: string | undefined;
  rotation?: number;
  scale?: number;
}) {
  const index = names.indexOf(name);
  if (index < 0) return null;
  const style: CustomStyle = {
    backgroundPosition: `${((index % 8) * 100) / 7}% ${Math.floor(index / 8) * 25}%`,
    filter,
    transform: `rotate(${rotation}rad) scale(${scale})`,
  };
  return <span className={styles["portrait"]} style={style} aria-hidden="true" />;
}
export function PlanetCatalogVisual({
  planet,
  recipe,
}: {
  planet: ExoplanetProfile;
  recipe?: WorldRecipe;
}) {
  const world = useMemo(() => recipe ?? deriveWorldRecipe(planet), [planet, recipe]);
  const local = Boolean(planet.solarSystem && names.includes(planet.name));
  const [name, filter] = local ? [planet.name, undefined] : planetPortrait(world);
  return (
    <span
      className={styles["planet-catalog-visual"]}
      data-renderer={world.renderer}
      aria-hidden="true"
    >
      <CatalogPortrait name={name} filter={filter} rotation={local ? 0 : world.axialTilt} />
    </span>
  );
}
export function StarCatalogVisual({ star }: { star: StarProfile }) {
  const recipe = deriveStarRecipe(star);
  const filter = tint(recipe.color, 32);
  return (
    <span className={styles["catalog-visual"]} aria-hidden="true">
      <CatalogPortrait
        name={star.solarSystem ? "Sun" : "Stellar"}
        filter={star.solarSystem ? undefined : filter}
        scale={0.67 + Math.min(0.32, recipe.radiusSceneUnits * 0.035)}
      />
    </span>
  );
}
export function BlackHoleCatalogVisual({ blackHole }: { blackHole: BlackHoleProfile }) {
  return (
    <span className={styles["catalog-visual"]} aria-hidden="true">
      <CatalogPortrait
        name="Horizon"
        filter={`hue-rotate(${blackHole.visual.diskHueDegrees - 26}deg)`}
        rotation={(blackHole.visual.diskTiltDegrees * Math.PI) / 180}
      />
    </span>
  );
}
