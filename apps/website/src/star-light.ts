import { temperatureToRgb, type Rgb } from "@exora/worldgen";

/*
 * THE LOCAL STAR'S LIGHT
 *
 * The interface takes its one colour from whatever star is lighting the destination: a world is
 * read under its host's light, a star under its own, a black hole under its disk. A raw blackbody
 * colour is too saturated to read as text on black — a 3,000 K dwarf is nearly pure orange — so it
 * is mixed toward starlight white, which keeps the hue and lifts the contrast.
 */

const SUN_KELVIN = 5_772;
const WHITE_MIX = 0.42;

const lift = (channel: number): number => Math.round((channel * (1 - WHITE_MIX) + WHITE_MIX) * 255);

const toTriplet = ([red, green, blue]: Rgb): string =>
  `${String(lift(red))} ${String(lift(green))} ${String(lift(blue))}`;

/** The light of a star at this temperature, as an `r g b` triplet; the Sun's when unknown. */
export const starLight = (temperatureKelvin: number | null | undefined): string =>
  toTriplet(
    temperatureToRgb(
      temperatureKelvin !== null &&
        temperatureKelvin !== undefined &&
        Number.isFinite(temperatureKelvin) &&
        temperatureKelvin > 0
        ? temperatureKelvin
        : SUN_KELVIN,
    ),
  );

const hslToRgb = (hueDegrees: number, saturation: number, lightness: number): Rgb => {
  const hue = (((hueDegrees % 360) + 360) % 360) / 60;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = chroma * (1 - Math.abs((hue % 2) - 1));
  const [red, green, blue] =
    hue < 1
      ? [chroma, second, 0]
      : hue < 2
        ? [second, chroma, 0]
        : hue < 3
          ? [0, chroma, second]
          : hue < 4
            ? [0, second, chroma]
            : hue < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const offset = lightness - chroma / 2;
  return [red + offset, green + offset, blue + offset];
};

/** The light of an accretion disk drawn at this hue. */
export const diskLight = (hueDegrees: number): string => toTriplet(hslToRgb(hueDegrees, 0.9, 0.56));
