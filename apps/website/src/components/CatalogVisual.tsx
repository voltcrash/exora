import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { deriveStarRecipe } from "@exora/worldgen";
import type { CSSProperties } from "react";
import type { BlackHoleProfile } from "../black-holes.ts";
import sharedStyles from "./ExperienceShared.module.css";
import catalogStyles from "./CatalogShared.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles, catalogStyles);

type VisualStyle = CSSProperties & Record<`--${string}`, string>;

const hashName = (name: string): number => {
  let hash = 7;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const planetPalette = (planet: ExoplanetProfile): [number, number, number] => {
  const temperature = planet.observation.equilibriumTemperatureKelvin;
  if (temperature !== null && temperature >= 900) return [18, 35, 8];
  if (temperature !== null && temperature < 190) return [195, 215, 175];
  if (planet.kind === "gas-giant") return [34, 23, 52];
  if (planet.kind === "ice-giant") return [188, 205, 168];
  if (planet.kind === "rocky") return [156, 202, 118];
  return [255, 225, 280];
};

export const PlanetCatalogVisual = ({ planet }: { planet: ExoplanetProfile }) => {
  const hash = hashName(planet.name);
  const [hue, accent, shadow] = planetPalette(planet);
  const style: VisualStyle = {
    "--visual-accent": `${accent + (hash % 13)}deg`,
    "--visual-hue": `${hue + (hash % 17)}deg`,
    "--visual-shadow": `${shadow}deg`,
    "--visual-tilt": `${(hash % 25) - 12}deg`,
  };

  return (
    <span
      className={cx(`catalog-visual planet-catalog-visual ${planet.kind}`)}
      style={style}
      aria-hidden="true"
    >
      <span className={cx("catalog-orbit")} />
      <span className={cx("catalog-planet-sphere")} />
      <span className={cx("catalog-visual-glint")} />
    </span>
  );
};

export const StarCatalogVisual = ({ star }: { star: StarProfile }) => {
  const hash = hashName(star.name);
  const recipe = deriveStarRecipe(star);
  const rgb = recipe.color.map((channel) => Math.round(channel * 255)).join(" ");
  const size = 68 + ((recipe.radiusSceneUnits - 2.2) / (12 - 2.2)) * 56;
  const style: VisualStyle = {
    "--star-color": rgb,
    "--star-ray": `${hash % 90}deg`,
    "--star-size": `${Math.min(124, Math.max(68, size))}px`,
  };

  return (
    <span className={cx("catalog-visual star-catalog-visual")} style={style} aria-hidden="true">
      <span className={cx("catalog-star-rays")} />
      <span className={cx("catalog-star-core")} />
    </span>
  );
};

export const BlackHoleCatalogVisual = ({ blackHole }: { blackHole: BlackHoleProfile }) => {
  const style: VisualStyle = {
    "--black-hole-activity": blackHole.visual.diskActivity.toString(),
    "--black-hole-hue": `${blackHole.visual.diskHueDegrees}deg`,
    "--black-hole-tilt": `${blackHole.visual.diskTiltDegrees}deg`,
  };

  return (
    <span
      className={cx("catalog-visual black-hole-catalog-visual")}
      style={style}
      aria-hidden="true"
    >
      <span className={cx("black-hole-catalog-jet")} />
      <span className={cx("black-hole-catalog-disk rear")} />
      <span className={cx("black-hole-catalog-shadow")} />
      <span className={cx("black-hole-catalog-ring")} />
      <span className={cx("black-hole-catalog-disk front")} />
    </span>
  );
};
