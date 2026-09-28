import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { deriveStarRecipe, deriveWorldRecipe, type Rgb, type WorldRecipe } from "@exora/worldgen";
import { useMemo, type CSSProperties } from "react";
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

const rgb = ([red, green, blue]: Rgb): string =>
  `${Math.round(red * 255)} ${Math.round(green * 255)} ${Math.round(blue * 255)}`;

const MAX_DRAWN_TILT_DEGREES = 28;

// Paints the card from the same recipe the renderer builds, so a thumbnail never promises a
// palette the world does not have.
const recipeVisualStyle = (recipe: WorldRecipe): VisualStyle => {
  const tilt = Math.max(
    -MAX_DRAWN_TILT_DEGREES,
    Math.min(MAX_DRAWN_TILT_DEGREES, recipe.axialTilt),
  );
  const shared = { "--visual-tilt": `${tilt.toFixed(1)}deg` };
  if (recipe.renderer === "gas-giant") {
    return {
      ...shared,
      "--visual-deep": rgb(recipe.cloudBands.deepColor),
      "--visual-light": rgb(recipe.cloudBands.lightColor),
      "--visual-mid": rgb(recipe.cloudBands.midColor),
    };
  }
  if (recipe.renderer === "ice-giant") {
    return {
      ...shared,
      "--visual-deep": rgb(recipe.atmosphereBands.deepColor),
      "--visual-light": rgb(recipe.atmosphereBands.lightColor),
      "--visual-mid": rgb(recipe.atmosphereBands.hazeColor),
    };
  }
  const { surface } = recipe;
  const place = (shift: number, minimum: number, span: number): string =>
    `${(minimum + ((recipe.seed >>> shift) % span)).toFixed(0)}%`;
  return {
    ...shared,
    "--visual-crater-a-x": place(0, 52, 22),
    "--visual-crater-a-y": place(5, 28, 22),
    "--visual-crater-b-x": place(10, 30, 24),
    "--visual-crater-b-y": place(15, 58, 20),
    "--visual-sea-x": place(20, 30, 30),
    "--visual-sea-y": place(25, 48, 26),
    "--visual-cloud": rgb(surface.cloudColor),
    "--visual-clouds": surface.cloudCover.toFixed(2),
    "--visual-deep": rgb(surface.lowColor),
    "--visual-glow": rgb(surface.emissiveColor),
    "--visual-lava": Math.min(1, surface.lavaStrength).toFixed(2),
    "--visual-light": rgb(surface.highColor),
    "--visual-mid": rgb(surface.midColor),
    "--visual-ocean": Math.min(0.85, surface.waterLevel).toFixed(2),
    "--visual-water": rgb(surface.waterColor),
  };
};

export const PlanetCatalogVisual = ({ planet }: { planet: ExoplanetProfile }) => {
  const style = useMemo(() => recipeVisualStyle(deriveWorldRecipe(planet)), [planet]);

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
