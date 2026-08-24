import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CSSProperties } from "react";
import type { BlackHoleProfile } from "../black-holes.ts";

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
      className={`catalog-visual planet-catalog-visual ${planet.kind}`}
      style={style}
      aria-hidden="true"
    >
      <span className="catalog-orbit" />
      <span className="catalog-planet-sphere" />
      <span className="catalog-visual-glint" />
    </span>
  );
};

const spectralHue = (star: StarProfile): number => {
  const spectralClass = star.observation.spectralType?.match(/[OBAFGKM]/i)?.[0]?.toUpperCase();
  return (
    ({ O: 220, B: 215, A: 205, F: 48, G: 38, K: 24, M: 8 } as Record<string, number>)[
      spectralClass ?? ""
    ] ?? 42
  );
};

export const StarCatalogVisual = ({ star }: { star: StarProfile }) => {
  const hash = hashName(star.name);
  const style: VisualStyle = {
    "--star-bloom": `${54 + (hash % 18)}%`,
    "--star-hue": `${spectralHue(star)}deg`,
    "--star-ray": `${hash % 90}deg`,
  };

  // No glint. A glint is a specular highlight — light from somewhere else bouncing off a surface —
  // which is precisely the wrong thing to say about the object that IS the light source.
  return (
    <span className="catalog-visual star-catalog-visual" style={style} aria-hidden="true">
      <span className="catalog-star-rays" />
      <span className="catalog-star-core" />
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
    <span className="catalog-visual black-hole-catalog-visual" style={style} aria-hidden="true">
      <span className="black-hole-catalog-jet" />
      <span className="black-hole-catalog-disk rear" />
      <span className="black-hole-catalog-shadow" />
      <span className="black-hole-catalog-ring" />
      <span className="black-hole-catalog-disk front" />
    </span>
  );
};
